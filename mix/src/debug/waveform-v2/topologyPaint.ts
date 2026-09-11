import type { View } from '@openflow/widgets/debug/axis.ts';
import { ink } from '@openflow/widgets/debug/ink.ts';
import type { Model } from './model.ts';
import { columns, activity, type ColorMode } from './topology.ts';
import { levelsOf } from '@openflow/widgets/wave/levels.ts';
import { densityFor, edgesOf } from '@openflow/widgets/wave/outline.ts';
import { presentationOf, type Style } from './style.ts';
import { paintSpectralOutline } from '@openflow/widgets/wave/spectralOutline.ts';
const ladders=new WeakMap<Model,ReturnType<typeof levelsOf>>();
function levels(model:Model){
  let found=ladders.get(model);if(found)return found;
  const packed=new Float32Array(model.data.peak.length*2);
  model.data.peak.forEach((p,i)=>{const value=model.reference?p/model.reference:0;packed[i*2]=-value;packed[i*2+1]=value;});
  found=levelsOf(packed);ladders.set(model,found);return found;
}
/** Production envelope ladder, zoom density and cubic path; no alternate silhouette. */
export function paintTopology(g:CanvasRenderingContext2D,v:View,model:Model,mode:ColorMode,style:Style){
  if(!model.data.peak.length||!v.width)return;
  const duration=model.data.step*model.data.peak.length;
  const measured=columns(model,v.from,v.to,v.width);
  const edges=edgesOf(levels(model),{from:v.from/duration,to:v.to/duration,width:v.width,height:v.height,density:densityFor((v.to-v.from)/duration)*style.detail,smooth:style.smooth,headroom:style.height});
  g.save();g.fillStyle=ink(g.canvas,'--bg','#111218');g.fillRect(0,0,v.width,v.height);
  paintSpectralOutline(g,edges,measured.map(c=>c.bands as [number,number,number]),{width:v.width,height:v.height,from:0,to:1,smooth:style.smooth,neutral:'#888888',silence:'#000000'},presentationOf(style,mode));
  g.restore();
}

export function paintActivity(g:CanvasRenderingContext2D,v:View,model:Model,index:number){
  g.save();g.fillStyle=ink(g.canvas,`--stem-${model.data.stems[index].id}`,'#aaa');
  columns(model,v.from,v.to,v.width).forEach((c,x)=>{g.globalAlpha=activity(c.stems[index]);g.fillRect(x,2,1,v.height-4);});g.restore();
}
export function paintTime(g:CanvasRenderingContext2D,v:View){
  const raw=(v.to-v.from)/Math.max(1,v.width/90),power=10**Math.floor(Math.log10(raw));
  const step=[1,2,5,10].map(n=>n*power).find(n=>n>=raw)||power*10;
  g.save();g.fillStyle=ink(g.canvas,'--detail','#888');g.font='10px system-ui';
  for(let at=Math.ceil(v.from/step)*step;at<v.to;at+=step){const shown=step<1?Math.round(at*10)/10:Math.round(at),x=(at-v.from)/(v.to-v.from)*v.width;g.fillRect(x,20,1,4);g.fillText(`${Math.floor(shown/60)}:${(shown%60).toFixed(step<1?1:0).padStart(2,'0')}`,x+4,14);}g.restore();
}
