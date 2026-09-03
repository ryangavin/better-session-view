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

export default defineConfig({
  root: here,
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
});
