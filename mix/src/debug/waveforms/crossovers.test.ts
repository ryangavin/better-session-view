import { describe,it,expect } from 'vitest';
import { crossoversOf,defaultCrossovers,validateCrossovers,crossoverLimit } from './crossovers.ts';
describe('frequency crossover limits',()=>{
  it('retains the established bands and adapts defaults below Nyquist',()=>{
    expect(defaultCrossovers(48000)).toEqual({low:250,high:2500});
    for(const rate of [64,1000,8000,44100,48000,96000]){
      const defaults=defaultCrossovers(rate);
      expect(()=>validateCrossovers(defaults,rate)).not.toThrow();
      expect(defaults.high).toBeLessThan(rate/2);
    }
  });
  it('rejects unordered, non-finite, inaudible and above-limit pairs, recovering stored pairs together',()=>{
    for(const pair of [{low:2500,high:250},{low:250,high:250},{low:250,high:250.5},{low:NaN,high:2500},{low:250,high:Infinity},{low:0,high:2500},{low:250,high:22000}]){
      expect(()=>validateCrossovers(pair,48000)).toThrow();
      expect(crossoversOf(pair,48000)).toEqual(defaultCrossovers(48000));
    }
    expect(crossoversOf({low:100,high:4000},48000)).toEqual({low:100,high:4000});
    for(const rate of [0,NaN,Infinity])expect(()=>crossoverLimit(rate)).toThrow();
  });
});
