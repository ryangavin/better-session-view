import { expect, it } from 'vitest';
import { NeutralDetents } from './detent.ts';
it('captures actual neutral for filter, asymmetric EQ and trim with hysteresis',()=>{
  for(const [index,min,max] of [[1,-100,100],[3,-24,12],[4,-24,12],[5,-24,12],[6,-12,12],[7,-12,12]]){
    const d=new NeutralDetents(),step=(max-min)/127;
    expect(d.value(index,step*1.9,10,min,max,false)).toBe(0);
    expect(d.value(index,-step*3.9,0,min,max,false)).toBe(0);
    expect(d.value(index,-step*4.1,0,min,max,false)).toBeCloseTo(-step*4.1);
  }
});
it('accumulates relative travel through the detent and resets after external edits or focus changes',()=>{
  const d=new NeutralDetents();let value=0;
  for(let i=0;i<4;i++){value=d.value(4,1,value,-24,12,true);expect(value).toBe(0);}
  expect(d.value(4,1,value,-24,12,true)).toBeCloseTo(5*36/127);
  expect(d.value(4,1,5,-24,12,true)).toBeCloseTo(5+36/127);
  d.clear();expect(d.value(4,1,0,-24,12,true)).toBe(0);
  expect(d.value(0,1,0,0,100,false)).toBe(1);
  expect(d.value(2,1,0,0,100,true)).toBeCloseTo(100/127);
});
