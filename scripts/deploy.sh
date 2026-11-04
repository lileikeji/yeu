#!/bin/bash
# 一键发布：闸门检查 → 测试 → 构建 → 制品核验 → 上传 → 服务器部署。
# 服务器端动作见 scripts/server-side-deploy.sh（与 Gitee 流水线共用同一份）。
# 用法：
#   bash scripts/deploy.sh                  # 全量闸门 + 部署
#   bash scripts/deploy.sh --slug <name>    # release 使用日期、名称、时间和随机后缀
#   bash scripts/deploy.sh --dry-run        # 只跑闸门与构建，不上传不部署
# 生产制品必须在 Linux 构建。Windows/macOS 开发机用 scripts/build-linux-artifact.sh：
# 本机 pnpm build → 只传 14M 产物 → 服务器补 Linux 原生模块 → 冒烟。
# 不要在生产机上 pnpm build：4 核 / 3.6G 内存，单次 40 分钟起，还会 OOM（exit 137）。
# 服务器与路径可用环境变量覆盖：DEPLOY_SERVER / YEU_BASE / SSH_KEY
set -euo pipefail

DO_DEPLOY=1
SLUG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DO_DEPLOY=0; shift ;;
    --slug) [ $# -ge 2 ] || { echo "--slug 需要名称参数" >&2; exit 1; }; SLUG="$2"; shift 2 ;;
    --slug=*) SLUG="${1#--slug=}"; shift ;;
    *) echo "未知参数：$1（支持 --slug <name> / --dry-run）" >&2; exit 1 ;;
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
    echo "拒绝发布：工作区有未提交改动。线上必须能对应到一个 commit。" >&2
    echo "请先明确提交本次相关改动，再发布。" >&2
    git status --porcelain | head -20 >&2
    exit 1
fi
echo "    commit=$SHA"
if [[ "$DO_DEPLOY" == "1" && "$(node -p 'process.platform')" != "linux" ]]; then
  echo "生产发布需要 Linux 制品。Windows/macOS 请用 bash scripts/build-linux-artifact.sh 在本机构建后上传。" >&2
  echo "不要转到生产服务器上 pnpm build：4 核 / 3.6G，单次 40 分钟起，且会 OOM（exit 137）。" >&2
  exit 1
fi

echo "==> [2/7] 检索缓存版本检查"
echo "    服务端以当前已部署 release 的摘要核验缓存版本，不能绕过。"
echo "==> [3/7] 全量质量检查"
pnpm lint
pnpm typecheck
pnpm test

echo "==> [4/7] 构建（pnpm build）"
BUILD_LOG="$(mktemp /tmp/yeu-build-XXXXXX.log)"
BUILD_START="$(mktemp /tmp/yeu-build-start-XXXXXX)"
trap 'rm -f "$BUILD_START"' EXIT
BUILD_EXIT=0
pnpm build >"$BUILD_LOG" 2>&1 || BUILD_EXIT=$?
if [[ "$BUILD_EXIT" != "0" ]]; then
  echo "构建失败：BUILD_EXIT=$BUILD_EXIT（注意 OOM 时 pnpm 只打 ELIFECYCLE，看日志尾部确认）" >&2
  tail -40 "$BUILD_LOG" >&2
  exit 1
fi
grep -q "ELIFECYCLE" "$BUILD_LOG" && { echo "构建日志含 ELIFECYCLE，疑似失败但 exit code 为 0，人工检查：$BUILD_LOG" >&2; exit 1; }
rm -f "$BUILD_LOG"
test -f .output/server/index.mjs || { echo "构建产物缺失 .output/server/index.mjs" >&2; exit 1; }
test .output/server/index.mjs -nt "$BUILD_START" || { echo "构建入口未刷新，拒绝旧产物" >&2; exit 1; }
echo "    BUILD_EXIT=0"
DEPLOY_TS="$(date +%Y%m%d-%H%M%S)"
DATE_PART="$(date +%Y%m%d)"
if [ -n "$SLUG" ]; then
  [[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "slug 只能使用小写字母、数字和连字符" >&2; exit 1; }
  RELEASE_ID="$DATE_PART-$SLUG-$(date +%H%M%S)-$(openssl rand -hex 4)"
else
  RELEASE_ID="$DATE_PART-$(git rev-parse --short HEAD)-$(date +%H%M%S)-$(openssl rand -hex 4)"
fi
node scripts/release-tools.mjs create .output "$RELEASE_ID" "$SHA"
node scripts/release-tools.mjs native .output
pnpm bundle:budget
pnpm pwa:build:test
pnpm e2e:run

echo "==> [5/7] 打包与制品核验"
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
RUN_STAGE="$REMOTE_STAGE/$RELEASE_ID"
ssh "${SSH_OPTS[@]}" "$DEPLOY_SERVER" "mkdir -p '$RUN_STAGE'"
scp "${SSH_OPTS[@]}" "$ARCHIVE" "$DEPLOY_SERVER:$RUN_STAGE/yeu-dist.tar.gz"
scp "${SSH_OPTS[@]}" scripts/server-side-deploy.sh scripts/deploy-home-sheet.sh "$DEPLOY_SERVER:$RUN_STAGE/"

echo "==> [7/7] 服务器部署"
ssh "${SSH_OPTS[@]}" "$DEPLOY_SERVER" \
  "RELEASE_ID='$RELEASE_ID' DEPLOY_SHA='$SHA' DEPLOY_TS='$DEPLOY_TS' ARCHIVE='$RUN_STAGE/yeu-dist.tar.gz' bash '$RUN_STAGE/server-side-deploy.sh'"
echo ""
echo "发布纪要：发布后按惯例在 docs/DEPLOY_NOTES_2026-09-04-qa-cards.md 追加本次 release 一节。"
