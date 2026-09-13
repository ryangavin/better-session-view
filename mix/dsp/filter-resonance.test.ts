import { test,expect } from 'vitest';
import { chromium,type Browser } from '@playwright/test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir,writeFile } from 'node:fs/promises';

// Vitest owns the DSP assertions. Chromium supplies actual Web Audio/WASM only;
// there are no UI gestures, Playwright test definitions or native app connections.
test('renders resonance in both directions, neutral center and protected headroom at three sample rates',async()=>{
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
    const result=await page.evaluate<Awaited<ReturnType<typeof import('../harness/filter-resonance-render.ts').renderFilterResonance>>>(
      "import('/harness/filter-resonance-render.ts').then(m => m.renderFilterResonance())");
    expect(errors).toEqual([]);expect(result.reports).toHaveLength(9);
    for(const report of result.reports){
      expect(report.finite).toBe(true);
      expect(report.peaks[2]).toBeLessThanOrEqual(10**(-1/20)+1e-6);
      if(report.direction===0){expect(report.centerError).toBeLessThan(1e-6);expect(report.ratio).toBeCloseTo(1,6);}
      else {
        expect(report.ratio).toBeCloseTo(10**(12/20),2);
        expect(report.peaks[1]).toBeGreaterThan(1.9);
        expect(report.peaks[1]).toBeLessThan(2.2);
        expect(report.peaks[2]).toBeGreaterThan(.8);
      }
    }
    expect(result.sweep.finite).toBe(true);expect(result.sweep.peak).toBeLessThan(5);
    const decks=await page.evaluate<Awaited<ReturnType<typeof import('../harness/filter-resonance-render.ts').renderDeckResonanceIsolation>>>(
      "import('/harness/filter-resonance-render.ts').then(m=>m.renderDeckResonanceIsolation())");
    expect(decks.finite).toBe(true);expect(decks.ratio).toBeCloseTo(10**(12/20),2);
    expect(decks.rms[1]).toBeCloseTo(.1/Math.sqrt(2),3);
    expect(errors).toEqual([]);
    const directory=fileURLToPath(new URL('../../report/mix-dsp/',import.meta.url));
    await mkdir(directory,{recursive:true});await writeFile(`${directory}filter-resonance.json`,JSON.stringify({...result,decks},null,2));

  }finally{
    try{await browser?.close();}finally{await server.close();}
  }
});
