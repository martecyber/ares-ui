# ares-ui

Vue 3 SPA for the Ares panel. Cross-org view: manages every client organization within one MSSP
instance.

## Stack

- Vue 3 + TypeScript + Vite 5
- vue-router 4
- Pinia 2
- PrimeVue 4 (Aura theme) + PrimeIcons
- Tailwind CSS 4
- axios (+ JWT interceptor)
- vee-validate + zod (forms)
- Vue I18n (Spanish / English)

## Scripts

```bash
pnpm install
pnpm dev            # http://localhost:5173, proxies /api → :8888
pnpm build          # output in dist/
pnpm preview        # serves dist/
pnpm test           # vitest
pnpm type-check     # vue-tsc --noEmit
pnpm lint           # eslint
```

## Configuration

`.env` (copy from `.env.example`):

```
VITE_API_BASE=http://localhost:8888
VITE_APP_NAME=Ares MSSP
```

Vite proxies `/api/**` to the backend, so the app calls relative paths.

## Structure

```
src/
├── main.ts              Bootstrap Vue + Pinia + PrimeVue + router
├── App.vue              Root shell (just <RouterView /> + Toast)
├── router/              Route definitions + auth guard
├── stores/              Pinia (auth, orgs, engagements…)
├── api/                 Axios client + typed endpoints
├── views/               Route views (lazy-loaded)
├── components/          Local components
├── layouts/             AppShell, sidebars, top-bars
└── assets/              Global CSS, images
```

## Main routes

| Route | Purpose |
|---|---|
| `/login` | Login |
| `/dashboard` | Cross-org KPIs |
| `/clients` | Client orgs |
| `/engagements` | Cross-org engagements |
| `/findings` | Triage queue |
| `/assets` | Asset explorer |
| `/kb` | Knowledge base |
| `/admin/...` | Users, roles, licensing, settings |
