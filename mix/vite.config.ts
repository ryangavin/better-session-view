import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS, uiPort } from '@openflow/desktop/apps.ts';
import { truthWriter } from './harness/vite-truth.ts';
import { gridExport } from './harness/vite-export.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

// The dev port is this app's offset in `desktop/src/apps.ts`, read here and by
// the app's own main process — one number, one place. A worktree that moves
// OPENFLOW_PORT_BASE takes every dev server with it.
//
// Nothing to proxy. mix[flow] talks to no server: separation is a child process
// the main process runs, and what the renderer sees of it arrives over IPC.
const PORT = uiPort(APPS.mix);

/**
 * While serving, `electron` resolves to a browser stand-in, which is what lets
 * `harness/reach.html` run the app's own preload unchanged.
 *
 * Keyed on `command` rather than on an environment variable because this is the
 * one process that cannot read one: vite is started by `watch` beside the app
 * rather than by it, so it never sees `OPENFLOW_DEV`. Serving is the same
 * question anyway, and a `build` is left exactly as it was — nothing in `src/`
 * imports electron, and the preload the real app ships is bundled by esbuild
 * rather than by this config.
 */
export default defineConfig(({ command }) => ({
  root: here,
  resolve: {
    alias: (command === 'serve'
      ? { electron: path.resolve(here, '../desktop/src/reach-client.ts') }
      : {}) as Record<string, string>,
  },
  // The harness page under harness/ saves hand-corrected beats through the dev server.
  plugins: [
    react(),
    truthWriter(path.resolve(here, 'harness', 'reports')),
    gridExport(path.resolve(here, 'harness', 'reports')),
  ],
  // Named, because `npm run dev` runs several of these at once and the default
  // resolves to the same `node_modules/.vite` for all of them.
  cacheDir: path.resolve(here, '../node_modules/.vite/mix'),
  // Nothing may come from a CDN — this eventually runs on stage.
  build: {
    outDir: path.resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: PORT,
    strictPort: true,
    // widgets/ lives outside this root, and Vite refuses paths above it.
    fs: { allow: [path.resolve(here, '..')] },
  },
}));
