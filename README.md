# ares-ui

SPA Vue 3 del panel Ares. Cross-org view: permite gestionar todas las client organizations dentro de la instancia MSSP.

## Stack

- Vue 3 + TypeScript + Vite 5
- vue-router 4
- Pinia 2
- PrimeVue 4 (tema Aura) + PrimeIcons
- Tailwind CSS 4
- axios (+ interceptor JWT)
- vee-validate + zod (formularios)
- Vue I18n (español / inglés)

## Scripts

```bash
pnpm install        # desde la raíz del monorepo
pnpm dev            # arranca en http://localhost:5173, proxy /api → :8888
pnpm build          # output en dist/
pnpm preview        # sirve dist/
pnpm test           # vitest
pnpm type-check     # vue-tsc --noEmit
pnpm lint           # eslint
```

## Configuración

`.env` (copiar de `.env.example`):

```
VITE_API_BASE=http://localhost:8888
VITE_APP_NAME=Ares MSSP
```

Vite hace proxy de `/api/**` al backend, de modo que el código llama a rutas relativas.

## Estructura

```
src/
├── main.ts              Bootstrap Vue + Pinia + PrimeVue + router
├── App.vue              Shell raíz (sólo <RouterView /> + Toast)
├── router/              Definición de rutas + guard de auth
├── stores/              Pinia (auth, orgs, engagements…)
├── api/                 Cliente axios + endpoints tipados
├── views/               Vistas por ruta (lazy-loaded)
├── components/          Componentes locales
├── layouts/             AppShell, sidebars, top-bars
└── assets/              CSS global, imágenes
```

## Rutas principales

Ver [`../docs/UI_DESIGN.md`](../docs/UI_DESIGN.md) para el mapa completo de navegación.

| Ruta | Propósito |
|---|---|
| `/login` | Login |
| `/dashboard` | KPIs cross-org |
| `/clients` | Client orgs |
| `/engagements` | Engagements cross-org |
| `/findings` | Triage queue |
| `/assets` | Asset explorer |
| `/kb` | Knowledge base |
| `/admin/...` | Users, roles, licensing, settings |
