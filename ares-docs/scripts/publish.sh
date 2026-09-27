#!/usr/bin/env bash
# Publishes the built multi-version site (ares-docs/build/, see build-versions.sh) to the
# vendor-hosted public docs domain (docs.martecyber.com — separate infrastructure from any
# client's own self-hosted deployment). Manual/scripted for now, same pattern as the repo root's
# deploy.sh — there's no CI in this repo yet.
#
# Fill in DOCS_HOST once that server exists; this is a placeholder until then.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_HOST="${DOCS_HOST:?Set DOCS_HOST to user@host, e.g. DOCS_HOST=deploy@docs.martecyber.com scripts/publish.sh}"
DOCS_PATH="${DOCS_PATH:-/var/www/ares-docs}"

if [ ! -d "$ROOT/build" ]; then
  echo "Nothing built yet — run scripts/build-versions.sh first." >&2
  exit 1
fi

rsync -avz --delete "$ROOT/build/" "$DOCS_HOST:$DOCS_PATH/"
echo "Published $ROOT/build/ -> $DOCS_HOST:$DOCS_PATH/"
