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
if [ -e "$backup" ]; then
  mv "$backup" "$backup.replaced-$(date -u +%Y%m%d-%H%M%S)"
fi
if ! timeout 900 sqlite3 "$base/shared/data/yeu.sqlite" "VACUUM INTO '$backup'"; then
  echo "数据库快照失败（VACUUM INTO），中止部署" >&2
  exit 1
fi
chown yeu:yeu "$backup"
chmod 0600 "$backup"

# The smoke test boots the new release as the `yeu` user, which needs a
# writable SQLite directory for WAL sidecars. Keep the retained backup in
# shared/backups (hardened, not app-writable) and smoke against a private
# copy inside the release directory that `yeu` owns.
smoke_db="$release/.smoke.sqlite"
cp "$backup" "$smoke_db"
chown yeu:yeu "$smoke_db"
chmod 0600 "$smoke_db"

smoke_log="$base/shared/logs/smoke-$release_id.log"
"$node" --env-file="$base/shared/.env" "$tools" serve "$release" "$smoke_db" "$smoke_port" \
  >"$smoke_log" 2>&1 &
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
