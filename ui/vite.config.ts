import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// One bridge, many UIs. Each worktree runs its own dev server on its own port and
// proxies through to the same device, so several UIs share one Live session — which
// is the multi-client case the bridge is meant to serve anyway.
//
// strictPort stays on deliberately: a dev server that silently drifts to the next
// free port is worse than one that fails, because nothing downstream can then say
// which URL it ended up on.
const BRIDGE = process.env.BSV_BRIDGE || 'http://127.0.0.1:17800';
const PORT = Number(process.env.BSV_UI_PORT) || 5173;

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
    port: PORT,
    strictPort: true,
    // Dev serves the UI here but the bridge stays authoritative for data.
    //
    // Every non-asset route the bridge answers has to be listed. Anything missing
    // doesn't fail — it falls through to the SPA and comes back as index.html,
    // which `r.json()` rejects and a `.catch` turns into an empty result. That is
    // exactly how /roles.json went missing here: the vocabulary silently never
    // loaded in dev, and looked like a set that simply had no roles configured.
    proxy: {
      '/ws': { target: BRIDGE.replace('http', 'ws'), ws: true },
      '/palette.json': BRIDGE,
      '/roles.json': BRIDGE,
    },
  },
});
