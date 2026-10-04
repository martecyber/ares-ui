#!/bin/sh
# Rewrites nginx.conf's hardcoded "ares-api:8888" upstream to whatever ARES_API_HOST resolves to
# — needed because nginx.conf assumes Docker Compose's embedded DNS, where "ares-api" is the
# sibling container's service name. That doesn't hold on a platform with no such DNS (e.g. a
# shared-pod container platform where sibling containers are reached via localhost instead of a
# name) — set ARES_API_HOST=localhost there. Left unset, this is a no-op: the file already says
# "ares-api", matching this image's original Docker Compose behavior.
#
# Runs automatically before nginx starts — nginx's official image sources every executable
# *.sh file under /docker-entrypoint.d/, in name order, as part of its own entrypoint. Numbered
# to run before 10-enable-ssl.sh, though the two don't actually interact.
set -e

if [ -n "$ARES_API_HOST" ] && [ "$ARES_API_HOST" != "ares-api" ]; then
  sed -i "s/ares-api:8888/${ARES_API_HOST}:8888/g" /etc/nginx/conf.d/default.conf
  echo "05-api-upstream.sh: API upstream set to ${ARES_API_HOST}:8888"
fi
