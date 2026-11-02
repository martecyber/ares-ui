import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// The UI's own version (bumped by the release workflow) — shown in the footer next to the
// API's, which can't know which UI build is deployed.
const uiVersion: string = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = env.VITE_API_BASE || 'http://localhost:8888';

  return {
    plugins: [vue(), tailwindcss()],
    define: {
      __ARES_UI_VERSION__: JSON.stringify(uiVersion),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiBase, changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
    },
  };
});
