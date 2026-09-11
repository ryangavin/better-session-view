import { test,expect } from 'vitest';
import { chromium,type Browser } from '@playwright/test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir,writeFile } from 'node:fs/promises';

// Vitest owns the DSP assertions. Chromium supplies actual Web Audio/WASM only;
// there are no UI gestures, Playwright test definitions or native app connections.
test('limits real worklet outputs and aligns cue/master blend at three sample rates',async()=>{
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
    const report=await page.evaluate<Array<{rate:number;overload:boolean;peak:number;unityError:number;stereoError:number;ceiling:number;delay:number;errors:string[]}>>(
      "import('/harness/limiter-render.ts').then(m => m.renderLimiterScenarios())");
    expect(errors).toEqual([]);expect(report).toHaveLength(6);
    for(const result of report){
      expect(result.errors).toEqual([]);expect(result.peak).toBeLessThanOrEqual(result.ceiling+1e-6);
      if(!result.overload)expect(result.unityError).toBeLessThan(1e-6);
      expect(result.stereoError).toBeLessThan(1e-5);
    }
    const engine=await page.evaluate<{peaks:number[];tapError:number}>("import('/harness/limiter-render.ts').then(m=>m.renderEngineProtection())");
    for(const peak of engine.peaks.slice(0,6)){expect(peak,JSON.stringify(engine)).toBeGreaterThan(.1);expect(peak).toBeLessThanOrEqual(10**(-1/20)+1e-6);}
    expect(engine.peaks[6]).toBeGreaterThan(1);expect(engine.tapError).toBeLessThan(1e-6);
    expect(errors).toEqual([]);
    const directory=fileURLToPath(new URL('../../report/mix-dsp/',import.meta.url));
    await mkdir(directory,{recursive:true});await writeFile(`${directory}limiter-render.json`,JSON.stringify({report,engine},null,2));

  }finally{
    try{await browser?.close();}finally{await server.close();}
  }
});
