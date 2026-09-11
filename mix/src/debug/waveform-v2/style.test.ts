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

it.each(['Prism','Aurora','Ember'])('keeps debug %s aligned with its production treatment', async name => {
  const { SPECTRAL_PRESETS } = await import('@openflow/widgets/theme/spectral.ts');
  const style = PRESETS.find(p => p.name === name)!.style;
  const { waveform, ...spectral } = SPECTRAL_PRESETS.find(p => p.name === name)!.style;
  expect(presentationOf(style,'rgb')).toEqual({layout:waveform!.layout,spectral,
    weights:waveform!.weights,edge:waveform!.edge,fillOpacity:waveform!.fillOpacity,
    colorCurve:waveform!.colorCurve,edgeTint:waveform!.edgeTint,background:waveform!.background});
  expect([style.smooth,style.detail,style.height]).toEqual([waveform!.smooth,waveform!.detail,waveform!.headroom]);
});
