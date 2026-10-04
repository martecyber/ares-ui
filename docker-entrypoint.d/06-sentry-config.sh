#!/bin/sh
# Overwrites /config.js with the real SENTRY_DSN, if set — needed because this is a static SPA
# bundle built once in CI and deployed unchanged everywhere; Vite's import.meta.env.VITE_* only
# bakes values in at BUILD time, so there's no way to configure a per-deployment DSN that way.
# main.ts reads window.ARES_RUNTIME_CONFIG (set by this file, loaded via index.html's own
# <script src="/config.js"> before the app bundle) instead. Left as the committed all-empty
# default (see public/config.js) when SENTRY_DSN is unset — no Sentry/GlitchTip init happens.
#
# Runs automatically before nginx starts — nginx's official image sources every executable
# *.sh file under /docker-entrypoint.d/, in name order, as part of its own entrypoint.
set -e

if [ -n "$SENTRY_DSN" ]; then
  cat > /usr/share/nginx/html/config.js <<EOF
window.ARES_RUNTIME_CONFIG = {
  sentryDsn: '${SENTRY_DSN}',
};
EOF
  echo "06-sentry-config.sh: Sentry/GlitchTip DSN configured"
fi
