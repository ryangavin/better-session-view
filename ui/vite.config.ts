import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = 'http://127.0.0.1:17800';

export default defineConfig({
  root: here,
  plugins: [react()],
  // Nothing may come from a CDN — this eventually runs on stage.
  build: {
    outDir: path.resolve(here, '../bridge/public'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    // Dev serves the UI here but the bridge stays authoritative for data.
    proxy: {
      '/ws': { target: BRIDGE.replace('http', 'ws'), ws: true },
      '/palette.json': BRIDGE,
    },
  },
});
