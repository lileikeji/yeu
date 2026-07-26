#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/www/wwwroot/yeu
VHOST=/www/server/panel/vhost/nginx/yeu.huiliyill.cn.conf
EXTENSION=/www/server/panel/vhost/nginx/extension/yeu.huiliyill.cn
HTTP_INCLUDE=/www/server/panel/vhost/nginx/0.yeu_trusted_client_ip.conf
NGINX=/www/server/nginx/sbin/nginx
STAMP="$(date +%Y%m%d-%H%M%S)"

test -f "$VHOST"
install -d -o root -g root -m 0755 "$EXTENSION"
install -o root -g root -m 0644 "$VHOST" "$VHOST.before-security-$STAMP"

# Only observed CDN peers may provide the client address. Direct requests and
# unknown/new edges fall back to their TCP source address.
install -o root -g root -m 0644 \
  "$ROOT/current/ops/nginx/trusted-client-ip.conf" \
  "$HTTP_INCLUDE"
sed -i \
  -e 's/proxy_set_header X-Real-IP \$remote_addr;/proxy_set_header X-Real-IP \$yeu_forwarded_client_ip;/g' \
  -e 's/proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/proxy_set_header X-Forwarded-For \$yeu_forwarded_client_ip;/g' \
  -e 's/proxy_set_header X-Forwarded-For \$remote_addr;/proxy_set_header X-Forwarded-For \$yeu_forwarded_client_ip;/g' \
  "$VHOST"

# JSON and webhook routes are small. The upload route below is the only larger exception.
if ! sed -n '/location @nuxt {/,/^    }/p' "$VHOST" | grep -q 'client_max_body_size 256k;'; then
  sed -i '/location @nuxt {/a\\        client_max_body_size 256k;' "$VHOST"
fi

install -o root -g root -m 0644 \
  "$ROOT/current/ops/nginx/assistant-stream.conf" \
  "$EXTENSION/assistant-stream.conf"
install -o root -g root -m 0644 \
  "$ROOT/current/ops/nginx/admin-media-upload.conf" \
  "$EXTENSION/admin-media-upload.conf"

"$NGINX" -t
"$NGINX" -s reload
