import type { SpectralOutlineStyle } from '@openflow/widgets/wave/spectralOutline.ts';
import type { ColorMode } from './topology.ts';
export interface Style {
  smooth:number; detail:number; height:number; blend:number; edge:number;
  low:number; high:number; hues:[number,number,number]; saturation:[number,number,number]; lightness:[number,number,number];
}
export const DEFAULT_STYLE:Style={smooth:.35,detail:1,height:.86,blend:75,edge:.35,low:1,high:1,hues:[215,32,220],saturation:[65,65,25],lightness:[60,60,85]};
export const PRESETS:{name:string;style:Style}[]=[
  {name:'Topology A',style:DEFAULT_STYLE},
  {name:'Rekordbox inspired',style:{...DEFAULT_STYLE,smooth:.15,blend:90,hues:[215,32,220]}},
  {name:'Denon inspired',style:{...DEFAULT_STYLE,smooth:.5,blend:90,hues:[215,145,190]}},
  {name:'Traktor inspired',style:{...DEFAULT_STYLE,smooth:.65,blend:100,hues:[15,55,210]}},
  {name:'RGB',style:{...DEFAULT_STYLE,blend:100,hues:[0,120,240],saturation:[65,65,65],lightness:[60,60,60]}},
];
const bound=(v:unknown,a:number,b:number,d:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(b,Math.max(a,v)):d;
export function styleOf(value:unknown):Style {
  const s=(value&&typeof value==='object'?value:{}) as Partial<Style>;
  return {smooth:bound(s.smooth,0,1,.35),detail:bound(s.detail,.5,2,1),height:bound(s.height,.4,.95,.86),blend:bound(s.blend,0,100,75),edge:bound(s.edge,0,1,.35),low:bound(s.low,.25,3,1),high:bound(s.high,.25,3,1),hues:[0,1,2].map((i)=>bound(s.hues?.[i],0,359,DEFAULT_STYLE.hues[i])) as Style['hues'],saturation:[0,1,2].map(i=>bound(s.saturation?.[i],0,100,DEFAULT_STYLE.saturation[i])) as Style['saturation'],lightness:[0,1,2].map(i=>bound(s.lightness?.[i],0,100,DEFAULT_STYLE.lightness[i])) as Style['lightness']};
}
/** This exact presentation object also works on the production Waveform component. */
export function presentationOf(s:Style,mode:ColorMode):SpectralOutlineStyle {
  const tones=s.hues.map((h,i)=>({h,s:s.saturation[i],l:s.lightness[i]}));
  return {layout:mode==='rgb'?'blend':'layers',spectral:{mode:'spectral',strength:s.blend,colors:{low:tones[0],mid:tones[1],high:tones[2]}},weights:[s.low,1,s.high],edge:s.edge};
}
