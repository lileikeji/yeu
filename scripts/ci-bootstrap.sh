#!/usr/bin/env bash
set -euo pipefail
CI_CACHE="${HOME}/.cache/yeu-ci"
export npm_config_cache="$CI_CACHE/npm"
NODE_DIR="$CI_CACHE/node-v22.23.4"
PNPM_DIR="$CI_CACHE/pnpm-10.28.1"
mkdir -p "$CI_CACHE"
if [[ ! -x "$NODE_DIR/bin/node" ]]; then
  download="$(mktemp "$CI_CACHE/node.XXXXXX.tar.gz")"
  # 国内镜像优先（Gitee runner 到 nodejs.org 不稳），官方源兜底；两处 sha256 一致。
  curl --connect-timeout 10 --max-time 180 --retry 2 -fsSL \
    https://cdn.npmmirror.com/binaries/node/v22.23.4/node-v22.23.4-linux-x64.tar.gz -o "$download" \
    || curl --connect-timeout 10 --max-time 180 --retry 2 -fsSL \
      https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.gz -o "$download"
  printf 'b8492284c76a54baf58d61668dd0e41ee0fc98adabf9503d30f05d08f55b4406  %s\n' "$download" | sha256sum -c -
  mkdir -p "$NODE_DIR"
  tar -xzf "$download" -C "$NODE_DIR" --strip-components=1
  rm -f "$download"
fi
export PATH="$NODE_DIR/bin:$PNPM_DIR/bin:$PATH"
[[ "$(node --version)" == "v22.23.4" ]]
if [[ ! -x "$PNPM_DIR/bin/pnpm" ]]; then
  npm install --global --prefix "$PNPM_DIR" pnpm@10.28.1
fi
[[ "$(pnpm --version)" == "10.28.1" ]]
export NODE_OPTIONS=--max-old-space-size=3072
export CI=true
if ! pnpm install --frozen-lockfile --store-dir "$CI_CACHE/pnpm-store"; then
  echo "依赖安装失败，复用已下载缓存重试一次；再次失败停止发布" >&2
  pnpm install --frozen-lockfile --store-dir "$CI_CACHE/pnpm-store"
fi
node -e 'const Database=require("better-sqlite3");new Database(":memory:").close()'
echo "pnpm_store=$(pnpm store path --store-dir "$CI_CACHE/pnpm-store")"
echo "native_prebuild_cache=$npm_config_cache/_prebuilds"
