import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { DEV_BACKEND_PORT, TOKEN_HEADER } from './shared/host';

// In development the UI calls /api on its own origin and this proxy forwards it
// to the backend with the token scripts/dev.mjs shares between the two.
const api = {
  '/api': {
    target: `http://127.0.0.1:${DEV_BACKEND_PORT}`,
    headers: { [TOKEN_HEADER]: process.env.GITTER_TOKEN ?? '' },
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: { ignored: ['**/src-tauri/**'] },
    proxy: api,
  },
  preview: { port: 4173, proxy: api },
});
