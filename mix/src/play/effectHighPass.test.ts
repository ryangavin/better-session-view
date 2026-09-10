import { afterEach, expect, it, vi } from 'vitest';
import { readEffectHighPass, saveEffectHighPass } from './effectHighPass.ts';
afterEach(()=>vi.unstubAllGlobals());
it('migrates missing/malformed slot values to off and persists slots independently',()=>{
  let saved:string|null=null;vi.stubGlobal('localStorage',{getItem:()=>saved,setItem:(_key:string,value:string)=>saved=value});
  expect(readEffectHighPass()).toEqual({A:false,B:false});saved='{"A":true,"B":"true"}';
  expect(readEffectHighPass()).toEqual({A:true,B:false});saveEffectHighPass({A:false,B:true});expect(readEffectHighPass()).toEqual({A:false,B:true});
  saved='{';expect(readEffectHighPass()).toEqual({A:false,B:false});
});
