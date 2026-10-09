#!/bin/bash
# 服务器端部署动作：在 deploy-home-sheet.sh（备份/冒烟/原子切换/失败自动回滚）之上追加
# 版本标记与持久日志。本地 scripts/deploy.sh 通过 ssh 执行本文件；
# Gitee 流水线（.workflow/）的主机部署阶段复用同一份。
# 环境变量：
#   RELEASE_ID   发布标识（必填，如 20261009-fix-foo）
#   DEPLOY_SHA   构建对应 git 完整提交号（必填，写入标记与 version.json）
#   DEPLOY_TS    时间戳（默认取当前时间）
#   ARCHIVE      发布 tar 包在服务器上的绝对路径（必填）
#   KEEP_RELEASES 维护时建议至少保留的 release 数量（默认 4；本脚本不删除历史）
# 核心部署脚本随制品传递，不覆盖服务器上的独立脚本。
set -euo pipefail

BASE="${YEU_BASE:-/www/wwwroot/yeu}"
KEEP_RELEASES="${KEEP_RELEASES:-4}"

: "${RELEASE_ID:?缺少 RELEASE_ID}"
: "${DEPLOY_SHA:?缺少 DEPLOY_SHA}"
: "${ARCHIVE:?缺少 ARCHIVE}"
DEPLOY_TS="${DEPLOY_TS:-$(date +%Y%m%d-%H%M%S)}"

[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "DEPLOY_SHA 必须是完整提交号" >&2; exit 1; }
[[ "$RELEASE_ID" =~ ^[0-9]{8}-[a-z0-9-]+$ ]] || { echo "RELEASE_ID 需形如 20261009-slug：$RELEASE_ID" >&2; exit 1; }
test -f "$ARCHIVE" || { echo "archive 不存在：$ARCHIVE（deploy-home-sheet.sh 按传入路径原样找文件，失败时静默 exit 1）" >&2; exit 1; }
mkdir -p "$BASE/shared/logs"
exec 9>"$BASE/shared/deploy.lock"
flock 9
test ! -e "$BASE/releases/$RELEASE_ID" || { echo "release 已存在：$RELEASE_ID（禁止同名重部署，换新标识）" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
test -f "$SCRIPT_DIR/deploy-home-sheet.sh"

echo "==> 执行核心部署（备份/冒烟/切换，失败自动回滚）"
ROLLBACK=""
DEPLOY_LOG="$BASE/shared/logs/deploy-$RELEASE_ID.log"
bash "$SCRIPT_DIR/deploy-home-sheet.sh" "$RELEASE_ID" "$ARCHIVE" 2>&1 | tee "$DEPLOY_LOG"
DEPLOY_OUTPUT="$(cat "$DEPLOY_LOG")"
ROLLBACK="$(sed -n 's/^rollback=//p' <<<"$DEPLOY_OUTPUT")"
BACKUP="$(sed -n 's/^backup=//p' <<<"$DEPLOY_OUTPUT")"

echo "==> 写部署标记（运行版本已由核心部署验证）"
MARKER="$BASE/releases/DEPLOYED-$DEPLOY_SHA-$DEPLOY_TS.txt"
cat > "$MARKER" <<EOF
release=$RELEASE_ID
commit=$DEPLOY_SHA
deployed_at=$DEPLOY_TS
rollback=$ROLLBACK
db_backup=$BACKUP
EOF
chmod 0644 "$MARKER"

echo "==> 保留历史 release 和备份；按维护计划显式归档（默认至少保留 $KEEP_RELEASES 个）"

echo "==> 部署完成：$RELEASE_ID（commit $DEPLOY_SHA）"
echo "    标记：$MARKER"
[[ "$ROLLBACK" == "$BASE/releases/"* ]] && test -f "$ROLLBACK/.output/server/index.mjs"
printf '    回滚：ln -sfn %q %q && sudo systemctl restart yeu.service\n' "$ROLLBACK" "$BASE/current"
