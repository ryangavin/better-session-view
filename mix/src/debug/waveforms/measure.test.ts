import { describe, it, expect } from 'vitest';
import { measure } from './measure.ts';
const signal = () => new AbortController().signal;

describe('waveform measurements', () => {
  it('sums stems before measuring but preserves opposing stereo channels', async () => {
    const stereo = await measure([{ id: 'stereo', channels: [new Float32Array([0.5, -0.5]), new Float32Array([-0.5, 0.5])] }], 48000, signal());
    expect(Array.from(stereo.peak)).toEqual([0.5, 0.5]);
    expect(Array.from(stereo.rms)).toEqual([0.5, 0.5]);
    const cancellation = await measure([{ id: 'one', channels: [new Float32Array([0.5])] }, { id: 'two', channels: [new Float32Array([-0.5])] }], 48000, signal());
    expect(cancellation.peak[0]).toBe(0);
    expect(cancellation.stems.map((s) => s.rms[0])).toEqual([0.5, 0.5]);
  });
  it('keeps a transient and the last partial bin, without changing input', async () => {
    const audio = new Float32Array(32769); audio[audio.length - 1] = 0.75;
    const result = await measure([{ id: 'drums', channels: [audio] }], 48000, signal());
    expect(result.peak.at(-1)).toBe(0.75);
    expect(result.seconds).toBe(audio.length / 48000);
    expect(audio.at(-1)).toBe(0.75);
  });
  it('distinguishes low and high frequency energy', async () => {
    for (const [hz, band] of [[60, 0], [10000, 2]]) {
      const audio = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i * 2 * Math.PI * hz / 48000));
      const result = await measure([{ id: 'tone', channels: [audio] }], 48000, signal());
      const energy = result.bands.map((b) => b.reduce((sum, x) => sum + x * x, 0));
      expect(energy.indexOf(Math.max(...energy))).toBe(band);
    }
  });
  it('cancels discarded work', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(measure([{ id: 'x', channels: [new Float32Array(100)] }], 48000, controller.signal)).rejects.toThrow();
  });
});

describe('adjustable waveform crossover analysis',()=>{
  const tone=(hz:number)=>[{id:'tone',channels:[Float32Array.from({length:12000},(_,i)=>Math.sin(i*2*Math.PI*hz/48000))]}];
  const energy=(data:Awaited<ReturnType<typeof measure>>)=>data.bands.map(b=>b.slice(2000).reduce((sum,x)=>sum+x*x,0));
  it('moves a tone between low/mid and mid/high bands by remeasuring, with identical peaks',async()=>{
    const input=tone(1000);
    const low=await measure(input,48000,signal(),{low:2000,high:8000});
    const mid=await measure(input,48000,signal(),{low:100,high:8000});
    const high=await measure(input,48000,signal(),{low:100,high:300});
    for(const [data,band] of [[low,0],[mid,1],[high,2]] as const){
      const values=energy(data);expect(values.indexOf(Math.max(...values))).toBe(band);
      expect(data.peak).toEqual(mid.peak);expect(data.rms).toEqual(mid.rms);
    }
    const defaulted=await measure(input,48000,signal());
    const explicit=await measure(input,48000,signal(),{low:250,high:2500});
    expect(explicit).toEqual(defaulted);
  });
  it('has smooth, overlapping energy around both filter boundaries',async()=>{
    const lowEdge=await Promise.all([900,1100].map(hz=>measure(tone(hz),48000,signal(),{low:1000,high:8000})));
    const highEdge=await Promise.all([900,1100].map(hz=>measure(tone(hz),48000,signal(),{low:100,high:1000})));
    expect(energy(lowEdge[0])[0]).toBeGreaterThan(energy(lowEdge[1])[0]);
    expect(energy(highEdge[0])[2]).toBeLessThan(energy(highEdge[1])[2]);
    for(const data of [...lowEdge,...highEdge])expect(energy(data).every(e=>e>0)).toBe(true);
  });
  it('rejects invalid measurement thresholds rather than silently analyzing other bands',async()=>{
    await expect(measure(tone(1000),48000,signal(),{low:5000,high:1000})).rejects.toThrow('Crossovers');
  });
  it('cancels a superseded scan after it has begun',async()=>{
    const controller=new AbortController();
    const work=measure([{id:'long',channels:[new Float32Array(1000000)]}],48000,controller.signal,{low:400,high:4000});
    setTimeout(()=>controller.abort(),0);
    await expect(work).rejects.toThrow();
  });
});
