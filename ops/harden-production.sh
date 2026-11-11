#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/www/wwwroot/yeu
SHARED="$ROOT/shared"

if ! id yeu >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /home/yeu --shell /usr/sbin/nologin yeu
fi
usermod -a -G www yeu

chown root:yeu "$SHARED"
chmod 0750 "$SHARED"
setfacl -m u:www:--x "$SHARED"
chown root:yeu "$SHARED/.env"
chmod 0640 "$SHARED/.env"

install -d -o yeu -g yeu -m 0700 "$SHARED/data"
find "$SHARED/data" -maxdepth 1 -type f -name 'yeu.sqlite*' -exec chown yeu:yeu {} +
find "$SHARED/data" -maxdepth 1 -type f -name 'yeu.sqlite*' -exec chmod 0600 {} +

install -d -o root -g yeu -m 0750 "$SHARED/backups"
find "$SHARED/backups" -maxdepth 1 -type f -exec chown root:yeu {} +
find "$SHARED/backups" -maxdepth 1 -type f -exec chmod 0640 {} +

install -d -o yeu -g www -m 2750 "$SHARED/uploads"
find "$SHARED/uploads" -maxdepth 1 -type f -exec chown yeu:www {} +
find "$SHARED/uploads" -maxdepth 1 -type f -exec chmod 0640 {} +

for directory in logs monitor; do
  install -d -o yeu -g yeu -m 0750 "$SHARED/$directory"
  find "$SHARED/$directory" -type f -exec chown yeu:yeu {} +
  find "$SHARED/$directory" -type f -exec chmod 0640 {} +
done

for directory in nuxt-compat; do
  find "$SHARED/$directory" -type d -exec chown root:root {} +
  find "$SHARED/$directory" -type d -exec chmod 0755 {} +
  find "$SHARED/$directory" -type f -exec chown root:root {} +
  find "$SHARED/$directory" -type f -exec chmod 0644 {} +
done

install -d -o root -g root -m 0755 "$SHARED/public-extra"
find "$SHARED/public-extra" -type d -exec chown root:root {} +
find "$SHARED/public-extra" -type d -exec chmod 0755 {} +
find "$SHARED/public-extra" -type f -exec chown root:root {} +
find "$SHARED/public-extra" -type f -exec chmod 0644 {} +

# Keep relay code outside release directories. Some deploy artifacts contain
# only `.output`, while the relay must survive every atomic `current` switch.
# 源码检出在 `repo/scripts`，release-only 布局的 `current/scripts` 并不存在，
# 所以两个位置都要看，否则升级后 relay 仍在跑旧脚本。
for source in "$ROOT/current/scripts/qq-onebot-relay.mjs" "$ROOT/repo/scripts/qq-onebot-relay.mjs"; do
  if [ -f "$source" ]; then
    install -o root -g yeu -m 0640 "$source" "$SHARED/qq-onebot-relay.mjs"
    break
  fi
done

while IFS= read -r output; do
  find "$output" -type d -exec chown root:root {} +
  find "$output" -type d -exec chmod 0755 {} +
  find "$output" -type f -exec chown root:root {} +
  find "$output" -type f -exec chmod 0644 {} +
  find "$output" -type f -name '*.node' -exec chmod 0755 {} +
done < <(find "$ROOT/releases" -mindepth 2 -maxdepth 2 -type d -name .output)

# 发布产物只含 `.output`，`current/ops` 在 release-only 布局里并不存在；
# 源码检出则把运维文件放在 `repo/ops`。两种布局都取到同一份文件，否则下面
# 的 install 会在真机上直接 `No such file or directory`，systemd 单元永远装不上。
if [[ -d "$ROOT/current/ops" ]]; then
  OPS_DIR="$ROOT/current/ops"
else
  OPS_DIR="$ROOT/repo/ops"
fi

# 定时任务脚本装到 /opt/yeu-ops：release 只发 `.output`，`current/scripts`
# 不存在，单元里写死 $current/scripts 会以 203/EXEC 失败。
install -d -o root -g root -m 0755 /opt/yeu-ops
install -o root -g root -m 0644 \
  "$ROOT/repo/scripts/cleanup-sensitive-data.mjs" \
  /opt/yeu-ops/cleanup-sensitive-data.mjs
install -o root -g root -m 0644 \
  "$ROOT/repo/scripts/retention/prune-uploads.mjs" \
  /opt/yeu-ops/prune-uploads.mjs
install -o root -g root -m 0755 \
  "$OPS_DIR/systemd/yeu-backup.sh" \
  /opt/yeu-ops/yeu-backup.sh
# wechatpadpro 的 relay 与 compose 同样不能放在 release 目录里：
# 单元写的是 /opt/yeu-ops 下的固定副本，compose 只用命名卷，和路径无关。
install -o root -g root -m 0644 \
  "$ROOT/repo/scripts/wechatpadpro-relay.mjs" \
  /opt/yeu-ops/wechatpadpro-relay.mjs
install -d -o root -g root -m 0755 /opt/yeu-ops/wechatpadpro
install -o root -g root -m 0644 \
  "$OPS_DIR/wechatpadpro/docker-compose.yml" \
  /opt/yeu-ops/wechatpadpro/docker-compose.yml
install -o root -g root -m 0644 \
  "$OPS_DIR/wechatpadpro/.env.example" \
  /opt/yeu-ops/wechatpadpro/.env.example

install -o root -g root -m 0644 "$OPS_DIR/systemd/yeu.service" /etc/systemd/system/yeu.service
install -o root -g root -m 0644 "$OPS_DIR/systemd/yeu-qq-relay.service" /etc/systemd/system/yeu-qq-relay.service
install -o root -g root -m 0644 "$OPS_DIR/systemd/yeu-wechatpadpro.service" /etc/systemd/system/yeu-wechatpadpro.service
install -o root -g root -m 0644 "$OPS_DIR/systemd/yeu-wechatpadpro-relay.service" /etc/systemd/system/yeu-wechatpadpro-relay.service
install -o root -g root -m 0644 "$OPS_DIR/systemd/yeu-retention.service" /etc/systemd/system/yeu-retention.service
install -o root -g root -m 0644 "$OPS_DIR/systemd/yeu-retention.timer" /etc/systemd/system/yeu-retention.timer
install -o root -g root -m 0644 "$OPS_DIR/systemd/yeu-backup.service" /etc/systemd/system/yeu-backup.service
install -o root -g root -m 0644 "$OPS_DIR/systemd/yeu-backup.timer" /etc/systemd/system/yeu-backup.timer
systemctl daemon-reload
systemctl enable --now yeu-retention.timer yeu-backup.timer
