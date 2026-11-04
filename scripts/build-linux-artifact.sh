#!/bin/bash
# 在 Windows / macOS 本机产出可上线的 Linux 制品，不占用生产服务器构建。
#
# 背景：生产机是 4 核 / 3.6G，跑一次 nuxt build 要 40 分钟以上（还 OOM 过一次，exit 137）；
# 本机 16 核同样代码 107 秒。Nuxt 产物是 JS，真正跟平台绑定的只有两个二进制：
#   .output/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node
#   .output/server/node_modules/sqlite-vec-<os>-<arch>/
# 本机构建时排除这两个，上传后从线上 current 复制 ELF 覆盖，其余内容跨平台一致。
#
# 用法：
#   bash scripts/build-linux-artifact.sh
# 脚本完成构建 → 打包 → 上传 → 服务器补齐二进制 → 临时端口冒烟，并打印后续部署命令。
# 备份/切换/回滚仍走 scripts/server-side-deploy.sh，本脚本不碰 current。
set -euo pipefail

DEPLOY_SERVER="${DEPLOY_SERVER:-root@***REMOVED***}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/***REMOVED***}"
REMOTE_STAGE="${REMOTE_STAGE:-/root/yeu-deploy}"
SMOKE_PORT="${SMOKE_PORT:-4093}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ssh_run() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$DEPLOY_SERVER" "$@"; }

echo "==> [1/6] 基线与平台二进制版本核对"
SHA="$(git rev-parse HEAD)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]]
LOCAL_SQLITE="$(node -p "require('./node_modules/better-sqlite3/package.json').version")"
REMOTE_SQLITE="$(ssh_run "node -p \"require('/www/wwwroot/yeu/current/.output/server/node_modules/better-sqlite3/package.json').version\"" 2>/dev/null | tr -d '\r' || true)"
echo "    commit=$SHA better-sqlite3 本地=$LOCAL_SQLITE 线上=$REMOTE_SQLITE"
if [[ "$LOCAL_SQLITE" != "$REMOTE_SQLITE" ]]; then
  echo "better-sqlite3 版本与线上不一致，不能复用线上 ELF，改用 Linux 环境构建" >&2
  exit 1
fi

echo "==> [2/6] 构建（pnpm build）"
BUILD_START="$(mktemp)"
pnpm build
test -f .output/server/index.mjs || { echo "构建产物缺失 .output/server/index.mjs" >&2; exit 1; }
test .output/server/index.mjs -nt "$BUILD_START" || { echo "构建入口未刷新，拒绝旧产物" >&2; exit 1; }
rm -f "$BUILD_START"

# release.json / deploy/release-tools.mjs / deploy/migrations 由 create 一次性写入产物，
# 缺任何一个 deploy-home-sheet.sh 都会直接退出；release.json 还是 /version.json 的唯一数据源
# （server/utils/release-version.ts 要求 commit 是完整 40 位、release 匹配 ^\d{8}-[a-z0-9-]+$）。
RELEASE_ID="$(date +%Y%m%d)-local-$(date +%H%M%S)"
node scripts/release-tools.mjs create .output "$RELEASE_ID" "$SHA" > /dev/null
echo "    release.json: $(tr -d '\n ' < .output/release.json | head -c 120)"

echo "==> [3/6] 打包（排除平台二进制；-h 跟随 pnpm 符号链接，否则运行期缺包）"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
tar -czhf "$STAGE/release.tar.gz" --exclude='*.node' --exclude='sqlite-vec-windows-x64' \
  --exclude='sqlite-vec-darwin-*' .output
echo "    $(du -h "$STAGE/release.tar.gz" | cut -f1)"

echo "==> [4/6] 上传并补齐 ELF 二进制"
ssh_run "mkdir -p $REMOTE_STAGE"
# 工作区 core.autocrlf=true，直接 scp 会把 CRLF 带上 Linux，bash 报 $'\r' 语法错误。
for f in scripts/server-side-deploy.sh scripts/deploy-home-sheet.sh; do
  tr -d '\r' < "$f" > "$STAGE/$(basename "$f")"
done
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -q \
  "$STAGE/release.tar.gz" "$STAGE/server-side-deploy.sh" "$STAGE/deploy-home-sheet.sh" \
  "$DEPLOY_SERVER:$REMOTE_STAGE/"
ssh_run "set -e
  rm -rf $REMOTE_STAGE/build && mkdir -p $REMOTE_STAGE/build
  tar xzf $REMOTE_STAGE/release.tar.gz -C $REMOTE_STAGE/build
  CUR=/www/wwwroot/yeu/current/.output/server/node_modules
  # 线上 current 可能缺 sqlite-vec 的平台包（20261103-233258 就没有），回退到最近一个带的 release。
  # 历史 release 有两种布局（<id>/.output/server/node_modules 与 <id>/server/node_modules），按目录名找。
  if [ ! -d \"\$CUR/sqlite-vec-linux-x64\" ]; then
    ALT=\$(find /data/yeu/releases -maxdepth 7 -type d -name sqlite-vec-linux-x64 2>/dev/null | head -1)
    [ -n \"\$ALT\" ] && CUR=\$(dirname \"\$ALT\")
    echo \"    sqlite-vec 回退源：\$CUR\"
  fi
  NEW=$REMOTE_STAGE/build/.output/server/node_modules
  mkdir -p \$NEW/better-sqlite3/build/Release
  cp -f \$CUR/better-sqlite3/build/Release/better_sqlite3.node \$NEW/better-sqlite3/build/Release/
  rm -rf \$NEW/sqlite-vec-linux-x64 && cp -r \$CUR/sqlite-vec-linux-x64 \$NEW/
  test -f \$NEW/better-sqlite3/build/Release/better_sqlite3.node
  # create 记录的 native.hash 是本机 Windows 二进制的摘要，换成 ELF 后必须重算，
  # 否则 deploy-home-sheet.sh 的 native 校验会报「SQLite 原生模块摘要不匹配」。
  node -e \"const fs=require('fs'),c=require('crypto');const [p,n]=process.argv.slice(1);const m=JSON.parse(fs.readFileSync(p,'utf8'));m.native.hash=c.createHash('sha256').update(fs.readFileSync(n)).digest('hex');m.platform=process.platform;m.arch=process.arch;m.node=process.version;m.abi=process.versions.modules;fs.writeFileSync(p,JSON.stringify(m)+'\\n')\" $REMOTE_STAGE/build/.output/release.json \$NEW/better-sqlite3/build/Release/better_sqlite3.node
  echo \"    native.hash=\$(grep -o '\\\"hash\\\":\\\"[0-9a-f]\\{8\\}' \$REMOTE_STAGE/build/.output/release.json | tail -1)\"
  echo \"    modules=\$(ls \$NEW | wc -l)\""

echo "==> [5/6] 临时端口冒烟（$SMOKE_PORT，不碰 current）"
ssh_run "cd $REMOTE_STAGE/build/.output/server && NUXT_DATABASE_PATH=/tmp/yeu-smoke.sqlite PORT=$SMOKE_PORT HOST=127.0.0.1 NODE_ENV=production setsid nohup node index.mjs > /tmp/yeu-smoke.log 2>&1 &
  sleep 12
  code=\$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:$SMOKE_PORT/ || true)
  fuser -k $SMOKE_PORT/tcp >/dev/null 2>&1 || true
  rm -f /tmp/yeu-smoke.sqlite
  echo \"    HTTP=\$code\"
  test \"\$code\" = 200 || { echo '冒烟失败，看 /tmp/yeu-smoke.log' >&2; exit 1; }"

echo "==> [6/6] 制品就绪，切换仍走生产发布流程"
cat <<EOF
    ARCHIVE=$REMOTE_STAGE/release.tar.gz
    RELEASE_ID=$RELEASE_ID
    DEPLOY_SHA=$SHA
    打包成部署制品并切换（备份/冒烟/切换/回滚由 server-side-deploy.sh 执行）：
    ssh -i $SSH_KEY $DEPLOY_SERVER "cd $REMOTE_STAGE/build && tar -czf $REMOTE_STAGE/release-bundle.tar.gz .output && RELEASE_ID=$RELEASE_ID DEPLOY_SHA=$SHA ARCHIVE=$REMOTE_STAGE/release-bundle.tar.gz bash $REMOTE_STAGE/server-side-deploy.sh"
EOF
