#!/usr/bin/env bash
# 把 signal / 抓取脚本同步到生产机的独立运行环境 /opt/yeu-signal。
#
# 生产发布包只有 nitro 输出；脚本要跑 tsx，所以另建 /opt/yeu-signal（自带 node_modules）。
# 代码以本仓库为准，用本脚本推送，不从服务器上的 /www/wwwroot/yeu/repo 取（那个检出可能落后）。
#
# 用法：bash scripts/sync-signal-runtime.sh
# 依赖：ssh / scp，目标与私钥经 SSH_HOST / SSH_KEY 环境变量传入（必填，无内置默认值）。
set -euo pipefail

: "${SSH_HOST:?缺少 SSH_HOST（形如 user@host），配置见 docs/DEPLOYMENT.md}"
: "${SSH_KEY:?缺少 SSH_KEY（部署私钥路径）}"
REMOTE_DIR="${REMOTE_DIR:-/opt/yeu-signal}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$TARBALL"' EXIT

FILES=(
  scripts/signal-build.ts
  scripts/crawl-official-knowledge.ts
  scripts/load-env.ts
  scripts/ocr-short-documents.ts
  server/database/schema.ts
  server/database/client.ts
  server/database/migrate.ts
  server/modules/content/visibility.ts
  server/modules/knowledge/document-compiler.ts
  server/modules/knowledge/image-ocr.ts
  server/utils/serializers.ts
  server/utils/geo-cipher.ts
  shared/constants/server.ts
  shared/types/server.ts
  shared/utils/public-http-url.ts
  shared/utils/geo-obfuscation.ts
)

for path in "${FILES[@]}"; do
  install -D "$path" "$STAGE/$path"
done
cp -R server/modules/signal "$STAGE/server/modules/signal"
cp -R server/database/migrations "$STAGE/server/database/migrations"

TARBALL="$(mktemp -t yeu-signal-runtime-XXXXXX.tgz)"
tar -C "$STAGE" -czf "$TARBALL" .
scp -q -i "$SSH_KEY" -o StrictHostKeyChecking=no "$TARBALL" "$SSH_HOST:/tmp/yeu-signal-runtime.tgz"
rm -f "$TARBALL"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_HOST" "
  set -e
  tar -C '$REMOTE_DIR' -xzf /tmp/yeu-signal-runtime.tgz
  rm -f /tmp/yeu-signal-runtime.tgz
  # 生产库和线上进程共用，写锁等待要放宽，否则 compile 阶段会报 database is locked。
  sed -i \"s/busy_timeout = [0-9]*/busy_timeout = 120000/\" '$REMOTE_DIR/server/database/client.ts'
  chown -R yeu:yeu '$REMOTE_DIR'
  grep -n busy_timeout '$REMOTE_DIR/server/database/client.ts'
"
echo "synced -> $SSH_HOST:$REMOTE_DIR"
