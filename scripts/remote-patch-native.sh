#!/bin/bash
# 在服务器上把本机制品补齐成 Linux 可运行：换 better-sqlite3 ELF、补 sqlite-vec-linux-x64、
# 重算 native.hash。由 scripts/build-linux-artifact.sh 上传后执行，参数是暂存目录。
#
# 为什么单独成文件：这些动作原先写在 `ssh_run "...\\$CUR ..."` 的嵌套转义里，实测
# `$REMOTE_STAGE` 在远端被展开成空（日志里 `grep: stray \ before "`、
# `/build/.output/release.json: No such file or directory`），native.hash 静默不更新，
# 随后 deploy-home-sheet.sh 的 native 校验会以「SQLite 原生模块摘要不匹配」拒绝发布。
# 文件化后只剩一次参数传递，没有嵌套引号。
set -euo pipefail

STAGE="${1:?用法: remote-patch-native.sh <stage 目录>}"
BASE="${YEU_BASE:-/www/wwwroot/yeu}"
BUILD="$STAGE/build"
OUT="$BUILD/.output"
BINARY="$OUT/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
VEC="$OUT/server/node_modules/sqlite-vec-linux-x64"

test -f "$STAGE/release.tar.gz" || { echo "缺制品：$STAGE/release.tar.gz" >&2; exit 1; }

rm -rf "$BUILD"
mkdir -p "$BUILD"
tar xzf "$STAGE/release.tar.gz" -C "$BUILD"

# 线上 current 可能缺 sqlite-vec 的平台包（20261103-233258 就没有），回退到最近一个带的 release。
# 历史 release 有两种布局（<id>/.output/server/node_modules 与 <id>/server/node_modules），按目录名找。
CUR="$BASE/current/.output/server/node_modules"
if [ ! -d "$CUR/sqlite-vec-linux-x64" ]; then
  REAL_BASE="$(readlink -f "$BASE")"
  ALT="$(find "$REAL_BASE/releases" -maxdepth 7 -type d -name sqlite-vec-linux-x64 2>/dev/null | head -1)"
  if [ -n "$ALT" ]; then
    CUR="$(dirname "$ALT")"
    echo "    sqlite-vec 回退源：$CUR"
  fi
fi
test -f "$CUR/better-sqlite3/build/Release/better_sqlite3.node" || {
  echo "找不到可复用的 better_sqlite3.node：$CUR" >&2
  exit 1
}
test -d "$CUR/sqlite-vec-linux-x64" || {
  echo "找不到可复用的 sqlite-vec-linux-x64：$CUR" >&2
  exit 1
}

mkdir -p "$(dirname "$BINARY")"
cp -f "$CUR/better-sqlite3/build/Release/better_sqlite3.node" "$BINARY"
rm -rf "$VEC"
cp -r "$CUR/sqlite-vec-linux-x64" "$VEC"
test -f "$BINARY"

# create 记录的 native.hash 是本机 Windows 二进制的摘要，换成 ELF 后必须重算，
# 否则 deploy-home-sheet.sh 的 native 校验会拒绝发布。
node -e '
const fs = require("fs"), crypto = require("crypto");
const [metadataPath, binaryPath] = process.argv.slice(1);
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
metadata.native = metadata.native || {};
metadata.native.hash = crypto.createHash("sha256").update(fs.readFileSync(binaryPath)).digest("hex");
metadata.platform = process.platform;
metadata.arch = process.arch;
metadata.node = process.version;
metadata.abi = process.versions.modules;
fs.writeFileSync(metadataPath, JSON.stringify(metadata) + "\n");
console.log("    native.hash=" + metadata.native.hash.slice(0, 8) + " platform=" + metadata.platform + "-" + metadata.arch);
' "$OUT/release.json" "$BINARY"

echo "    modules=$(ls "$OUT/server/node_modules" | wc -l)"
