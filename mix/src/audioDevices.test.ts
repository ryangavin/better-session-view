import { expect, it } from 'vitest';
import { outputDevice, rateChoices, supportsRate, type AudioDevice } from './audioDevices.ts';
const output: AudioDevice = {name:'Interface',isDefault:true,rates:[{min:48000,max:48000},{min:44100,max:44100},{min:768000,max:768000},{min:48000,max:48000}]};
it('uses the native default and requires a unique exact name for browser sinks',()=>{
  expect(outputDevice([output],'','')).toBe(output);
  expect(outputDevice([output],'opaque','Interface')).toBe(output);
  expect(outputDevice([output],'opaque','')).toBeNull();
  expect(outputDevice([output,{...output,isDefault:false}],'opaque','Interface')).toBeNull();
  expect(outputDevice([output],'opaque','Other interface')).toBeNull();
});
it('lists every discrete driver rate, sorted and deduplicated, including high rates',()=>{
  expect(rateChoices(output)).toEqual([0,44100,48000,768000]);
  expect(supportsRate(output,96000)).toBe(false);
  expect(supportsRate(output,768000)).toBe(true);
  expect(rateChoices(null)).toEqual([0]);
});
it('preserves continuous ranges instead of inventing a finite list',()=>{
  const continuous={...output,rates:[{min:32000,max:96000}]};
  expect(rateChoices(continuous)).toEqual([0]);
  expect(supportsRate(continuous,50000)).toBe(true);
  expect(supportsRate(continuous,192000)).toBe(false);
});
