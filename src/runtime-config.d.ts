// Global runtime config injected by index.html's /config.js (see public/config.js and
// docker-entrypoint.d/06-sentry-config.sh) — declared here so main.ts can read it without `any`.
// Not a Vite import.meta.env.VITE_* value: this image is built once in CI and deployed
// unchanged everywhere, so anything that can differ per deployment (like the Sentry DSN) has to
// be settable at container-startup time, not baked in at build time.
interface AresRuntimeConfig {
  sentryDsn: string;
}

declare global {
  interface Window {
    ARES_RUNTIME_CONFIG?: AresRuntimeConfig;
  }
}

export {};
