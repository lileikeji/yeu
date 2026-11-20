#!/usr/bin/env bash
# yeuca 双仓同步
#
#   F:\yeuca                    独立私有仓，main 分支，站点开发主战场
#   E:\yeu                      yeu 主仓，yeuca/site 分支，内容落在 yeuca/ 子目录
#   E:\yeu-yeuca                yeuca/site 的 worktree（不碰 yeu 主工作区）
#   github.com/lileikeji/yeu-private   该分支的远端
#
# 用法:
#   bash scripts/sync-yeu.sh status     # 只报告两侧差异，不改任何东西
#   bash scripts/sync-yeu.sh push       # F:\yeuca -> yeu/yeuca/（并推私有仓）
#   bash scripts/sync-yeu.sh pull       # yeu/yeuca/ -> F:\yeuca
#   bash scripts/sync-yeu.sh both       # 先 push 再 pull
#
# 实现选择（都是踩过的坑）:
#   push 用 yeu 侧的 `git subtree pull`：只 fetch 对端 tip，秒级。
#   `git subtree push` 在本仓不可用 —— 它要 split 整个 yeu 历史（1868 文件），
#   实测 2 分钟不出结果。
#   pull 用 `git archive | tar -x`：反向没有 subtree 对端可拉，直接取 tree。
#   tar 必须用 GNU tar（C:\Program Files\Git\usr\bin\tar.exe）；
#   niugit 自带的 WinuxCmd tar 会把 UTF-8 中文文件名解成乱码。
#   status 比树对象而不是目录：fetch 本地仓后 diff 两个 tree，
#   不受 node_modules / 编码 / CRLF 干扰。
#
# 已知边界：pull 是「覆盖 + 新增」，不会删除 F:\yeuca 里 yeu 侧已不存在的文件。
#           status 会把这类文件标为 only-local，需要时手动删。

set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$SELF_DIR/.." && pwd)"          # F:\yeuca
YEU_WT="${YEU_WT:-/e/yeu-yeuca}"           # yeuca/site worktree
PREFIX="yeuca"
BRANCH="yeuca/site"
REMOTE="private"
SYSGIT="${SYSGIT:-/c/Program Files/Git/cmd/git.exe}"   # 只有它带 git-subtree
TAR="${TAR:-/c/Program Files/Git/usr/bin/tar.exe}"     # 只有它能正确解 UTF-8 文件名

die()  { echo "错误: $*" >&2; exit 1; }
info() { echo "· $*"; }

check_env() {
  [ -d "$SRC/.git" ] || die "$SRC 不是 git 仓库"
  [ -e "$YEU_WT/.git" ] || die "找不到 worktree $YEU_WT（用 git -C /e/yeu worktree list 查）"
  [ -x "$SYSGIT" ] || die "找不到系统 Git: $SYSGIT（git-subtree 只有它自带）"
  [ -x "$TAR" ] || die "找不到 GNU tar: $TAR"
  git -C "$YEU_WT" rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null \
    || die "$YEU_WT 当前不在 $BRANCH 分支上"
}

# 把 F:\yeuca 的 main 抓进 yeu 仓，返回本地树与 yeu 侧 yeuca/ 树的 hash
tree_pair() {
  git -C "$YEU_WT" fetch -q "$SRC" main
  LOCAL_TREE="$(git -C "$YEU_WT" rev-parse 'FETCH_HEAD^{tree}')"
  YEU_TREE="$(git -C "$YEU_WT" rev-parse "$BRANCH:$PREFIX")"
}

cmd_status() {
  check_env
  tree_pair
  if [ "$LOCAL_TREE" = "$YEU_TREE" ]; then
    echo "· $SRC  <->  $YEU_WT/$PREFIX ($BRANCH)"
    echo "两侧一致，无需同步"
    return 0
  fi
  echo "· $SRC  <->  $YEU_WT/$PREFIX ($BRANCH)"
  echo "  本地树 $LOCAL_TREE"
  echo "  yeu 树 $YEU_TREE"
  echo
  echo "--- 差异（A=yeu 侧，B=本地）---"
  git -C "$YEU_WT" --no-pager diff --stat=100 --no-color "$YEU_TREE" "$LOCAL_TREE" || true
  echo
  echo "只在本地有的文件、或只在 yeu 侧有的文件，上面按 added / deleted 体现。"
  return 1
}

cmd_push() {
  check_env
  [ -z "$(git -C "$YEU_WT" status --porcelain)" ] \
    || die "$YEU_WT 有未提交改动，先处理再同步"
  local before after
  before="$(git -C "$YEU_WT" rev-parse HEAD)"
  info "subtree pull: $SRC main -> $YEU_WT/$PREFIX"
  ( cd "$YEU_WT" && "$SYSGIT" -c core.autocrlf=false \
      subtree pull --prefix="$PREFIX" "$SRC" main --squash )
  after="$(git -C "$YEU_WT" rev-parse HEAD)"
  if [ "$before" = "$after" ]; then
    info "yeu 侧无变化，跳过推送"
  else
    info "yeu 侧新提交: $(git -C "$YEU_WT" log --oneline "$before..$after" | tr '\n' ' ')"
    info "推 $BRANCH -> $REMOTE"
    git -C "$YEU_WT" push "$REMOTE" "$BRANCH"
  fi
  if git -C "$SRC" remote get-url private >/dev/null 2>&1; then
    info "备份本地 main -> private/yeuca/main"
    git -C "$SRC" push -q private main:yeuca/main
  fi
  echo "push 完成"
}

cmd_pull() {
  check_env
  info "archive: $YEU_WT:$BRANCH:$PREFIX -> $SRC"
  git -C "$YEU_WT" archive "$BRANCH:$PREFIX" | "$TAR" -x -C "$SRC"
  ( cd "$SRC"
    git add -A
    if git diff --cached --quiet; then
      info "本地无变化"
    else
      git commit -q -m "sync: 从 yeu $BRANCH 同步 $(date '+%Y-%m-%d %H:%M')"
      info "本地新提交: $(git log --oneline -1)"
    fi )
  echo "pull 完成"
}

case "${1:-}" in
  status) cmd_status ;;
  push)   cmd_push ;;
  pull)   cmd_pull ;;
  both)   cmd_push; echo; cmd_pull ;;
  ""|-h|--help|help)
    sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    ;;
  *) die "未知子命令: $1（用 status / push / pull / both）" ;;
esac
