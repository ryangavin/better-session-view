import { describe,it,expect } from 'vitest';
import { DEFAULT_STYLE, PRESETS, styleOf, presentationOf } from './style.ts';
describe('waveform visual settings',()=>{
  it('restores valid settings and recovers malformed or out-of-range storage',()=>{
    expect(styleOf(null)).toEqual(DEFAULT_STYLE);
    expect(styleOf({smooth:NaN,detail:100,height:-1,hues:[-9,Infinity,800]})).toMatchObject({smooth:.35,detail:2,height:.4,hues:[0,120,359]});
    for(const p of PRESETS)expect(styleOf(p.style)).toEqual(p.style);
  });
  it('sends both representations through one production presentation API',()=>{
    const layers=presentationOf(DEFAULT_STYLE,'three-band'),blend=presentationOf(DEFAULT_STYLE,'rgb');
    expect(blend).toMatchObject({fillOpacity:.38,colorCurve:1.4,edgeTint:'spectral',background:'#090913',weights:[.5,1,2]});
    expect(layers.layout).toBe('layers');expect(blend.layout).toBe('blend');
    expect(layers.spectral).toEqual(blend.spectral);
    expect(presentationOf({...DEFAULT_STYLE,low:3,high:.25},'rgb').weights).toEqual([3,1,.25]);
  });
});
