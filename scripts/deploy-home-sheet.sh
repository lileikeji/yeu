#!/usr/bin/env bash
set -euo pipefail

release_id="$1"
archive="$2"
base="${YEU_BASE:-/www/wwwroot/yeu}"
node="${YEU_NODE:-/opt/node-v22.18.0/bin/node}"
release="$base/releases/$release_id"
current_target="$(readlink -f "$base/current")"
backup="$base/shared/backups/yeu-before-$release_id.sqlite"
smoke_port="3101"
smoke_pid=""
smoke_db=""

cleanup() {
  if [[ -n "$smoke_pid" ]] && kill -0 "$smoke_pid" 2>/dev/null; then
    kill "$smoke_pid" 2>/dev/null || true
    wait "$smoke_pid" 2>/dev/null || true
  fi
  if [[ -n "$smoke_db" ]]; then
    rm -f "$smoke_db" "$smoke_db-wal" "$smoke_db-shm" 2>/dev/null || true
  fi
}
trap cleanup EXIT

test -f "$archive"
test -d "$current_target/.output"
test ! -e "$release"
[[ "$release_id" =~ ^[0-9]{8}-[a-z0-9-]+$ ]]
[[ "${DEPLOY_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
mkdir -p "$base/shared/backups" "$base/shared/logs"
# Reserve space for the extracted build, backup, smoke copy and WAL growth.
archive_bytes="$(tar -tzvf "$archive" | awk '{sum += $3} END {printf "%.0f",sum}')"
database_bytes="$(stat -c%s "$base/shared/data/yeu.sqlite")"
available_bytes="$(df -PB1 "$base" | awk 'NR==2 {print $4}')"
required_bytes="$((archive_bytes + database_bytes * 2 + 536870912))"
if (( available_bytes < required_bytes )); then
  echo "空间不足：available=$available_bytes required=$required_bytes；未创建 release、未备份、未切换" >&2
  exit 1
fi

mkdir -p "$release"
tar -xzf "$archive" -C "$release"
test -f "$release/.output/server/index.mjs"

tools="$release/.output/deploy/release-tools.mjs"
test -f "$tools"
"$node" "$tools" native "$release/.output"
"$node" "$tools" version-check "$DEPLOY_SHA" "$release_id" < "$release/.output/release.json"
if [[ -f "$current_target/.output/release.json" ]]; then
  "$node" "$tools" compare "$current_target/.output/release.json" "$release/.output/release.json"
else
  "$node" "$tools" legacy-compare "$current_target/.output" "$release/.output/release.json"
fi
# Read-only gate: automatic deployment never writes schema or migration history.
"$node" "$tools" db-check "$base/shared/data/yeu.sqlite" "$release/.output/deploy/migrations"

chown -R yeu:yeu "$release"
find "$release" -type d -exec chmod 0750 {} +
find "$release" -type f -exec chmod 0640 {} +

# `.backup` 在库持续被写入时会反复重启，实测在生产库上挂了 98 分钟没跑完，
# 期间公开接口被读锁拖到 10 秒级。VACUUM INTO 是一次性一致快照，不会回退重来。
# 库在 24 小时内已有快照就复用（硬链接），省掉每次 2G 库的 VACUUM。
# 不能用“库比快照旧”做条件：生产库一直在写，mtime 永远更新，等于每次都重做
# （单次 30–60 秒，并发时 4 分钟以上）。备份是回滚点，最多接受丢一天数据；
# 要大改数据前强制新快照时设 BACKUP_FRESH=1。
# 目录为空（首次部署/清空备份）时 glob 无匹配，ls 退 2；pipefail+set -e 下必须兜住，
# 让 reuse 落空走新建快照分支。
reuse="$(ls -t "$base"/shared/backups/yeu-before-*.sqlite 2>/dev/null | head -1 || true)"
if [[ -z "${BACKUP_FRESH:-}" && -n "$reuse" ]] \
  && [[ -n "$(find "$reuse" -mmin -1440 -print -quit)" ]] \
  && ln -f "$reuse" "$backup" && touch "$backup"; then
  echo "24 小时内已有快照，复用：$(basename "$reuse")（BACKUP_FRESH=1 可强制重做）"
else
  if [ -e "$backup" ]; then
    mv "$backup" "$backup.replaced-$(date -u +%Y%m%d-%H%M%S)"
  fi
  if ! timeout 900 sqlite3 "$base/shared/data/yeu.sqlite" "VACUUM INTO '$backup'"; then
    echo "数据库快照失败（VACUUM INTO），中止部署" >&2
    exit 1
  fi
fi
chown yeu:yeu "$backup"
chmod 0600 "$backup"
# 只留最近 2 份快照；.replaced 是同一 release 重部署的轮转残留，留 1 份即可。
# 复用的硬链接 mtime 继承自原快照，按 -t 排序会落到末尾被误删，所以显式跳过当前 $backup。
ls -t "$base"/shared/backups/yeu-before-*.sqlite 2>/dev/null | grep -v -F -- "$backup" | tail -n +2 | xargs -r rm -f -- || true
ls -t "$base"/shared/backups/*.replaced-* 2>/dev/null | tail -n +2 | xargs -r rm -f -- || true
# 快照异步复制到对象存储，不阻塞切换（cosfs 写 2G 要几分钟）。
# 复制完成后桶内只保留最近 3 份：以自维护清单 .keep 为真相源，只删"存在但不在清单里"的
# 对象——cosfs 的目录列表与真实对象可能不一致（2026-11-08 曾把"留最新"删成"留最旧"），
# 清单法在方向上只可能漏删、不会删反；清单丢失时跳过本轮清理兜底。
if [[ -d /mnt/cos/yeu-db-backups ]]; then
  (
    keep="/mnt/cos/yeu-db-backups/.keep"
    nice -n 10 cp -f "$backup" "/mnt/cos/yeu-db-backups/$(basename "$backup")" >/dev/null 2>&1
    cd /mnt/cos/yeu-db-backups || exit 0
    {
      cat "$keep" 2>/dev/null
      basename "$backup"
    } | tail -3 > "$keep.tmp" && mv -f "$keep.tmp" "$keep"
    [ -s "$keep" ] || exit 0
    for f in yeu-before-*.sqlite; do
      [ -e "$f" ] || continue
      grep -qxF -- "$f" "$keep" || rm -f -- "$f"
    done
  ) &
fi

# The smoke test boots the new release as the `yeu` user, which needs a
# writable SQLite directory for WAL sidecars. Keep the retained backup in
# shared/backups (hardened, not app-writable) and smoke against a private
# copy inside the release directory that `yeu` owns.
smoke_db="$release/.smoke.sqlite"
cp "$backup" "$smoke_db"
chown yeu:yeu "$smoke_db"
chmod 0600 "$smoke_db"

smoke_log="$base/shared/logs/smoke-$release_id.log"
# 上一次部署的冒烟进程可能在异常退出时残留（实测 13:01 那次跑了两小时还占着 3101），
# 不清掉会让这次的 serve 起不来，白等 40 秒后判定冒烟失败。
fuser -k "$smoke_port/tcp" >/dev/null 2>&1 || true
sleep 1
# 冒烟直接起 index.mjs，不走 release-tools.mjs serve：serve 内部再 spawn 一层 runuser，
# 在部署脚本的非交互环境里子进程起来即退、日志为空（2026-11-04 实测：同样参数手工能起，
# 经 serve 必退；绕过它 3109 正常 Listening）。stdio 仍要 /dev/null，不继承调用方管道。
( cd "$release" && exec runuser -u yeu --preserve-environment -- \
    env NODE_ENV=production NITRO_HOST=127.0.0.1 NITRO_PORT="$smoke_port" \
    NUXT_DATABASE_PATH="$smoke_db" \
    "$node" --env-file="$base/shared/.env" .output/server/index.mjs ) \
  < /dev/null >"$smoke_log" 2>&1 &
smoke_pid="$!"

smoke_ok=""
for _ in $(seq 1 80); do
  if curl --connect-timeout 3 --max-time 5 -fsS "http://127.0.0.1:$smoke_port/api/health" >/dev/null 2>&1; then
    smoke_ok="yes"
    break
  fi
  if ! kill -0 "$smoke_pid" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

if [[ "$smoke_ok" != "yes" ]]; then
  echo "冒烟失败：port=$smoke_port pid=$smoke_pid alive=$(kill -0 "$smoke_pid" 2>/dev/null && echo yes || echo no) log=$smoke_log" >&2
  tail -80 "$smoke_log" >&2 || true
  exit 1
fi

smoke_home="$(curl --connect-timeout 3 --max-time 5 -fsS "http://127.0.0.1:$smoke_port/")"
grep -Fq "首页显示模式" <<<"$smoke_home"
curl --connect-timeout 3 --max-time 5 -fsS "http://127.0.0.1:$smoke_port/version.json" \
  | "$node" "$tools" version-check "$DEPLOY_SHA" "$release_id"
cleanup
smoke_pid=""

ln -sfn "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
service_ok=""
if systemctl restart yeu.service; then
for _ in $(seq 1 60); do
  if systemctl is-active --quiet yeu.service \
    && curl --connect-timeout 3 --max-time 5 -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1 \
    && curl --connect-timeout 3 --max-time 5 -fsS "http://127.0.0.1:3000/version.json" \
      | "$node" "$tools" version-check "$DEPLOY_SHA" "$release_id"; then
    service_ok="yes"
    break
  fi
  sleep 0.5
done
fi

if [[ "$service_ok" != "yes" ]]; then
  printf '%s\n' "发布验收失败：release=$release rollback=$current_target backup=$backup" >&2
  printf '人工回滚：ln -sfn %q %q && systemctl restart yeu.service\n' "$current_target" "$base/current" >&2
  ln -sfn "$current_target" "$base/current.rollback"
  mv -Tf "$base/current.rollback" "$base/current"
  if systemctl restart yeu.service; then
    rollback_ok=""
    for _ in $(seq 1 60); do
      if systemctl is-active --quiet yeu.service \
        && curl --connect-timeout 3 --max-time 5 -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
        rollback_ok="yes"
        break
      fi
      sleep 0.5
    done
    [[ "$rollback_ok" == "yes" ]] || echo "回滚后健康检查失败，需人工恢复" >&2
    [[ "$rollback_ok" != "yes" ]] || echo "回滚已恢复：$current_target；旧服务健康检查通过" >&2
  else
    echo "回滚后服务启动失败，需人工恢复" >&2
  fi
  journalctl -u yeu.service -n 100 --no-pager >&2 || true
  exit 1
fi

rm -f "$archive"
rm -f "$smoke_db" "$smoke_db-wal" "$smoke_db-shm"
printf '%s\n' "release=$release" "rollback=$current_target" "backup=$backup"
