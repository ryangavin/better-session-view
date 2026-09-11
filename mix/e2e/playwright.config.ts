import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.MIX_SMOKE_PORT ?? 15773);
export default defineConfig({
  testDir: '.', testMatch:'*.spec.ts', workers:1, fullyParallel:false,
  retries:0, timeout:30_000, expect:{timeout:5_000},
  outputDir:'../../report/mix-playwright',
  reporter:[['list'],['json',{outputFile:fileURLToPath(new URL('../../report/mix-playwright-results.json',import.meta.url))}]],
  use:{baseURL:`http://127.0.0.1:${port}`,browserName:'chromium',headless:true,
    viewport:{width:1800,height:900},trace:'retain-on-failure',screenshot:'only-on-failure'},
  // Never reuse/restart the user's Vite or Electron process. A busy test port fails closed.
  webServer:{command:`node node_modules/vite/bin/vite.js --config mix/e2e/vite.config.ts --host 127.0.0.1 --port ${port}`,
    cwd:fileURLToPath(new URL('../..',import.meta.url)),
    url:`http://127.0.0.1:${port}/harness/smoke.html`,reuseExistingServer:false,timeout:30_000},
});
