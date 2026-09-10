import { afterEach, expect, it, vi } from 'vitest';
import { highPassHz, highPassPositionOf, readEffectHighPass, saveEffectHighPass } from './effectHighPass.ts';
afterEach(()=>vi.unstubAllGlobals());
function storage(){const saved=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>saved.set(key,value)});return saved;}
it('migrates legacy On to exactly 200Hz and Off to bypass, without confusing new numeric values',()=>{
  const saved=storage();expect(readEffectHighPass()).toEqual({A:0,B:0});
  saved.set('mixflow.effect-high-pass.v1','{"A":true,"B":false}');
  const first=readEffectHighPass();expect(highPassHz(first.A)).toBe(200);expect(first.B).toBe(0);
  saveEffectHighPass({A:0,B:highPassPositionOf(1000)});
  expect(readEffectHighPass()).toEqual({A:0,B:highPassPositionOf(1000)});
  expect(JSON.parse(saved.get('mixflow.effect-high-pass.v2')!).B).toBeCloseTo(highPassHz(highPassPositionOf(1000)));
});
it('repairs malformed cutoffs, clamps the useful range and uses logarithmic spacing',()=>{
  const saved=storage();saved.set('mixflow.effect-high-pass.v2','{"A":true,"B":99999}');expect(readEffectHighPass()).toEqual({A:0,B:97});
  expect(highPassHz(1)).toBe(20);expect(highPassHz(97)).toBe(2000);
  expect(highPassHz(25)/highPassHz(1)).toBeCloseTo(highPassHz(49)/highPassHz(25));
  saved.set('mixflow.effect-high-pass.v2','{');expect(readEffectHighPass()).toEqual({A:0,B:0});
});
