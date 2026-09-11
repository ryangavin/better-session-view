import { expect, it } from 'vitest';
import { prepare, buckets, rms, heights, amplitude, settingsOf, DEFAULTS } from './model.ts';
function model(peak:number[],energy=peak,seconds=peak.length){const values=Float32Array.from(energy);return prepare({seconds,step:1,peak:Float32Array.from(peak),rms:values,bands:[values,values,values],stems:[]});}
it('uses identical, centered, non-overlapping source buckets for peak and RMS including the tail',()=>{
  const m=model([1,2,3,4,5],[.5,1,1.5,2,2.5]);const result=buckets(m,0,5,4,DEFAULTS);
  expect(result.map(b=>[b.from,b.to,b.at,b.peak])).toEqual([[0,2,1,2],[2,5,3.5,5]]);
  expect(result[0].raw).toBeCloseTo(Math.sqrt((.25+1)/2));expect(result[1].raw).toBeCloseTo(Math.sqrt((2.25+4+6.25)/3));
});
it('weights the last partial bin by its actual duration',()=>{
  const m=model([0,1],[0,1],1.25);expect(rms(m,0,2)).toBeCloseTo(Math.sqrt(.25/1.25));
  expect(buckets(m,0,1.25,2,DEFAULTS)[0].to).toBe(1.25);
});
it('keeps the track reference fixed when zooming into a quieter passage',()=>{
  const m=model([1,.25,.25,.25]);const wide=buckets(m,0,4,8,DEFAULTS),zoom=buckets(m,1,3,8,DEFAULTS);
  expect(m.reference).toBe(1);expect(heights(wide[1],m.reference,DEFAULTS).peak).toBe(.25);expect(heights(zoom[0],m.reference,DEFAULTS).peak).toBe(.25);
});
it('distinguishes true window RMS from the peak of short-window RMS without independent normalization',()=>{
  const m=model([1,1,1,1],[0,1,0,0]);const raw=buckets(m,0,4,2,DEFAULTS)[0];const peak=buckets(m,0,4,2,{...DEFAULTS,energy:'short-peak',windowMs:1000})[0];
  expect(raw.raw).toBe(.5);expect(raw.energy).toBe(.5);expect(peak.raw).toBe(.5);expect(peak.energy).toBe(1);expect(peak.peak).toBe(1);
});
it('keeps silence zero in either scale even with emphasis and retains a raw unmodified overlay',()=>{
  for(const scale of ['linear','db'] as const){const s={...DEFAULTS,scale,gain:12,contrast:.5};expect(amplitude(0,1,s)).toBe(0);expect(heights(buckets(model([0]),0,1,10,s)[0],0,s)).toEqual({peak:0,raw:0,core:0});}
  const b=buckets(model([1],[.25]),0,1,10,DEFAULTS)[0];const treated=heights(b,1,{...DEFAULTS,gain:6,contrast:1.2});expect(treated.raw).toBe(.25);expect(treated.core).toBeGreaterThan(.25);expect(treated.core).toBeLessThanOrEqual(treated.peak);
});
it('maps dB range with a common reference and clamps visual cores to the peak outline',()=>{
  const s={...DEFAULTS,scale:'db' as const,floor:-40};expect(amplitude(.1,1,s)).toBe(.5);expect(amplitude(.001,1,s)).toBe(0);
  for(const scale of ['linear','db'] as const)for(const gain of [-6,0,12])for(const contrast of [.5,1,2.5]){
    const b=buckets(model([.5],[.4]),0,1,10,DEFAULTS)[0],h=heights(b,1,{...s,scale,gain,contrast});expect(h.core).toBeGreaterThanOrEqual(0);expect(h.core).toBeLessThanOrEqual(h.peak);
  }
});
it('validates persisted choices and rejects corrupt measurements',()=>{
  expect(settingsOf(null)).toEqual(DEFAULTS);expect(settingsOf({gain:Infinity,contrast:-3,floor:20})).toMatchObject({gain:0,contrast:.5,floor:-12});
  expect(()=>model([NaN])).toThrow('Non-finite');expect(buckets(model([]),0,1,100,DEFAULTS)).toEqual([]);
});
