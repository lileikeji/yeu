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

while IFS= read -r output; do
  find "$output" -type d -exec chown root:root {} +
  find "$output" -type d -exec chmod 0755 {} +
  find "$output" -type f -exec chown root:root {} +
  find "$output" -type f -exec chmod 0644 {} +
  find "$output" -type f -name '*.node' -exec chmod 0755 {} +
done < <(find "$ROOT/releases" -mindepth 2 -maxdepth 2 -type d -name .output)

install -o root -g root -m 0644 "$ROOT/current/ops/systemd/yeu.service" /etc/systemd/system/yeu.service
install -o root -g root -m 0644 "$ROOT/current/ops/systemd/yeu-qq-relay.service" /etc/systemd/system/yeu-qq-relay.service
install -o root -g root -m 0644 "$ROOT/current/ops/systemd/yeu-retention.service" /etc/systemd/system/yeu-retention.service
install -o root -g root -m 0644 "$ROOT/current/ops/systemd/yeu-retention.timer" /etc/systemd/system/yeu-retention.timer
systemctl daemon-reload
