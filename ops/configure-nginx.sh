#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/www/wwwroot/yeu
VHOST=/www/server/panel/vhost/nginx/yx.huiliyill.cn.conf
EXTENSION=/www/server/panel/vhost/nginx/extension/yx.huiliyill.cn
LEGACY_VHOST=/www/server/panel/vhost/nginx/yeu.huiliyill.cn.conf
LEGACY_EXTENSION=/www/server/panel/vhost/nginx/extension/yeu.huiliyill.cn
LEGACY_REDIRECT_VHOST=/www/server/panel/vhost/nginx/yeu.huiliyill.cn.conf
HTTP_INCLUDE=/www/server/panel/vhost/nginx/0.yeu_trusted_client_ip.conf
NGINX=/www/server/nginx/sbin/nginx
STAMP="$(date +%Y%m%d-%H%M%S)"

# A release contains only the compiled `.output` by default. Source checkouts
# keep the operational snippets under `repo/ops`, so deployments work from
# either layout without silently skipping security configuration.
if [[ -d "$ROOT/current/ops" ]]; then
  OPS_DIR="$ROOT/current/ops"
else
  OPS_DIR="$ROOT/repo/ops"
fi
PUBLIC_DIR="$ROOT/current/.output/public"
if [[ ! -d "$PUBLIC_DIR" ]]; then
  PUBLIC_DIR="$ROOT/repo/public"
fi

if [[ ! -f "$VHOST" && -f "$LEGACY_VHOST" ]]; then
  install -o root -g root -m 0644 "$LEGACY_VHOST" "$VHOST"
fi
test -f "$VHOST"

# Keep the retired hostname as a tiny redirect-only vhost. It preserves the
# path and query string while preventing the old application from rendering.
cat > "$LEGACY_REDIRECT_VHOST" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    ssl_certificate /www/server/panel/vhost/cert/yeu.huiliyill.cn/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/yeu.huiliyill.cn/privkey.pem;
    server_name yeu.huiliyill.cn;
    add_header Cache-Control "no-store" always;
    add_header CDN-Cache-Control "no-store" always;
    return 301 https://yx.huiliyill.cn$request_uri;
}
NGINX
chmod 0644 "$LEGACY_REDIRECT_VHOST"
install -d -o root -g root -m 0755 "$EXTENSION"
if [[ -d "$LEGACY_EXTENSION" ]]; then
  cp -a "$LEGACY_EXTENSION"/. "$EXTENSION"/
fi
install -o root -g root -m 0644 "$VHOST" "$VHOST.before-security-$STAMP"

sed -i \
  -e 's/server_name [^;]*;/server_name yx.huiliyill.cn;/' \
  -e 's#extension/yeu\.huiliyill\.cn/#extension/yx.huiliyill.cn/#g' \
  "$VHOST"

# Only observed CDN peers may provide the client address. Direct requests and
# unknown/new edges fall back to their TCP source address.
install -o root -g root -m 0644 \
  "$OPS_DIR/nginx/trusted-client-ip.conf" \
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

# Static assets are normally served directly by Nginx. If a newly extracted
# release temporarily has restrictive ownership, fall back to Nitro instead
# of returning a cached 404 for logos and WeChat share thumbnails.
sed -i \
  -e '/location \/icons\/ {/,/^    }/ s/try_files \$uri =404;/try_files \$uri @nuxt;/' \
  -e '/location \/images\/ {/,/^    }/ s/try_files \$uri =404;/try_files \$uri @nuxt;/' \
  "$VHOST"

install -o root -g root -m 0644 \
  "$OPS_DIR/nginx/assistant-stream.conf" \
  "$EXTENSION/assistant-stream.conf"
install -o root -g root -m 0644 \
  "$OPS_DIR/nginx/admin-media-upload.conf" \
  "$EXTENSION/admin-media-upload.conf"
install -o root -g root -m 0644 \
  "$OPS_DIR/nginx/place-moments-upload.conf" \
  "$EXTENSION/place-moments-upload.conf"
install -o root -g root -m 0644 \
  "$OPS_DIR/nginx/0.yeu_zz_anti_crawl.conf" \
  /www/server/panel/vhost/nginx/0.yeu_zz_anti_crawl.conf
install -o root -g root -m 0644 \
  "$OPS_DIR/nginx/anti-crawl-vhost.conf" \
  "$EXTENSION/anti-crawl.conf"

# robots.txt is served from shared storage so an old CDN/origin release cannot
# resurrect the previous crawler policy.
install -d -o root -g root -m 0755 "$ROOT/shared/public-extra"
install -o root -g root -m 0644 \
  "$PUBLIC_DIR/robots.txt" \
  "$ROOT/shared/public-extra/robots.txt"

"$NGINX" -t
"$NGINX" -s reload
