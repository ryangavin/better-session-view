import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Same Vite/React pipeline as mix; no reach alias or writable harness plugins.
export default defineConfig({
  root:fileURLToPath(new URL('..',import.meta.url)),plugins:[react()],
  cacheDir:fileURLToPath(new URL('../../node_modules/.vite/mix-smoke',import.meta.url)),
  server:{strictPort:true,fs:{allow:[fileURLToPath(new URL('../..',import.meta.url))]}},
});
