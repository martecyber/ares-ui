#!/usr/bin/env bash
# Snapshots docs/ at each release git tag into Docusaurus's own versioning files, then builds
# the full multi-version static site into build/.
#
# Docusaurus's versioning format (see https://docusaurus.io/docs/versioning):
#   versions.json                                     — ordered list of labels, newest first
#   versioned_docs/version-<label>/                   — verbatim copy of docs/ as of that tag
#   versioned_sidebars/version-<label>-sidebars.json   — sidebar snapshot
# `docusaurus docs:version <label>` writes all three from whatever is CURRENTLY in docs/ — so
# for each tag this script checks out a throwaway git worktree at that tag, swaps its
# ares-docs/docs/ into place here, runs docs:version, then restores the live docs/ tree.
#
# Usage: scripts/build-versions.sh [max-versions]   (default 20 — keeps build time sane)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # ares-docs/
REPO="$(cd "$ROOT/.." && pwd)"                             # repo root
MAX_VERSIONS="${1:-20}"

cd "$ROOT"
git -C "$REPO" worktree prune

# Newest-first (for capping to the last N), then reversed to oldest-first for the actual loop —
# `docusaurus docs:version` always PREPENDS to versions.json, so processing oldest→newest is what
# leaves the newest release at the top of the version dropdown afterward.
tags_desc="$(git -C "$REPO" tag -l 'v*' --sort=-v:refname | head -n "$MAX_VERSIONS")"
if [ -z "$tags_desc" ]; then
  echo "No release tags found (git tag -l 'v*') — building docs/ as unversioned content only."
  npm run build
  exit 0
fi
tags="$(printf '%s\n' "$tags_desc" | tac)"

for tag in $tags; do
  label="${tag#v}"
  if [ -d "versioned_docs/version-$label" ]; then
    echo "version-$label already snapshotted, skipping"
    continue
  fi

  worktree="/tmp/docs-snapshot-$tag"
  rm -rf "$worktree"
  if ! git -C "$REPO" worktree add --detach "$worktree" "$tag" >/dev/null 2>&1; then
    echo "Could not check out $tag, skipping"
    continue
  fi

  if [ ! -d "$worktree/ares-docs/docs" ]; then
    echo "$tag predates ares-docs/ (no docs/ folder at that commit) — skipping"
    git -C "$REPO" worktree remove --force "$worktree"
    continue
  fi

  echo "Snapshotting $tag as version $label..."
  rm -rf docs.at-tag
  cp -r "$worktree/ares-docs/docs" docs.at-tag
  mv docs docs.live
  mv docs.at-tag docs
  npx docusaurus docs:version "$label"
  rm -rf docs
  mv docs.live docs

  git -C "$REPO" worktree remove --force "$worktree"
done

echo "Building final multi-version site..."
npm run build
