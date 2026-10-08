#!/bin/bash
# 一键发布：闸门检查 → 测试 → 构建 → 制品核验 → 上传 → 服务器部署。
# 服务器端动作见 scripts/server-side-deploy.sh（与 Gitee 流水线共用同一份）。
# 用法：
#   bash scripts/deploy.sh                  # 全量闸门 + 部署
#   bash scripts/deploy.sh --slug <name>    # release 标识为 <YYYYMMDD>-<name>（默认用短 sha）
#   bash scripts/deploy.sh --dry-run        # 只跑闸门与构建，不上传不部署
#   bash scripts/deploy.sh --no-test        # 跳过 pnpm test（输出显式提示；仅紧急修复）
#   bash scripts/deploy.sh --allow-dirty    # 允许未提交改动发布（显式警告；正常流程禁止）
# 服务器与路径可用环境变量覆盖：DEPLOY_SERVER / YEU_BASE / SSH_KEY
set -euo pipefail

DO_TEST=1
DO_DEPLOY=1
ALLOW_DIRTY=0
CACHE_ACKED=0
SLUG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-test) DO_TEST=0; shift ;;
    --dry-run) DO_DEPLOY=0; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    --cache-version-acked) CACHE_ACKED=1; shift ;;
    --slug) [ $# -ge 2 ] || { echo "--slug 需要名称参数" >&2; exit 1; }; SLUG="$2"; shift 2 ;;
    --slug=*) SLUG="${1#--slug=}"; shift ;;
    *) echo "未知参数：$1（支持 --slug <name> / --dry-run / --no-test / --allow-dirty / --cache-version-acked）" >&2; exit 1 ;;
  esac
done

DEPLOY_SERVER="${DEPLOY_SERVER:-root@***REMOVED***}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/***REMOVED***}"
REMOTE_STAGE="/root/yeu-deploy"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> [1/7] Git 基线检查"
SHA="$(git rev-parse HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  if [ "$ALLOW_DIRTY" = "1" ]; then
    echo "警告：工作区有未提交改动，本次制品无法对应到任何 commit（--allow-dirty）" >&2
    echo "改动预览：" >&2
    git status --porcelain | head -20 >&2
    sleep 3
  else
    echo "拒绝发布：工作区有未提交改动。线上必须能对应到一个 commit。" >&2
    echo "先提交改动（git add -A && git commit），或确认理解风险后用 --allow-dirty。" >&2
    git status --porcelain | head -20 >&2
    exit 1
  fi
fi
echo "    commit=$SHA"

echo "==> [2/7] 检索缓存版本检查"
SERVICE="server/modules/assistant/service.ts"
CUR_CACHE="$(sed -n "s/^const ASSISTANT_CACHE_VERSION = '\([^']*\)'.*/\1/p" "$SERVICE" || true)"
HEAD_CACHE="$(git show "HEAD:$SERVICE" 2>/dev/null | sed -n "s/^const ASSISTANT_CACHE_VERSION = '\([^']*\)'.*/\1/p" || true)"
TOUCHED_RETRIEVAL="$(git diff --name-only HEAD -- server/modules/assistant server/api/public/assistant server/api/public/assistant.stream.post.ts server/utils/assistant-config.ts shared/utils/assistant-query.ts 2>/dev/null | wc -l)"
if [ "$TOUCHED_RETRIEVAL" -gt 0 ] && [ -n "$CUR_CACHE" ] && [ "$CUR_CACHE" = "$HEAD_CACHE" ]; then
  if [ "$CACHE_ACKED" = "1" ]; then
    echo "    已确认缓存版本无需 bump（--cache-version-acked）：$CUR_CACHE"
  elif [ -t 0 ]; then
    echo "检测到检索/算分相关文件改动，但 ASSISTANT_CACHE_VERSION 未变（当前 $CUR_CACHE）。" >&2
    echo "同版本号会让线上两层缓存（表+进程内存）继续发旧答案。确认已 bump 或确属无需 bump：" >&2
    read -r -p "输入 yes 继续：" ack
    [ "$ack" = "yes" ] || { echo "已中止。改 $SERVICE 的 ASSISTANT_CACHE_VERSION 后重试。" >&2; exit 1; }
  else
    echo "拒绝发布：检索/算分相关文件有改动但 ASSISTANT_CACHE_VERSION 未变（$CUR_CACHE），且当前非交互环境无法确认。" >&2
    echo "改 $SERVICE bump 版本号后重试；确属无需 bump 时加 --cache-version-acked。" >&2
    exit 1
  fi
else
  echo "    ASSISTANT_CACHE_VERSION=$CUR_CACHE（无检索改动或已 bump）"
fi

if [ "$DO_TEST" = "1" ]; then
  echo "==> [3/7] 全量测试（pnpm test）"
  pnpm test
else
  echo "==> [3/7] 跳过测试（--no-test；仅紧急修复可用，发布纪要必须注明）"
fi

echo "==> [4/7] 构建（pnpm build）"
BUILD_LOG="$(mktemp /tmp/yeu-build-XXXXXX.log)"
if ! pnpm build >"$BUILD_LOG" 2>&1; then
  BUILD_EXIT=$?
  echo "构建失败：BUILD_EXIT=$BUILD_EXIT（注意 OOM 时 pnpm 只打 ELIFECYCLE，看日志尾部确认）" >&2
  tail -40 "$BUILD_LOG" >&2
  exit 1
fi
grep -q "ELIFECYCLE" "$BUILD_LOG" && { echo "构建日志含 ELIFECYCLE，疑似失败但 exit code 为 0，人工检查：$BUILD_LOG" >&2; exit 1; }
rm -f "$BUILD_LOG"
test -f .output/server/index.mjs || { echo "构建产物缺失 .output/server/index.mjs" >&2; exit 1; }
echo "    BUILD_EXIT=0"

echo "==> [5/7] 打包与制品核验"
DEPLOY_TS="$(date +%Y%m%d-%H%M%S)"
DATE_PART="$(date +%Y%m%d)"
if [ -n "$SLUG" ]; then
  RELEASE_ID="$DATE_PART-$(echo "$SLUG" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed 's/-*$//')"
else
  RELEASE_ID="$DATE_PART-$(git rev-parse --short HEAD)"
fi
ARCHIVE="$ROOT/yeu-dist-$RELEASE_ID.tar.gz"
tar -czhf "$ARCHIVE" .output
SIZE="$(stat -c%s "$ARCHIVE")"
MD5="$(md5sum "$ARCHIVE" | cut -d' ' -f1)"
STATE=".deploy-state.json"
if [ -f "$STATE" ]; then
  PREV_MD5="$(sed -n 's/.*"md5":"\([^"]*\)".*/\1/p' "$STATE")"
  PREV_SIZE="$(sed -n 's/.*"size":\([0-9]*\).*/\1/p' "$STATE")"
  if [ "$MD5" = "$PREV_MD5" ]; then
    echo "拒绝发布：制品 md5 与上一次完全相同（$MD5）——这是旧产物（hijack-fix2 事故）。" >&2
    echo "若代码确实无变化则无需发布；否则检查构建是否真的执行。" >&2
    exit 1
  fi
  echo "    与上次制品不同：size $PREV_SIZE → $SIZE"
fi
printf '{"release":"%s","commit":"%s","size":%s,"md5":"%s","ts":"%s"}\n' \
  "$RELEASE_ID" "$SHA" "$SIZE" "$MD5" "$DEPLOY_TS" > "$STATE"

if [ "$DO_DEPLOY" = "0" ]; then
  echo "==> dry-run 完成：$ARCHIVE（未上传未部署）"
  exit 0
fi

echo "==> [6/7] 上传制品与部署脚本"
SSH_OPTS=(-i "$SSH_KEY" -o ConnectTimeout=15)
ssh "${SSH_OPTS[@]}" "$DEPLOY_SERVER" "mkdir -p $REMOTE_STAGE"
scp "${SSH_OPTS[@]}" "$ARCHIVE" "$DEPLOY_SERVER:$REMOTE_STAGE/yeu-dist.tar.gz"
scp "${SSH_OPTS[@]}" scripts/server-side-deploy.sh scripts/deploy-home-sheet.sh "$DEPLOY_SERVER:$REMOTE_STAGE/"
rm -f "$ARCHIVE"

echo "==> [7/7] 服务器部署"
ssh "${SSH_OPTS[@]}" "$DEPLOY_SERVER" \
  "RELEASE_ID='$RELEASE_ID' DEPLOY_SHA='$SHA' DEPLOY_TS='$DEPLOY_TS' ARCHIVE='$REMOTE_STAGE/yeu-dist.tar.gz' bash $REMOTE_STAGE/server-side-deploy.sh"
echo ""
echo "发布纪要：发布后按惯例在 docs/DEPLOY_NOTES_2026-09-04-qa-cards.md 追加本次 release 一节。"
