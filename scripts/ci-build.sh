#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BUILD_SHA="$(git rev-parse HEAD)"
: "${GITEE_COMMIT:?缺少流水线完整提交号}"
[[ "$GITEE_COMMIT" =~ ^[0-9a-f]{40}$ && "$BUILD_SHA" == "$GITEE_COMMIT" ]]
: "${GITEE_PIPELINE_BUILD_NUMBER:?缺少流水线构建号}"
[[ "$GITEE_PIPELINE_BUILD_NUMBER" =~ ^[0-9]+$ ]]
RELEASE_ID="$(date -u +%Y%m%d-%H%M%S)-${GITEE_PIPELINE_BUILD_NUMBER}-${BUILD_SHA:0:12}-$(openssl rand -hex 4)"
printf '%s\n' "$BUILD_SHA" > build-sha.txt
printf '%s\n' "$RELEASE_ID" > release-id.txt
BASE_SHA="$(curl --connect-timeout 5 --max-time 10 -fsS https://yx.huiliyill.cn/version.json \
  | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{try{process.stdout.write(JSON.parse(s).commit||"")}catch{}})' || true)"
if [[ "$BASE_SHA" =~ ^[0-9a-f]{40}$ ]] && ! git cat-file -e "$BASE_SHA^{commit}" 2>/dev/null; then
  echo "浅克隆补取已部署提交：$BASE_SHA"
  if ! timeout 30s git fetch --quiet --no-tags --depth=1 origin "$BASE_SHA" >/dev/null 2>&1; then
    echo "无法获取生产提交基线，执行完整检查" >&2
  fi
fi
if node scripts/release-tools.mjs docs-only "$BASE_SHA" "$BUILD_SHA"; then
  git diff --check "$BASE_SHA" "$BUILD_SHA"
  printf 'docs-only\n' > release-mode.txt
  tar -czf yeu-release.tar.gz build-sha.txt release-id.txt release-mode.txt
  echo "纯文档改动，跳过构建和生产部署：$BASE_SHA → $BUILD_SHA"
  exit 0
fi
printf 'deploy\n' > release-mode.txt
source scripts/ci-bootstrap.sh
build_start="$(mktemp)"
types_root="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
types_dir="$(mktemp -d "$types_root/yeu-ci-types.XXXXXX")"
type_pid=""
build_pid=""
owner_pid="$BASHPID"
cleanup() {
  [[ "$BASHPID" == "$owner_pid" ]] || return 0
  for pid in "$type_pid" "$build_pid"; do
    [[ -z "$pid" ]] || kill -TERM -- "-$pid" 2>/dev/null || true
  done
  # A child can fork during TERM delivery, or ignore TERM; bound cancellation.
  sleep 0.5
  for pid in "$type_pid" "$build_pid"; do
    [[ -z "$pid" ]] || kill -KILL -- "-$pid" 2>/dev/null || true
  done
  wait "$type_pid" "$build_pid" 2>/dev/null || true
  rm -f "$build_start"
  [[ "$types_dir" == "$types_root"/yeu-ci-types.* ]]
  [[ "$(dirname "$(realpath "$types_dir")")" == "$types_root" ]]
  rm -rf -- "$types_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Nuxt typecheck and build each generate .nuxt; keep their output directories separate.
git archive HEAD | tar -xf - -C "$types_dir"
ln -s "$PWD/node_modules" "$types_dir/node_modules"
check_types() {
  set +m
  set -euo pipefail
  cd "$types_dir"
  pnpm typecheck
}
test_and_build() {
  set +m
  set -euo pipefail
  pnpm exec tsx --test --test-concurrency=4 scripts/*.test.ts
  pnpm build
  test .output/server/index.mjs -nt "$build_start"
}
# Monitor mode gives each branch its own process group, including pnpm children.
set -m
check_types &
type_pid="$!"
test_and_build &
build_pid="$!"
status=0
wait -n "$type_pid" "$build_pid" || status="$?"
if [[ "$status" != "0" ]]; then
  echo "并行检查失败：exit=$status；终止另一支，未生成发布制品" >&2
  exit "$status"
fi
wait "$type_pid"
wait "$build_pid"
set +m
node scripts/release-tools.mjs create .output "$RELEASE_ID" "$BUILD_SHA"
node scripts/release-tools.mjs native .output
pnpm pwa:build:test
tar -czhf yeu-release.tar.gz .output build-sha.txt release-id.txt release-mode.txt \
  scripts/server-side-deploy.sh scripts/deploy-home-sheet.sh
test -s yeu-release.tar.gz
sha256sum yeu-release.tar.gz
stat -c 'artifact_bytes=%s artifact_mtime=%y' yeu-release.tar.gz
