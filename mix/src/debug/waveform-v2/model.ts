import type { Measurement } from '../waveforms/measure.ts';
export interface Settings { scale:'linear'|'db'; floor:number; gain:number; contrast:number; energy:'rms'|'short-peak'; windowMs:number; raw:boolean; compare:boolean; sections:boolean }
export const DEFAULTS:Settings={scale:'linear',floor:-48,gain:0,contrast:1,energy:'rms',windowMs:100,raw:false,compare:false,sections:true};
const bounded=(v:unknown,min:number,max:number,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
export function settingsOf(value:unknown):Settings {
  const s=value&&typeof value==='object'?value as Partial<Settings>:{};
  return {scale:s.scale==='db'?'db':'linear',floor:bounded(s.floor,-72,-12,-48),gain:bounded(s.gain,-6,12,0),contrast:bounded(s.contrast,.5,2.5,1),energy:s.energy==='short-peak'?'short-peak':'rms',windowMs:bounded(s.windowMs,30,1000,100),raw:!!s.raw,compare:!!s.compare,sections:s.sections!==false};
}
export interface Model { data:Measurement; reference:number; power:Float64Array[]; duration:Float64Array }
export function prepare(data:Measurement):Model {
  const n=data.peak.length;
  if(!(data.step>0)||!Number.isFinite(data.seconds)||data.seconds<0||data.rms.length!==n||data.bands.length!==3||data.bands.some(b=>b.length!==n))throw new Error('Invalid waveform measurement');
  const duration=new Float64Array(n+1),power=Array.from({length:4},()=>new Float64Array(n+1));let reference=0;
  for(let i=0;i<n;i++){
    const span=Math.max(0,Math.min(data.step,data.seconds-i*data.step));duration[i+1]=duration[i]+span;
    const values=[data.rms[i],...data.bands.map(b=>b[i])];
    if(!Number.isFinite(data.peak[i])||data.peak[i]<0||values.some(v=>!Number.isFinite(v)||v<0))throw new Error('Non-finite waveform measurement');
    reference=Math.max(reference,data.peak[i]);values.forEach((v,k)=>power[k][i+1]=power[k][i]+v*v*span);
  }
  return {data,reference,power,duration};
}
export function rms(model:Model,a:number,b:number,band=0){const seconds=model.duration[b]-model.duration[a];return seconds>0?Math.sqrt(Math.max(0,model.power[band][b]-model.power[band][a])/seconds):0;}
export interface Bucket { from:number;to:number;at:number;peak:number;raw:number;energy:number;rgb:readonly number[] }
/** Both contours and color summarize exactly the same source-bin interval. */
export function buckets(model:Model,from:number,to:number,width:number,settings:Settings):Bucket[]{
  const {data}=model,n=data.peak.length;if(!n||!(to>from)||!(width>0))return [];
  const start=Math.max(0,Math.min(n,Math.floor(from/data.step))),end=Math.max(start,Math.min(n,Math.ceil(to/data.step)));
  if(start===end)return [];
  const count=Math.min(end-start,Math.max(1,Math.ceil(width*.5))),out:Bucket[]=[];
  for(let i=0;i<count;i++){
    const a=start+Math.floor(i*(end-start)/count),b=start+Math.floor((i+1)*(end-start)/count);
    let peak=0;for(let j=a;j<b;j++)peak=Math.max(peak,data.peak[j]);
    const raw=rms(model,a,b);let energy=raw;
    if(settings.energy==='short-peak'){
      const window=Math.min(b-a,Math.max(1,Math.ceil(settings.windowMs/1000/data.step)));energy=0;
      for(let j=a;j+window<=b;j++)energy=Math.max(energy,rms(model,j,j+window));
    }
    const left=a*data.step,right=Math.min(data.seconds,b*data.step);
    out.push({from:left,to:right,at:(left+right)/2,peak,raw,energy,rgb:[1,2,4].map((gain,k)=>rms(model,a,b,k+1)*gain)});
  }
  return out;
}
/** Shared peak/RMS reference. Zero is always zero, including logarithmic display. */
export function amplitude(value:number,reference:number,settings:Settings):number {
  if(!(value>0)||!(reference>0))return 0;
  const relative=Math.min(1,value/reference);
  return settings.scale==='linear'?relative:Math.max(0,Math.min(1,(20*Math.log10(relative)-settings.floor)/-settings.floor));
}
export function heights(bucket:Bucket,reference:number,settings:Settings){
  const peak=amplitude(bucket.peak,reference,settings),raw=amplitude(bucket.raw,reference,settings);
  const treated=Math.pow(amplitude(bucket.energy*10**(settings.gain/20),reference,settings),settings.contrast);
  return {peak,raw:Math.min(peak,raw),core:Math.min(peak,treated)};
}
export const db=(value:number)=>value>0?`${(20*Math.log10(value)).toFixed(1)} dBFS`:'−∞ dBFS';
