#!/bin/sh
# Activates HTTPS by writing the listen/ssl_certificate directives nginx.conf's `include`
# picks up, but only if a certificate is actually mounted at /certs — left inactive (HTTP-only,
# matching this image's original behavior) otherwise. See nginx.conf's own comment for why this
# exists: Caddy (the usual TLS terminator in front of this image) cannot do HTTPS at all for a
# bare IP address with no real domain, since TLS clients never send SNI for an IP literal.
#
# Runs automatically before nginx starts — nginx's official image sources every executable
# *.sh file under /docker-entrypoint.d/, in name order, as part of its own entrypoint.
set -e

mkdir -p /etc/nginx/ssl-listen.conf.d

if [ -f /certs/ares.crt ] && [ -f /certs/ares.key ]; then
  cat > /etc/nginx/ssl-listen.conf.d/ssl.conf <<EOF
listen 443 ssl default_server;
listen [::]:443 ssl default_server;
ssl_certificate     /certs/ares.crt;
ssl_certificate_key /certs/ares.key;
EOF
  echo "10-enable-ssl.sh: certificate found at /certs, HTTPS enabled on :443"
else
  echo "10-enable-ssl.sh: no certificate at /certs, HTTPS not enabled (HTTP-only on :80)"
fi
