import { test,expect } from '@playwright/test';
import type { TempoRenderResult } from '../harness/tempo-render.ts';

test('offline actual voice output preserves pitch/groove and agrees with source position',async({page,baseURL},info)=>{
  test.setTimeout(60_000);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin===baseURL)return route.continue();
    errors.push(`Forbidden request: ${route.request().url()}`);return route.abort();
  });
  await page.routeWebSocket('**/*',socket=>{
    if(new URL(socket.url()).host===new URL(baseURL!).host)socket.connectToServer();
    else {errors.push(`Forbidden socket: ${socket.url()}`);socket.close();}
  });
  // Any accidental real-time output or native/MIDI request makes this test fail.
  await page.addInitScript(()=>{
    globalThis.AudioContext=class {constructor(){throw new Error('Real-time AudioContext forbidden in offline regression');}} as unknown as typeof AudioContext;
    Object.defineProperty(navigator,'requestMIDIAccess',{value:()=>{throw new Error('MIDI forbidden');}});
  });
  await page.goto('/harness/tempo-render.html');
  await page.getByRole('button',{name:'Run offline tempo checks'}).click();
  await expect(page.getByRole('status')).toHaveAttribute('data-complete','true',{timeout:55_000});
  const report=JSON.parse((await page.getByRole('status').textContent())!) as {results:TempoRenderResult[];error?:string};
  await info.attach('offline-tempo-measurements',{body:JSON.stringify(report,null,2),contentType:'application/json'});
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
    // 5ms leaves room over the measured <=2.5ms stretch peak movement while still
    // resolving this fixture's 30/40ms groove displacements. A resampled 1700Hz
    // burst's absolute maximum can move by a carrier cycle (<1ms), even though its
    // inter-onset intervals remain sample-accurate. Stretch envelope peaks may move further.
    expect(result.maxSourceError,`${result.name}: source seconds`).toBeLessThan(result.preservePitch && result.ratio!==1?.005:result.retime?.0015:.001);
    expect(result.maxIntervalError,`${result.name}: groove interval seconds`).toBeLessThan(result.preservePitch && result.ratio!==1?.005:result.retime?.001:2/48000);
  }
});
