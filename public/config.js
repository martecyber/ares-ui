// Runtime config, overwritten at container startup by docker-entrypoint.d/06-sentry-config.sh
// (see its own comment) — the committed version here, with everything empty, is what local dev
// (`vite dev`/`vite preview`) and any deployment that never sets SENTRY_DSN actually gets.
window.ARES_RUNTIME_CONFIG = {
  sentryDsn: '',
};
