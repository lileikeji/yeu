#!/bin/bash
# 在服务器上消费本机产出的制品（scripts/build-linux-artifact.sh 的结果），不在生产机编译。
#
# 为什么不在服务器编译：生产机 4 核 / 3.6G，pnpm build 单次 40 分钟起，还会 OOM
# （exit 137）。本机 16 核 107 秒，产物跨平台一致，只有两个二进制需要按平台替换。
#
# 用法：
#   bash deploy-incoming.sh                      # 取 /data/yeu-build/incoming 最新制品
#   bash deploy-incoming.sh /path/to/release.tar.gz
#
# 校验顺序：制品完整性 → release.json 的 commit/release 合法性 → 补 Linux 二进制 →
# 重算 native.hash → 重新打包 → 交给 server-side-deploy.sh（flock + 备份 + 冒烟 + 回滚）。
set -uo pipefail

export PATH=/data/node/node-v22.20.0-linux-x64/bin:$PATH
BASE="${YEU_BASE:-/data/yeu}"
STAGE="${INCOMING_DIR:-/data/yeu-build/incoming}"
LOG="$BASE/shared/logs/deploy-incoming-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$BASE/shared/logs"
exec >>"$LOG" 2>&1
ts() { date +%H:%M:%S; }

ARCHIVE="${1:-}"
[[ -n "$ARCHIVE" ]] || ARCHIVE="$(ls -t "$STAGE"/*.tgz 2>/dev/null | head -1)"
if [[ ! -f "$ARCHIVE" ]]; then
  echo "[$(ts)] 没有可用制品：$STAGE/*.tgz"
  echo "           先在本机执行 bash scripts/build-linux-artifact.sh"
  exit 1
fi
echo "[$(ts)] 制品=$ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar xzf "$ARCHIVE" -C "$WORK" || { echo "[$(ts)] 解包失败：$ARCHIVE"; exit 1; }
OUT="$WORK/.output"

for f in server/index.mjs release.json deploy/release-tools.mjs; do
  [[ -f "$OUT/$f" ]] || { echo "[$(ts)] 缺 .output/$f（用 node scripts/release-tools.mjs create 生成）"; exit 1; }
done

COMMIT="$(node -p "require('$OUT/release.json').commit")"
REL="$(node -p "require('$OUT/release.json').release")"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "[$(ts)] commit 必须是完整提交号，实际：$COMMIT"; exit 1; }
[[ "$REL" =~ ^[0-9]{8}-[a-z0-9-]+$ ]] || { echo "[$(ts)] release 名非法：$REL"; exit 1; }
echo "[$(ts)] commit=$COMMIT release=$REL"

# 来源闸门：只接受 CI（GitHub Actions）出的制品。本机是 win32 + node 26，
# 原生模块和 node 版本都跟生产不一致，本机构建只作冒烟验证，不直接上线。
CI_ORIGIN="$(node -e "try{const r=require('$OUT/release.json');process.stdout.write(r.ci&&r.ci.runId?'ci':'local')}catch(e){process.stdout.write('local')}" 2>/dev/null || echo local)"
if [[ "$CI_ORIGIN" != "ci" && "${ALLOW_LOCAL_BUILD:-0}" != "1" ]]; then
  echo "[$(ts)] 拒绝部署：这份制品不是 CI 产出的（release.json 没有 ci.runId）"
  echo "           正确路径：推 deploy/theme-on-competition → build-artifact 出制品 → gh run download"
  echo "           确认要装本机构建的包，设 ALLOW_LOCAL_BUILD=1"
  exit 1
fi
if [[ "$CI_ORIGIN" == "ci" ]]; then
  echo "[$(ts)] 制品来源：GitHub Actions run $(node -e "process.stdout.write(require('$OUT/release.json').ci.runId)" 2>/dev/null)"
fi

# 防回退闸门：线上正在跑的 commit 必须已包含在本次制品里。
# 多个会话并行发版时最常见的事故是「我出制品后别人又发了一版」，一发布就把对方刚上的功能顶回去
# （2026-11-18 一夜发生四次）。祖先清单由 scripts/release-tools.mjs 写进 release.json。

CURRENT_LINK="$BASE/current"
LIVE_COMMIT="$(node -e "try{process.stdout.write(require('$CURRENT_LINK/.output/release.json').commit||'')}catch(e){}" 2>/dev/null || true)"
if [[ -n "$LIVE_COMMIT" && "$LIVE_COMMIT" != "$COMMIT" ]]; then
  ANCESTRY="$(node -e "const r=require('$OUT/release.json');const h=Array.isArray(r.history)?r.history:[];process.stdout.write(h.length?(h.includes('$LIVE_COMMIT')?'yes':'no'):'unknown')" 2>/dev/null || echo unknown)"
  case "$ANCESTRY" in
    yes)
      echo "[$(ts)] 防回退校验通过：线上 $LIVE_COMMIT 是本次提交的祖先"
      ;;
    unknown)
      echo "[$(ts)] 警告：制品没有祖先清单（旧版 release-tools 出的），跳过防回退校验"
      ;;
    *)
      echo "[$(ts)] 拒绝部署：线上正在跑 $LIVE_COMMIT，它不在本次制品的祖先链里"
      echo "           这次发布会把线上已有提交整体顶掉（别人刚发过版就是这种形状）"
      echo "           处理：先把它并进主线重出制品；确实要回退旧版请设 ALLOW_REVERT=1"
      if [[ "${ALLOW_REVERT:-0}" != "1" ]]; then
        exit 1
      fi
      echo "[$(ts)] ALLOW_REVERT=1 → 按回退模式继续"
      ;;
  esac
else
  [[ -n "$LIVE_COMMIT" ]] && echo "[$(ts)] 线上已是同一提交，继续"
fi

# 本机打包时排除了平台二进制，这里从线上 current 补齐；
# current 自己可能缺 sqlite-vec 的平台包（20261103-233258 就没有），回退到历史 release 里找。
CUR="$BASE/current/.output/server/node_modules"
VEC="$CUR"
if [[ ! -d "$VEC/sqlite-vec-linux-x64" ]]; then
  alt="$(find "$BASE/releases" -maxdepth 7 -type d -name sqlite-vec-linux-x64 2>/dev/null | head -1)"
  if [[ -n "$alt" ]]; then VEC="$(dirname "$alt")"; echo "[$(ts)] sqlite-vec 回退源=$VEC"; fi
fi
NEW="$OUT/server/node_modules"
mkdir -p "$NEW/better-sqlite3/build/Release"
cp -f "$CUR/better-sqlite3/build/Release/better_sqlite3.node" "$NEW/better-sqlite3/build/Release/"
rm -rf "$NEW"/sqlite-vec-windows-x64 "$NEW"/sqlite-vec-darwin-*
[[ -d "$NEW/sqlite-vec-linux-x64" ]] || cp -r "$VEC/sqlite-vec-linux-x64" "$NEW/"
[[ -d "$NEW/sqlite-vec-linux-x64" ]] || { echo "[$(ts)] 缺 sqlite-vec-linux-x64"; exit 1; }
[[ -d "$NEW/hookable" ]] || { echo "[$(ts)] 缺 hookable：tar 要加 -h 跟随 pnpm 符号链接"; exit 1; }

# create 记录的 native.hash 是本机 Windows 二进制的摘要，换 ELF 后必须重算，
# 否则 deploy-home-sheet.sh 的 native 校验报「SQLite 原生模块摘要不匹配」。
node - "$OUT/release.json" "$NEW/better-sqlite3/build/Release/better_sqlite3.node" <<'JS' || exit 1
const fs = require('fs')
const c = require('crypto')
const [p, n] = process.argv.slice(2)
const m = JSON.parse(fs.readFileSync(p, 'utf8'))
m.native.hash = c.createHash('sha256').update(fs.readFileSync(n)).digest('hex')
m.platform = process.platform
m.arch = process.arch
m.node = process.version
m.abi = process.versions.modules
fs.writeFileSync(p, JSON.stringify(m) + '\n')
JS

BUNDLE="$STAGE/release-$REL.tar.gz"
tar -czf "$BUNDLE" -C "$WORK" .output || { echo "[$(ts)] 重新打包失败"; exit 1; }
echo "[$(ts)] bundle=$BUNDLE ($(du -h "$BUNDLE" | cut -f1))"

# 切换走生产发布流程：deploy-home-sheet.sh 有 flock、备份复用、冒烟与失败回滚。
cd "$BASE" || exit 1
RELEASE_ID="$REL" DEPLOY_SHA="$COMMIT" ARCHIVE="$BUNDLE" bash "$BASE/server-side-deploy.sh"
rc=$?
echo "[$(ts)] EXIT=$rc 日志=$LOG"
exit "$rc"
