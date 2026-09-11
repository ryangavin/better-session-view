import { expect,it } from 'vitest';
import { PeakLimiter,LIMITER_CEILING } from './peakLimiter.ts';
import { stemGainText } from './stemGain.ts';
it('preserves sub-threshold samples exactly after the fixed lookahead at common sample rates',()=>{
  for(const rate of [44100,48000,96000]){
    const limiter=new PeakLimiter(rate),source=Float32Array.from({length:4096},(_,i)=>.2*Math.sin(i*.17));
    const left=new Float32Array(source.length),right=new Float32Array(source.length);
    limiter.process(source,source,left,right);
    for(let i=0;i<left.length;i++)expect(left[i]).toBe(i<limiter.delay?0:source[i-limiter.delay]);
    expect(right).toEqual(left);
  }
});
it('bounds overload and isolated peaks with one stereo gain and recovers without amplifying',()=>{
  const limiter=new PeakLimiter(48000),a=Float32Array.from({length:96000},(_,i)=>i<4000?16*Math.sin(i*.11):.1);
  a[5000]=1000;
  const b=a.map(v=>v*.25),l=new Float32Array(a.length),r=new Float32Array(a.length);
  // Arbitrary blocks must preserve state, including transients crossing a block boundary.
  for(let i=0;i<a.length;i+=128)limiter.process(a.subarray(i,i+128),b.subarray(i,i+128),l.subarray(i,i+128),r.subarray(i,i+128));
  for(let i=0;i<l.length;i++){expect(Math.abs(l[i])).toBeLessThanOrEqual(LIMITER_CEILING+1e-7);expect(r[i]).toBeCloseTo(l[i]*.25,6);}
  expect(l.at(-1)).toBeCloseTo(.1,6);
});
it('silences non-finite input and spells the stored stem scale as dB',()=>{
  const limiter=new PeakLimiter(48000),a=new Float32Array(1024);a[0]=NaN;a[1]=Infinity;a[2]=-Infinity;
  const l=new Float32Array(1024),r=new Float32Array(1024);limiter.process(a,a,l,r);
  expect(l.every(v=>v===0)).toBe(true);
  expect(stemGainText(0)).toBe('−∞ dB');expect(stemGainText(100)).toBe('0.0 dB');expect(stemGainText(100*10**.3)).toBe('+6.0 dB');
});
