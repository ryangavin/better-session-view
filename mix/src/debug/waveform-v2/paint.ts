import type { View } from '@openflow/widgets/debug/axis.ts';
import { buckets, heights, type Model, type Settings } from './model.ts';
/** Convex control points stay between adjacent samples: no curve overshoot. */
function trace(path:Path2D,points:readonly [number,number][],move:boolean){
  points.forEach(([x,y],i)=>{if(!i){if(move)path.moveTo(x,y);else path.lineTo(x,y);return;}const [px,py]=points[i-1],dx=(x-px)/3,dy=(y-py)/6;path.bezierCurveTo(px+dx,py+dy,x-dx,y-dy,x,y);});
}
export function paint(g:CanvasRenderingContext2D,view:View,model:Model,settings:Settings,sections:readonly {name:string;at:number}[]){
  const data=buckets(model,view.from,view.to,view.width,settings),middle=view.height/2,reach=view.height*.43;
  g.save();g.fillStyle='#090913';g.fillRect(0,0,view.width,view.height);
  if(!data.length||!model.reference){g.strokeStyle='#ffffff22';g.beginPath();g.moveTo(0,middle);g.lineTo(view.width,middle);g.stroke();g.restore();return;}
  const values=data.map(b=>({x:Math.max(0,Math.min(view.width,(b.at-view.from)/(view.to-view.from)*view.width)),...heights(b,model.reference,settings)}));
  const extended=[{...values[0],x:0},...values,{...values.at(-1)!,x:view.width}];
  const path=(key:'peak'|'core'|'raw')=>{const p=new Path2D();trace(p,extended.map(v=>[v.x,middle-v[key]*reach]),true);trace(p,[...extended].reverse().map(v=>[v.x,middle+v[key]*reach]),false);p.closePath();return p;};
  const gradient=g.createLinearGradient(0,0,view.width,0);
  data.forEach((b,i)=>{const max=Math.max(1e-9,...b.rgb);gradient.addColorStop(values[i].x/view.width,`rgb(${b.rgb.map(v=>Math.round(255*(v/max)**1.4)).join(',')})`);});
  const body=path('peak');g.fillStyle=gradient;g.strokeStyle=gradient;g.globalAlpha=.38;g.fill(body);g.globalAlpha=.95;g.lineWidth=1;g.stroke(body);g.save();g.clip(body);g.fill(path('core'));
  if(settings.raw){g.strokeStyle='#ffffff';g.lineWidth=1;g.setLineDash([4,3]);g.stroke(path('raw'));}g.restore();
  if(settings.sections){g.globalAlpha=1;g.font='10px system-ui';for(const section of sections){const x=(section.at-view.from)/(view.to-view.from)*view.width;if(x<0||x>view.width)continue;g.strokeStyle='#ffffff25';g.beginPath();g.moveTo(x,0);g.lineTo(x,view.height);g.stroke();g.fillStyle='#d8cce7';g.fillText(section.name.toLowerCase(),x+5,14);}}
  g.restore();
}
