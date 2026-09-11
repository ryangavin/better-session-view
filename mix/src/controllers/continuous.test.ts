import { afterEach, expect, it, vi } from 'vitest';
import { ContinuousControls } from './continuous.ts';
afterEach(()=>vi.useRealTimers());
it('applies leading input immediately, caps sustained bursts at60Hz, retains the latest final value and never grows a backlog',()=>{
  vi.useFakeTimers();const apply=vi.fn(),controls=new ContinuousControls(apply,()=>Date.now());
  controls.push({kind:'fader',index:0,value:0});expect(apply).toHaveBeenCalledOnce();
  for(let i=1;i<=1000;i++){vi.advanceTimersByTime(1);controls.push({kind:'fader',index:0,value:i});expect(controls.size).toBeLessThanOrEqual(1);}
  expect(apply.mock.calls.length).toBeLessThanOrEqual(60);vi.advanceTimersByTime(17);
  expect(apply).toHaveBeenLastCalledWith({kind:'fader',index:0,value:1000});expect(controls.size).toBe(0);controls.cancel();
});
it('sums relative turns between bounded flushes and preserves independent controls',()=>{
  vi.useFakeTimers();const apply=vi.fn(),controls=new ContinuousControls(apply,()=>Date.now());
  controls.push({kind:'relative',index:0,value:1});
  controls.push({kind:'relative',index:0,value:3});controls.push({kind:'relative',index:0,value:-1});controls.push({kind:'knob',index:1,value:88});
  vi.advanceTimersByTime(17);expect(apply.mock.calls.map(([e])=>e)).toEqual([{kind:'relative',index:0,value:1},{kind:'relative',index:0,value:2},{kind:'knob',index:1,value:88}]);controls.cancel();
});
