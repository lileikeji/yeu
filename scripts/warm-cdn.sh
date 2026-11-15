#!/bin/bash
# CDN 预热：把当前 release 的静态资源逐个从边缘拉一遍，让 CDN 立刻持有副本。
#
# 背景：源站出口只有 3Mbps，未预热的 /_nuxt/* 第一次访问必须回源，
# 打开一个页面要拉十几个 chunk，开场瞬间会把出口打满（2026-11-14 初赛前实测）。
# 预热后 chunk 走边缘，源站只需要扛 HTML 与 /api。
#
# 用法（本机）：
#   DEPLOY_SERVER=root@<host> SSH_KEY=~/.ssh/key bash scripts/warm-cdn.sh
# 用法（服务器上，直接扫本地 release 目录）：
#   bash scripts/warm-cdn.sh --release-dir /data/yeu/releases/<id>
#
# 可选环境变量：
#   BASE_URL            默认 https://yx.huiliyill.cn
#   CONCURRENCY         并发数，默认 16
#   MIN_HIT_RATE        边缘命中率下限（百分比），默认 95，低于此值退出码 1
#   REMOTE_RELEASE_DIR  远端 release 入口，默认 /data/yeu/current
set -euo pipefail

BASE_URL="${BASE_URL:-https://yx.huiliyill.cn}"
CONCURRENCY="${CONCURRENCY:-16}"
MIN_HIT_RATE="${MIN_HIT_RATE:-95}"
REMOTE_RELEASE_DIR="${REMOTE_RELEASE_DIR:-/data/yeu/current}"
RELEASE_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release-dir) RELEASE_DIR="${2:-}"; shift 2 ;;
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --concurrency) CONCURRENCY="${2:-}"; shift 2 ;;
    --min-hit-rate) MIN_HIT_RATE="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

# Git Bash 里的 /c/Users/... 与 Windows 版 ssh 不兼容，统一换成 C:/...
if [[ "${SSH_KEY:-}" == /[a-zA-Z]/* ]]; then
  SSH_KEY="$(printf %s "$SSH_KEY" | sed -E 's#^/([a-zA-Z])/#\U\1:/#')"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
LIST="$TMP_DIR/assets.txt"
FIRST="$TMP_DIR/warm.txt"
SECOND="$TMP_DIR/verify.txt"

list_local() {
  local root="$1/.output/public"
  [[ -d "$root" ]] || { echo "找不到静态资源目录：$root" >&2; exit 2; }
  cd "$root"
  {
    find _nuxt -type f
    find . -maxdepth 1 -type f | sed 's#^\./##'
  } | sort -u
}

list_remote() {
  : "${DEPLOY_SERVER:?缺少 DEPLOY_SERVER，或改用 --release-dir 在服务器上直接跑}"
  : "${SSH_KEY:?缺少 SSH_KEY}"
  local script
  script=$(cat <<'REMOTE'
R=$(readlink -f "$1")
cd "$R/.output/public" || exit 3
{ find _nuxt -type f; find . -maxdepth 1 -type f | sed 's#^\./##'; } | sort -u
REMOTE
)
  printf '%s' "$script" | base64 | tr -d '\n' |
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$DEPLOY_SERVER" \
      "base64 -d > /tmp/yeu-warm-list.sh && bash /tmp/yeu-warm-list.sh '$REMOTE_RELEASE_DIR' && rm -f /tmp/yeu-warm-list.sh"
}

echo "==> [1/3] 收集当前 release 的静态资源"
if [[ -n "$RELEASE_DIR" ]]; then
  list_local "$RELEASE_DIR" > "$LIST"
else
  list_remote > "$LIST"
fi

# 这些是源站主动 no-store 的（Service Worker 与爬虫约定），预热没有意义。
grep -Ev '^(robots\.txt|site\.webmanifest|sw-[^/]*\.js)$' "$LIST" > "$LIST.tmp" && mv "$LIST.tmp" "$LIST"
TOTAL="$(wc -l < "$LIST" | tr -d ' ')"
echo "    待预热 $TOTAL 个 URL（已排除 no-store 的 robots/sw/manifest）"

warm_one() {
  local path="$1" code
  # 用 if ! 而不是 || echo：curl 有时先打印 http_code 再非零退出，拼起来会变成 200000。
  if ! code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$BASE_URL/$path" 2>/dev/null)"; then
    code=000
  fi
  if [[ "$code" != 2* ]]; then
    if ! code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$BASE_URL/$path" 2>/dev/null)"; then
      code=000
    fi
  fi
  printf '%s %s\n' "$code" "$path"
}
export -f warm_one
export BASE_URL

echo "==> [2/3] 边缘拉取（并发 $CONCURRENCY）"
START_TS=$(date +%s)
xargs -r -P "$CONCURRENCY" -I{} bash -c 'warm_one "$@"' _ {} < "$LIST" > "$FIRST"
COST=$(( $(date +%s) - START_TS ))
OK="$(awk '$1 == 200' "$FIRST" | wc -l | tr -d ' ')"
BAD="$(awk '$1 != 200' "$FIRST" | wc -l | tr -d ' ')"
echo "    ${COST}s 内完成：200=$OK，非 200=$BAD"
if [[ "$BAD" != "0" ]]; then
  echo "    非 200 明细："
  awk '$1 != 200' "$FIRST" | head -10 | sed 's/^/      /'
fi

echo "==> [3/3] 复核边缘命中率（下限 ${MIN_HIT_RATE}%）"
verify_one() {
  local path="$1" head
  head="$(curl -s -o /dev/null -D - --max-time 30 "$BASE_URL/$path" | tr -d '\r')"
  if grep -qi 'X-Cache-Lookup: Cache Hit' <<<"$head"; then
    printf 'HIT %s\n' "$path"
  elif grep -qi '^Cache-Control:.*no-store' <<<"$head"; then
    # 源站主动 no-store 的（robots、校验 txt、SW 等），本来就不该进 CDN。
    printf 'SKIP %s\n' "$path"
  else
    printf 'MISS %s\n' "$path"
  fi
}
export -f verify_one
export BASE_URL
xargs -r -P "$CONCURRENCY" -I{} bash -c 'verify_one "$@"' _ {} < "$LIST" > "$SECOND"

HIT="$(grep -c '^HIT' "$SECOND" || true)"
MISS="$(grep -c '^MISS' "$SECOND" || true)"
SKIP="$(grep -c '^SKIP' "$SECOND" || true)"
TOTAL_CHECK=$((HIT + MISS))
RATE=$(( TOTAL_CHECK > 0 ? HIT * 100 / TOTAL_CHECK : 0 ))
echo "    命中 $HIT / $TOTAL_CHECK（${RATE}%），另有 $SKIP 个源站 no-store 不参与统计"
if [[ "$MISS" != "0" ]]; then
  echo "    仍为 MISS 的前 10 条（首次回源，可重跑一次）："
  grep '^MISS' "$SECOND" | head -10 | awk '{print "      " $2}'
fi

if [[ "$RATE" -lt "$MIN_HIT_RATE" ]]; then
  echo "    命中率低于 ${MIN_HIT_RATE}%，预热未达标" >&2
  exit 1
fi
echo "==> 预热完成：$BASE_URL"
