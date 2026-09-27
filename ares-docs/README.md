# Ares ASM documentation site

The user-guide content, built with [Docusaurus](https://docusaurus.io/), one source shared by
two very different builds:

- **Public** (default, `npm run build`): the full multi-version site for `docs.martecyber.com`,
  with every past release browsable via the version dropdown — see "Versioning" below.
- **Local** (`DOCS_BUILD_MODE=local npm run build`): a single-version build of just the current,
  unreleased `docs/` folder — no version picker, since a given deployment only ever runs one
  version. This is what gets baked into every `ares-ui` image at `dist/docs/` (see
  `build.sh`/`deploy/build.sh`/`ares-ui/Dockerfile.multistage`) and served same-origin at `/docs/`
  — so the in-app "Documentation" menu's "User Guide" link (`ares-ui/src/layouts/AppShell.vue`)
  always works even with no internet access, and always matches whatever's actually running.
  Swagger (proxied through nginx alongside `/api/`, see `ares-ui/nginx.conf`) is the other half
  of that same menu.

## Authoring

Edit pages under `docs/` — that folder is always the **current, unreleased** content. Write
plain Markdown/MDX; the sidebar is auto-generated from the folder structure (`sidebars.ts`).

```bash
npm install
npm run start   # live-reloading dev server at http://localhost:3000
```

## Versioning — one snapshot per release git tag

This site's version dropdown is driven by git tags on the main repo, not manually maintained.
Each release gets tagged `vX.Y.Z-betaN` (matching `ares-core/pom.xml`'s `<revision>`, the same
version `GET /api/v1/versions` reports and the app's footer/about menu shows) as part of the
normal release process:

```bash
git tag v0.6.0-beta37 && git push --tags
```

To (re)build the full multi-version static site — snapshotting `docs/` as it existed at every
release tag into Docusaurus's own `versioned_docs/`, then building everything:

```bash
scripts/build-versions.sh          # last 20 tags by default
scripts/build-versions.sh 5        # or cap it lower while iterating locally
```

Output lands in `build/`. A tag that predates this feature (no `ares-docs/docs/` at that commit)
is skipped automatically, so the version dropdown only ever lists releases that actually shipped
docs content.

The public build (this script's output) is published wherever `docs.martecyber.com` is actually
hosted — see `scripts/publish.sh` — and is the only place the full version history is browsable.
It is deliberately **not** linked from inside the app itself (see "Local" above).

## Publishing

```bash
DOCS_HOST=deploy@docs.martecyber.com scripts/publish.sh
```

Manual for now (no CI in this repo yet, same as the root `deploy.sh`) — `rsync`s `build/` to
wherever that host actually serves static files from.
