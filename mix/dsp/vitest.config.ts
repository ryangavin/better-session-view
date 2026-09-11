import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root:fileURLToPath(new URL('../..',import.meta.url)),
  test:{name:'mix/dsp',include:['mix/dsp/**/*.test.ts'],environment:'node',
    maxWorkers:1,fileParallelism:false,testTimeout:60_000,retry:0,
    reporters:['default','json'],
    outputFile:{json:fileURLToPath(new URL('../../report/mix-dsp/results.json',import.meta.url))}},
});
