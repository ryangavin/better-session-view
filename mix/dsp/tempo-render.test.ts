import { test,expect } from 'vitest';
import { chromium,type Browser } from '@playwright/test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir,writeFile } from 'node:fs/promises';
import type { renderTempoScenarios } from '../harness/tempo-render.ts';

// Vitest owns the DSP assertions. Chromium supplies actual Web Audio/WASM only;
// there are no UI gestures, Playwright test definitions or native app connections.
test('actual voice output preserves pitch/groove and agrees with source position',async()=>{
  const server=await createServer({configFile:fileURLToPath(new URL('../e2e/vite.config.ts',import.meta.url)),
    cacheDir:fileURLToPath(new URL('../../node_modules/.vite/mix-dsp',import.meta.url)),
    server:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'});
  let browser:Browser|undefined;
  try{
    await server.listen();
    const address=server.httpServer!.address();
    if(!address || typeof address==='string')throw new Error('DSP server did not bind an isolated TCP port');
    const baseURL=`http://127.0.0.1:${address.port}`;
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      if(new URL(route.request().url()).origin===baseURL)return route.continue();
      errors.push(`Forbidden request: ${route.request().url()}`);return route.abort();
    });
    await page.routeWebSocket('**/*',socket=>{
      if(new URL(socket.url()).host===new URL(baseURL).host)socket.connectToServer();
      else {errors.push(`Forbidden socket: ${socket.url()}`);socket.close();}
    });
    await page.addInitScript(()=>{
      globalThis.AudioContext=class {constructor(){throw new Error('Real-time AudioContext forbidden in offline regression');}} as unknown as typeof AudioContext;
      Object.defineProperty(navigator,'requestMIDIAccess',{value:()=>{throw new Error('MIDI forbidden');}});
    });
    // The existing diagnostic HTML gives the module an origin; its controls are unused.
    await page.goto(`${baseURL}/harness/tempo-render.html`);
    // Keep browser-side import outside Vitest's server-side module transform.
    const report=await page.evaluate<Awaited<ReturnType<typeof renderTempoScenarios>>>(
      "import('/harness/tempo-render.ts').then(renderer => renderer.renderTempoScenarios())");
    const directory=fileURLToPath(new URL('../../report/mix-dsp/',import.meta.url));
    await mkdir(directory,{recursive:true});
    await writeFile(`${directory}tempo-render.json`,JSON.stringify({browserVersion:browser.version(),...report,errors},null,2));
    expect(report.error).toBeUndefined();expect(errors).toEqual([]);
    expect(report.results).toHaveLength(7);
    for(const result of report.results){
      expect(result.rms,result.name).toBeGreaterThan(.02);
      expect(result.maxSilentSeconds,`${result.name}: settled tone gap seconds`).toBeLessThan(.001);
      expect(result.path,result.name).toBe(result.ratio!==1 && result.preservePitch?'stretch':'native');
      expect(result.rate,result.name).toBeCloseTo(result.ratio,6);
      expect(Math.abs(result.frequency-result.expectedFrequency),`${result.name}: Hz`).toBeLessThan(1);
      for(const window of result.frequencyWindows)
        expect(Math.abs(window.actual-window.expected),`${result.name}: Hz at ${window.from}s`).toBeLessThan(1);
      expect(result.nativeSourceCount,`${result.name}: native source reuse`).toBe(result.path==='native'?1:0);
      if(!result.loop)expect(result.maxAdvanceError,`${result.name}: source advancement continuity`).toBeLessThan(2/48000);
      expect(result.onsets.length,result.name).toBeGreaterThan(5);
      expect(Math.min(...result.onsets.map(o=>o.amplitude)),`${result.name}: percussion missing`).toBeGreaterThan(.05);
      expect(Number.isFinite(result.maxSourceError),`${result.name}: finite position evidence`).toBe(true);
      // Preserve the original rendered tolerances: stretch envelopes <=5ms; native
      // carrier-peak relocation <=1ms (<=1.5ms through retime), intervals tighter.
      expect(result.maxSourceError,`${result.name}: source seconds`).toBeLessThan(result.preservePitch && result.ratio!==1?.005:result.retime?.0015:.001);
      expect(result.maxIntervalError,`${result.name}: groove interval seconds`).toBeLessThan(result.preservePitch && result.ratio!==1?.005:result.retime?.001:2/48000);
    }
  }finally{
    try{await browser?.close();}finally{await server.close();}
  }
});
