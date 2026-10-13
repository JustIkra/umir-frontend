import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Development only: /api goes to the gateway of the local backend
  // (umir-2026/dev/backend-v2). Open http://127.0.0.1:5173 — gateway's
  // loopback mode refuses a localhost Origin.
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.UMIR_GATEWAY_URL ?? 'http://127.0.0.1:18081',
      },
    },
  },
});
