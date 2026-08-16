import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The bench is a dev harness and is never built — there is no `outDir` on
// purpose. Nothing here ships; the device serves `ui/` and only `ui/`.
//
// strictPort for the same reason `ui/` has it: a server that silently drifts to
// the next free port leaves nothing able to say which URL it ended up on.
const PORT = Number(process.env.BSV_BENCH_PORT) || 5174;

export default defineConfig({
  root: path.resolve(here, 'bench'),
  plugins: [react()],
  server: {
    port: PORT,
    strictPort: true,
    // The bench lives under the module it exercises, so it reaches up one level
    // into `src/`. Vite refuses paths outside its root without this.
    fs: { allow: [path.resolve(here, '..')] },
  },
});
