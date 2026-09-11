import {describe,it,expect} from 'vitest';
import {musicalBeats,musicalTempo,playbackGrid} from './musical.ts';
import {evenBeats,tempoRange,tempoAt,sampleOf} from './warp.ts';
const rate=48000;
describe('musical tempo separates the clock from attack timing',()=>{
  it('keeps a constant 129 BPM under quantization, displaced claps and isolated outliers',()=>{
    const raw=evenBeats(rate,240*rate,129,.17);
    const noisy={...raw,samples:raw.samples.map((s,i)=>Math.round(Math.round((s+rate*(i%47===0?.085:i%2?.012:-.009))/(rate*.0116))*(rate*.0116)))};
    const fitted=musicalBeats(noisy),r=tempoRange(fitted);
    expect(musicalTempo(fitted)).toBeCloseTo(129,1);
    expect(r.fastest-r.slowest).toBeLessThan(.02);
    expect(fitted.musical!.raw.samples).toBe(noisy.samples);
    expect(fitted.musical!.segments).toHaveLength(1);
    expect(Math.abs(sampleOf(fitted,450)-sampleOf(raw,450))/rate).toBeLessThan(.02);
  });
  it('requires sustained evidence for a continuous 128 to 134 step',()=>{
    const samples=Array.from({length:640},(_,i)=>Math.round(rate*(.2+Math.min(i,320)*60/128+Math.max(0,i-320)*60/134+.004*Math.sin(i))));
    const fitted=musicalBeats({rate,length:samples.at(-1)!,first:0,samples});
    expect(fitted.musical!.segments).toHaveLength(2);
    expect(tempoAt(fitted,100)).toBeCloseTo(128,1);
    expect(tempoAt(fitted,500)).toBeCloseTo(134,1);
    expect(Math.abs(fitted.samples[319]-samples[319])/rate).toBeLessThan(.02);
  });
  it('does not call a brief fill a tempo change',()=>{
    const raw=evenBeats(rate,180*rate,120,0);
    const fitted=musicalBeats({...raw,samples:raw.samples.map((s,i)=>s+(i>=100&&i<108?Math.round(rate*.07*Math.sin(i)):0))});
    expect(fitted.musical!.segments).toHaveLength(1);
    expect(musicalTempo(fitted)).toBe(120);
  });
  it('retains manual and unknown legacy maps byte for byte',()=>{
    const beats={...evenBeats(rate,180*rate,120,0),set:[100]};
    const grid={bpm:120,bpmAuto:true,offset:0,beats};
    expect(playbackGrid(grid,'ellis')).toBe(grid);
    expect(playbackGrid({...grid,beats:{...beats,set:undefined}},null).beats!.samples).toBe(beats.samples);
    expect(playbackGrid({...grid,bpmAuto:false},'ellis').beats).toBe(beats);
  });
  it('keeps half-time feel from implying a BPM change when the counted clock stays steady',()=>{
    const raw=evenBeats(rate,240*rate,140,.1);
    const fitted=musicalBeats({...raw,samples:raw.samples.map((s,i)=>s+(i>280 && i%2 ? 200:0))});
    expect(fitted.musical!.segments).toHaveLength(1);
    expect(musicalTempo(fitted)).toBeCloseTo(140,1);
  });
});
it('refuses to invent a tempo change or average when a tracker changes to half-counting',()=>{
  const samples=Array.from({length:640},(_,i)=>Math.round(rate*(Math.min(i,320)*.5+Math.max(0,i-320))));
  const fitted=musicalBeats({rate,length:samples.at(-1)!,first:0,samples});
  expect(fitted.samples).toBe(samples);
  expect(fitted.musical).toMatchObject({version:1,ambiguous:true,segments:[]});
});
it.each([599,600,601])('does not alias alternating groove into tempo for %i observations',count=>{
  const samples=Array.from({length:count},(_,i)=>Math.round(rate*(.2+i*60/129+(i%2?.024:-.024))));
  const fitted=musicalBeats({rate,length:samples.at(-1)!,first:0,samples});
  expect(musicalTempo(fitted)).toBe(129);
  expect(Math.abs((fitted.samples.at(-1)!-fitted.samples[0])/rate-(count-1)*60/129)).toBeLessThan(.001);
});
