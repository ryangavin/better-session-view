import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The chart builds to `chart/dist`, which `server/index.ts` serves. A separate
// build from `ui/` because it is a separate app for a different pair of eyes —
// nothing here ships inside the device.
//
// The dev port follows the UI's at +400, continuing the offsets in
// widgets/docs/bench.md: UI 5173, widget bench +100, device bench +200, visuals
// +300. A worktree that moves BSV_UI_PORT takes all five with it.
const UI_PORT = Number(process.env.BSV_UI_PORT) || 5173;
const PORT = Number(process.env.BSV_CHART_UI_PORT) || UI_PORT + 400;
const SERVER = process.env.BSV_CHART || 'http://127.0.0.1:18000';

export default defineConfig({
  root: here,
  plugins: [react()],
  cacheDir: path.resolve(here, '../node_modules/.vite/chart'),
  build: {
    outDir: path.resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: PORT,
    strictPort: true,
    // A phone can reach the dev server too, which is the only way to work on
    // this on the thing it is for.
    host: true,
    // core/ lives outside this root, and Vite refuses paths above it.
    fs: { allow: [path.resolve(here, '..')] },
    // Dev serves the page; the chart server stays the only thing talking to the
    // bridge. `text/event-stream` streams through untouched.
    proxy: {
      '/events': { target: SERVER, changeOrigin: true },
    },
  },
});
