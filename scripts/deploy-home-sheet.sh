#!/usr/bin/env bash
set -euo pipefail

release_id="$1"
archive="$2"
base="/www/wwwroot/yeu"
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

mkdir -p "$release"
tar -xzf "$archive" -C "$release"
test -f "$release/.output/server/index.mjs"

native_rel=".output/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
test -f "$current_target/$native_rel"
test -f "$release/$native_rel"
cp "$current_target/$native_rel" "$release/$native_rel"

# Ensure the Linux sqlite-vec native extension ships in every release. The build
# runs on Windows (sqlite-vec-windows-x64), which cannot load on this server and
# would silently disable semantic/vector retrieval. Copy the persisted Linux
# build so getLoadablePath()/vectorSearchReady() work in production.
vec_target="$release/.output/server/node_modules/sqlite-vec-linux-x64"
if [ ! -f "$vec_target/vec0.so" ]; then
  mkdir -p "$vec_target"
  cp /www/wwwroot/yeu/vec-linux/sqlite-vec-linux-x64/vec0.so "$vec_target/"
  cp /www/wwwroot/yeu/vec-linux/sqlite-vec-linux-x64/package.json "$vec_target/"
  echo "installed Linux sqlite-vec into $release"
fi

chown -R yeu:yeu "$release"
find "$release" -type d -exec chmod 0750 {} +
find "$release" -type f -exec chmod 0640 {} +

sqlite3 "$base/shared/data/yeu.sqlite" ".backup '$backup'"
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

# The systemd unit injects shared/.env via EnvironmentFile. The smoke test
# must match that environment or the production health check reports 503
# (missing site URL / session secret / map credentials). The password hash is
# excluded because its bcrypt '$' markers would be shell-expanded, and nounset
# is disabled around the source so any stray '$' cannot abort the script.
set -a
set +u
. <(grep -vE '^(#|NUXT_ADMIN_PASSWORD_HASH=)' "$base/shared/.env" | tr -d '\r')
set -u
set +a

smoke_log="$base/shared/logs/smoke-$release_id.log"
runuser -u yeu --preserve-environment -- env \
  NODE_ENV=production \
  NITRO_HOST=127.0.0.1 \
  NITRO_PORT="$smoke_port" \
  NUXT_DATABASE_PATH="$smoke_db" \
  /opt/node-v22.18.0/bin/node "$release/.output/server/index.mjs" \
  >"$smoke_log" 2>&1 &
smoke_pid="$!"

smoke_ok=""
for _ in $(seq 1 80); do
  if curl -fsS "http://127.0.0.1:$smoke_port/api/health" >/dev/null 2>&1; then
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

smoke_home="$(curl -fsS "http://127.0.0.1:$smoke_port/")"
grep -Fq "首页显示模式" <<<"$smoke_home"
cleanup
smoke_pid=""

ln -sfn "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
systemctl restart yeu.service

service_ok=""
for _ in $(seq 1 60); do
  if systemctl is-active --quiet yeu.service \
    && curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    service_ok="yes"
    break
  fi
  sleep 0.5
done

if [[ "$service_ok" != "yes" ]]; then
  ln -sfn "$current_target" "$base/current.rollback"
  mv -Tf "$base/current.rollback" "$base/current"
  systemctl restart yeu.service
  journalctl -u yeu.service -n 100 --no-pager >&2 || true
  exit 1
fi

rm -f "$archive"
rm -f "$smoke_db" "$smoke_db-wal" "$smoke_db-shm"
printf '%s\n' "release=$release" "rollback=$current_target" "backup=$backup"
