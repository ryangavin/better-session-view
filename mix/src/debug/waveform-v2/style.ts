import type { SpectralOutlineStyle } from '@openflow/widgets/wave/spectralOutline.ts';
import type { ColorMode } from './topology.ts';
export interface Style {
  finish:'vivid'|'clean'; opacity:number; curve:number;
  smooth:number; detail:number; height:number; blend:number; edge:number;
  low:number; high:number; hues:[number,number,number]; saturation:[number,number,number]; lightness:[number,number,number];
}
const TOPOLOGY_STYLE:Style={finish:'clean',opacity:1,curve:.5,smooth:.35,detail:1,height:.86,blend:75,edge:.35,low:1,high:1,hues:[215,32,220],saturation:[65,65,25],lightness:[60,60,85]};
export const DEFAULT_STYLE:Style={...TOPOLOGY_STYLE,finish:'vivid',opacity:.38,curve:1.4,detail:2,blend:100,edge:.95,low:.5,high:2,hues:[0,120,240],saturation:[100,100,100],lightness:[50,50,50]};
/** Opt-in color studies. Geometry uses the documented Vivid peaks defaults; no stored state is changed. */
export const COLOR_STUDIES:{name:string;style:Style}[]=[
  {name:'Prism',style:{...DEFAULT_STYLE,finish:'clean',opacity:1,curve:2.114115,edge:.8788055,low:.85,high:1.8,hues:[0,120,240],saturation:[100,100,100],lightness:[50,46,46]}},
  {name:'Aurora',style:{...DEFAULT_STYLE,opacity:.88,curve:2.3,edge:.88,low:.85,high:1.8,hues:[275,95,185],saturation:[100,100,100],lightness:[30,25,19]}},
  {name:'Ember',style:{...DEFAULT_STYLE,opacity:.88,curve:2.3,edge:.9,low:.85,high:1.8,hues:[22,325,225],saturation:[100,100,100],lightness:[27,23,28]}},
];
export const PRESETS:{name:string;style:Style}[]=[
  {name:'Vivid peaks',style:DEFAULT_STYLE},
  {name:'Topology A',style:TOPOLOGY_STYLE},
  {name:'Rekordbox inspired',style:{...TOPOLOGY_STYLE,smooth:.15,blend:90,hues:[215,32,220]}},
  {name:'Denon inspired',style:{...TOPOLOGY_STYLE,smooth:.5,blend:90,hues:[215,145,190]}},
  {name:'Traktor inspired',style:{...TOPOLOGY_STYLE,smooth:.65,blend:100,hues:[15,55,210]}},
  {name:'RGB',style:{...TOPOLOGY_STYLE,blend:100,hues:[0,120,240],saturation:[65,65,65],lightness:[60,60,60]}},
  ...COLOR_STUDIES,
];
const bound=(v:unknown,a:number,b:number,d:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(b,Math.max(a,v)):d;
export function styleOf(value:unknown):Style {
  const s=(value&&typeof value==='object'?value:{}) as Partial<Style>;
  const number=(key:keyof Style,min:number,max:number)=>bound(s[key],min,max,DEFAULT_STYLE[key] as number);
  const triplet=(key:'hues'|'saturation'|'lightness',max:number)=>[0,1,2].map(i=>bound(s[key]?.[i],0,max,DEFAULT_STYLE[key][i])) as Style['hues'];
  return {finish:s.finish==='clean'?'clean':'vivid',opacity:number('opacity',.1,1),curve:number('curve',.25,2.5),smooth:number('smooth',0,1),detail:number('detail',.5,2),height:number('height',.4,.95),blend:number('blend',0,100),edge:number('edge',0,1),low:number('low',.25,3),high:number('high',.25,3),hues:triplet('hues',359),saturation:triplet('saturation',100),lightness:triplet('lightness',100)};
}
/** This exact presentation object also works on the production Waveform component. */
export function presentationOf(s:Style,mode:ColorMode):SpectralOutlineStyle {
  const tones=s.hues.map((h,i)=>({h,s:s.saturation[i],l:s.lightness[i]}));
  return {layout:mode==='rgb'?'blend':'layers',spectral:{mode:'spectral',strength:s.blend,colors:{low:tones[0],mid:tones[1],high:tones[2]}},weights:[s.low,1,s.high],edge:s.edge,fillOpacity:s.opacity,colorCurve:s.curve,edgeTint:s.finish==='vivid'?'spectral':'white',background:s.finish==='vivid'?'#090913':undefined};
}
