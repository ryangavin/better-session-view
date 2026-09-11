import type { View } from '@openflow/widgets/debug/axis.ts';
import { ink } from '@openflow/widgets/debug/ink.ts';
import type { Model } from './model.ts';
import { columns, bandShares, spectralColor, activity, type ColorMode } from './topology.ts';
const palette=['#548ddc','#e9a259','#e6e9ef'];
export function paintTopology(g:CanvasRenderingContext2D,v:View,model:Model,mode:ColorMode){
  const middle=v.height/2,reach=Math.max(0,middle-5);
  g.save();g.fillStyle=ink(g.canvas,'--bg','#111218');g.fillRect(0,0,v.width,v.height);
  columns(model,v.from,v.to,v.width).forEach((c,x)=>{
    const h=c.peak*reach;if(!h)return;
    if(mode==='rgb'){
      g.fillStyle=`rgb(${spectralColor(c.bands).join(',')})`;g.globalAlpha=.58;g.fillRect(x,middle-h,1,h*2);
    }else{
      let offset=0;
      bandShares(c.bands).forEach((share,i)=>{const size=share*h;g.fillStyle=palette[i];g.globalAlpha=.62;g.fillRect(x,middle-offset-size,1,size);g.fillRect(x,middle+offset,1,size);offset+=size;});
    }
    g.globalAlpha=.82;g.fillRect(x,middle-h,1,Math.min(1,h));g.fillRect(x,middle+h-Math.min(1,h),1,Math.min(1,h));
  });g.restore();
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
