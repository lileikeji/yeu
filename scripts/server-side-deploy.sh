#!/bin/bash
# 服务器端部署动作：在 deploy-home-sheet.sh（备份/冒烟/原子切换/失败自动回滚）之上追加
# 版本标记、version.json 与旧 release 清理。本地 scripts/deploy.sh 通过 ssh 执行本文件；
# Gitee 流水线（.workflow/）的主机部署阶段复用同一份。
# 环境变量：
#   RELEASE_ID   发布标识（必填，如 20261009-fix-foo）
#   DEPLOY_SHA   构建对应 git 完整提交号（必填，写入标记与 version.json）
#   DEPLOY_TS    时间戳（默认取当前时间）
#   ARCHIVE      发布 tar 包在服务器上的绝对路径（必填）
#   KEEP_RELEASES 保留的 release 数量（默认 4，含本次）
# 前置：服务器 /www/wwwroot/yeu/ 已有 deploy-home-sheet.sh（本脚本会用仓库同目录的
#   deploy-home-sheet.sh 覆盖它，保持单一事实源）。
set -euo pipefail

BASE="${YEU_BASE:-/www/wwwroot/yeu}"
KEEP_RELEASES="${KEEP_RELEASES:-4}"

: "${RELEASE_ID:?缺少 RELEASE_ID}"
: "${DEPLOY_SHA:?缺少 DEPLOY_SHA}"
: "${ARCHIVE:?缺少 ARCHIVE}"
DEPLOY_TS="${DEPLOY_TS:-$(date +%Y%m%d-%H%M%S)}"

[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "DEPLOY_SHA 非法：$DEPLOY_SHA" >&2; exit 1; }
[[ "$RELEASE_ID" =~ ^[0-9]{8}-[a-z0-9-]+$ ]] || { echo "RELEASE_ID 需形如 20261009-slug：$RELEASE_ID" >&2; exit 1; }
test -f "$ARCHIVE" || { echo "archive 不存在：$ARCHIVE（deploy-home-sheet.sh 按传入路径原样找文件，失败时静默 exit 1）" >&2; exit 1; }
test ! -e "$BASE/releases/$RELEASE_ID" || { echo "release 已存在：$RELEASE_ID（禁止同名重部署，换新标识）" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/deploy-home-sheet.sh" ]; then
  install -m 0755 "$SCRIPT_DIR/deploy-home-sheet.sh" "$BASE/deploy-home-sheet.sh"
  echo "==> 已同步 deploy-home-sheet.sh（仓库版本）"
fi

echo "==> 执行核心部署（备份/冒烟/切换，失败自动回滚）"
ROLLBACK=""
DEPLOY_OUTPUT="$(bash "$BASE/deploy-home-sheet.sh" "$RELEASE_ID" "$ARCHIVE")"
echo "$DEPLOY_OUTPUT"
ROLLBACK="$(sed -n 's/^rollback=//p' <<<"$DEPLOY_OUTPUT")"
BACKUP="$(sed -n 's/^backup=//p' <<<"$DEPLOY_OUTPUT")"

echo "==> 写部署标记与 version.json"
MARKER="$BASE/releases/DEPLOYED-$DEPLOY_SHA-$DEPLOY_TS.txt"
cat > "$MARKER" <<EOF
release=$RELEASE_ID
commit=$DEPLOY_SHA
deployed_at=$DEPLOY_TS
rollback=$ROLLBACK
db_backup=$BACKUP
EOF
chmod 0644 "$MARKER"

VERSION_JSON="$BASE/current/.output/public/version.json"
cat > "$VERSION_JSON" <<EOF
{"commit":"$DEPLOY_SHA","release":"$RELEASE_ID","deployedAt":"$DEPLOY_TS"}
EOF
chown yeu:yeu "$VERSION_JSON" 2>/dev/null || true
chmod 0644 "$VERSION_JSON"
sleep 1
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/version.json?_=$DEPLOY_TS" || true)"
if [ "$HTTP_CODE" = "200" ]; then
  echo "==> version.json 已公开可读"
else
  echo "警告：version.json 返回 $HTTP_CODE（Nitro 可能不服务后写入的静态文件）；磁盘标记 $MARKER 仍有效" >&2
fi

echo "==> 清理旧 release（保留 $KEEP_RELEASES 个）"
cd "$BASE/releases"
ls -1dt */ 2>/dev/null | grep -v '^DEPLOYED' | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  echo "  删除 $old"
  rm -rf "${old%/}"
done

echo "==> 部署完成：$RELEASE_ID（commit $DEPLOY_SHA）"
echo "    标记：$MARKER"
echo "    回滚：ln -sfn $BASE/releases/$ROLLBACK $BASE/current && sudo systemctl restart yeu.service"
