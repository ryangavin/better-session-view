import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The bench is a dev harness and is never built — there is no `outDir` on
// purpose. Nothing here ships; the device serves `ui/` and only `ui/`.
//
// The port follows the UI's rather than being a second thing to assign, so a
// worktree that moves its UI takes its bench along in one variable. The offset
// is 100 and not 1 because worktree ports get picked adjacently — 5173, 5174,
// 5175 — and a +1 bench would land on the neighbouring worktree's UI.
//
// strictPort for the same reason `ui/` has it: a server that silently drifts to
// the next free port leaves nothing able to say which URL it ended up on.
const UI_PORT = Number(process.env.BSV_UI_PORT) || 5173;
const PORT = Number(process.env.BSV_BENCH_PORT) || UI_PORT + 100;

export default defineConfig({
  root: path.resolve(here, 'bench'),
  plugins: [react()],
  // See `ui/vite.config.ts` — both servers run together, and the default cache
  // directory is the same one for both.
  cacheDir: path.resolve(here, '../node_modules/.vite/bench'),
  server: {
    port: PORT,
    strictPort: true,
    // The bench lives under the module it exercises, so it reaches up one level
    // into `src/`. Vite refuses paths outside its root without this.
    fs: { allow: [path.resolve(here, '..')] },
  },
});
