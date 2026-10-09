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
if node scripts/release-tools.mjs docs-only "$BASE_SHA" "$BUILD_SHA"; then
  git diff --check "$BASE_SHA" "$BUILD_SHA"
  printf 'docs-only\n' > release-mode.txt
  tar -czf yeu-release.tar.gz build-sha.txt release-id.txt release-mode.txt
  echo "纯文档改动，跳过构建和生产部署：$BASE_SHA → $BUILD_SHA"
  exit 0
fi
printf 'deploy\n' > release-mode.txt
source scripts/ci-bootstrap.sh
pnpm typecheck
# Full suite on the two-core runner; never omit tests to reduce duration.
pnpm exec tsx --test --test-concurrency=2 scripts/*.test.ts
build_start="$(mktemp)"
trap 'rm -f "$build_start"' EXIT
pnpm build
test .output/server/index.mjs -nt "$build_start"
node scripts/release-tools.mjs create .output "$RELEASE_ID" "$BUILD_SHA"
node scripts/release-tools.mjs native .output
pnpm pwa:build:test
pnpm e2e:install:ci
pnpm e2e:run
tar -czhf yeu-release.tar.gz .output build-sha.txt release-id.txt release-mode.txt \
  scripts/server-side-deploy.sh scripts/deploy-home-sheet.sh
test -s yeu-release.tar.gz
sha256sum yeu-release.tar.gz
stat -c 'artifact_bytes=%s artifact_mtime=%y' yeu-release.tar.gz
