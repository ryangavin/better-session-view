import type { Model } from './model.ts';
export type ColorMode = 'three-band' | 'rgb';
export interface Column { peak:number; bands:number[]; stems:number[] }
/** One screen pixel owns its intersecting measured bins. Maxima retain brief attacks. */
export function columns(model:Model,from:number,to:number,width:number):Column[]{
  const {data}=model;
  if(!(width>0)||!(to>from))return [];
  return Array.from({length:Math.ceil(width)},(_,x)=>{
    const a=Math.max(0,Math.floor((from+x/width*(to-from))/data.step));
    const b=Math.min(data.peak.length,Math.ceil((from+Math.min(width,x+1)/width*(to-from))/data.step));
    let peak=0,weight=0;const bands=[0,0,0],stems=data.stems.map(()=>0);
    for(let i=a;i<b;i++){
      const span=Math.max(0,Math.min(data.step,data.seconds-i*data.step));weight+=span;
      peak=Math.max(peak,data.peak[i]);
      bands.forEach((_,k)=>bands[k]+=data.bands[k][i]**2*span);
      stems.forEach((_,k)=>stems[k]+=data.stems[k].rms[i]**2*span);
    }
    return {peak:model.reference?peak/model.reference:0,bands:bands.map(v=>weight?Math.sqrt(v/weight):0),stems:stems.map(v=>weight?Math.sqrt(v/weight):0)};
  });
}
export function bandShares(values:readonly number[]){const total=values.reduce((a,b)=>a+b,0);return values.map(v=>total?v/total:0);}
export function spectralColor(bands:readonly number[]){
  const weighted=bands.map((v,i)=>v*[1,2,4][i]),max=Math.max(...weighted);
  return max?weighted.map(v=>Math.round(52+168*(v/max)**1.2)):[52,52,52];
}
export function activity(value:number){return value>0?Math.max(0,Math.min(1,(20*Math.log10(value)+60)/60)):0;}
