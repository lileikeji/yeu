#!/usr/bin/env bash
# 双向同步一键脚本：拉取 Gitee 组织仓库（含网页合并的 PR）后双推 Gitee + GitHub。
#
# 用法：bash scripts/sync-remotes.sh
# 场景：在 Gitee 网页上合并了 PR、或他人直接推了 Gitee 之后，把新提交带回
# 本地并同步到 GitHub（本地 master 落后时快进；出现分叉会停下要求人工处理）。
# GitHub 侧的新提交不需要本脚本——由 .github/workflows/mirror-to-gitee.yml 自动回推 Gitee。
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch yuex
if ! git merge --ff-only yuex/master; then
  echo "本地与 Gitee 出现分叉，拒绝自动合并；请人工处理后重跑。" >&2
  exit 1
fi
# yuex 配有双 push 地址（Gitee 组织 + GitHub），一条命令同步两端。
git push yuex master
echo "synced: $(git rev-parse --short HEAD) -> Gitee + GitHub"
