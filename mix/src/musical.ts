import { sampleOf, type Beats } from './warp.ts';

/** Versioned interpretation of detector evidence; raw observations remain recoverable. */
export interface MusicalEvidence {
  version: 1;
  ambiguous?: boolean;
  raw: { rate: number; first: number; samples: readonly number[] };
  segments: { beat: number; bpm: number }[];
}
const median = (xs: number[]) => xs.sort((a,b)=>a-b)[xs.length >> 1];
interface Line { at: number; period: number; loss: number }
/** Robust regression in beat coordinates. Far-apart pairs resist attack jitter. */
function lineOf(y: readonly number[], lo: number, hi: number): Line {
  const lag=Math.max(1,Math.floor((hi-lo)/2)), slopes:number[]=[];
  for(let i=lo;i+lag<hi;i++)slopes.push((y[i+lag]-y[i])/lag);
  let period=median(slopes), at=median(y.slice(lo,hi).map((v,i)=>v-(lo+i)*period));
  // A single pair distance can alias an alternating groove (odd versus even lag).
  // Robust least squares across all observations removes that slope bias while
  // downweighting fills and isolated detection errors.
  for(let round=0;round<3;round++){
    const errors=y.slice(lo,hi).map((v,i)=>v-at-(lo+i)*period);
    const scale=Math.max(.003,median(errors.map(Math.abs))*2.5);
    let w=0,x=0,v=0;
    for(let i=lo;i<hi;i++){const weight=Math.min(1,scale/Math.max(1e-12,Math.abs(errors[i-lo])));w+=weight;x+=weight*i;v+=weight*y[i];}
    const mx=x/w,my=v/w;let xx=0,xy=0;
    for(let i=lo;i<hi;i++){const weight=Math.min(1,scale/Math.max(1e-12,Math.abs(errors[i-lo])));xx+=weight*(i-mx)**2;xy+=weight*(i-mx)*(y[i]-my);}
    if(xx>0){period=xy/xx;at=my-mx*period;}
  }
  const residual=y.slice(lo,hi).map((v,i)=>Math.abs(v-at-(lo+i)*period));
  // Trim the worst fifth: fills and isolated displaced attacks cannot buy a new tempo.
  residual.sort((a,b)=>a-b);
  const keep=Math.max(1,Math.ceil(residual.length*.8));
  return {at,period,loss:residual.slice(0,keep).reduce((s,v)=>s+v*v,0)/keep};
}
const MIN=32;
/** A conservative constant/piecewise musical grid, never a transient quantizer. */
const interpretations=new WeakMap<Beats,Beats>();
export function musicalBeats(raw:Beats):Beats {
  const held=interpretations.get(raw);if(held)return held;
  const result=fitMusical(raw);interpretations.set(raw,result);return result;
}
function fitMusical(raw: Beats): Beats {
  if(raw.musical || raw.set?.length || raw.samples.length<MIN || !(raw.rate>0))return raw;
  const y=raw.samples.map(s=>s/raw.rate);
  if(y.some((v,i)=>!Number.isFinite(v) || i>0 && v<=y[i-1]))return raw;
  // A sustained half/double change can be a tracker beat-count error or a real
  // tempo change. Timestamps alone cannot distinguish them: retain evidence and
  // require review instead of inventing either a tempo region or a global average.
  const periods:number[]=[];
  for(let lo=0;lo+MIN<=y.length;lo+=MIN)periods.push(lineOf(y,lo,lo+MIN).period);
  const base=periods[0];
  if(periods.some(p=>Math.abs(p/base-2)<.08 || Math.abs(p/base-.5)<.02))
    return {...raw,musical:{version:1,ambiguous:true,raw:{rate:raw.rate,first:raw.first,samples:raw.samples},segments:[]}};
  const sy=[0],sxy=[0];y.forEach((v,i)=>{sy.push(sy[i]+v);sxy.push(sxy[i]+i*v);});
  const squareSum=(n:number)=>(n-1)*n*(2*n-1)/6;
  const coarsePeriod=(lo:number,hi:number)=>{
    const n=hi-lo,x=n*(lo+hi-1)/2;
    return (sxy[hi]-sxy[lo]-x*(sy[hi]-sy[lo])/n)/(squareSum(hi)-squareSum(lo)-x*x/n);
  };
  const parts:{lo:number;hi:number;line:Line}[]=[];
  function fit(lo:number,hi:number,depth=0) {
    const line=lineOf(y,lo,hi);
    let best:{at:number;a:Line;b:Line;loss:number}|null=null;
    if(hi-lo>=MIN*2 && depth<4 && line.loss>.0001) {
      for(let at=lo+MIN;at<=hi-MIN;at+=4){
        // Cheap regression proposes candidates; only a meaningful slope change
        // earns the more expensive robust comparison. This keeps library scans cheap.
        if(Math.abs(coarsePeriod(at,hi)/coarsePeriod(lo,at)-1)<.003)continue;
        const a=lineOf(y,lo,at),b=lineOf(y,at,hi),ratio=b.period/a.period;
        // A half/double interpretation is ambiguous, not evidence of a tempo change.
        if(ratio<.6 || ratio>1.7 || Math.abs(ratio-1)<.005)continue;
        const join=Math.abs(a.at+at*a.period-b.at-at*b.period);
        if(join>.08 || Math.abs(a.period-b.period)*Math.min(at-lo,hi-at)<.08)continue;
        const loss=(a.loss*(at-lo)+b.loss*(hi-at))/(hi-lo);
        if(loss<line.loss*.25 && (!best || loss<best.loss))best={at,a,b,loss};
      }
    }
    if(best){fit(lo,best.at,depth+1);fit(best.at,hi,depth+1);}else parts.push({lo,hi,line});
  }
  fit(0,y.length);
  // Extend a musical grid over the same beat count. Preserve bar numbering and
  // manually prepared section coordinates; octave correction remains an explicit edit.
  const samples:number[]=[];
  for(let i=0;i<y.length;i++){
    const part=parts.find(p=>i>=p.lo && i<p.hi)!;
    samples.push(Math.round((part.line.at+i*part.line.period)*raw.rate));
  }
  const segments=parts.map(p=>({beat:raw.first+p.lo,bpm:60/p.line.period}));
  // Put a boundary at the intersection of fitted lines; use continuous interpolation
  // in the small boundary neighbourhood instead of manufacturing a short/long beat.
  for(let p=1;p<parts.length;p++){
    const a=parts[p-1].line,b=parts[p].line,k=parts[p].lo;
    const cross=(b.at-a.at)/(a.period-b.period);
    if(Math.abs(cross-k)<=4){
      for(let i=Math.max(0,k-4);i<Math.min(y.length,k+5);i++)samples[i]=Math.round((i<cross?a.at+i*a.period:b.at+i*b.period)*raw.rate);
    }
  }
  return {...raw,samples,musical:{version:1,raw:{rate:raw.rate,first:raw.first,samples:raw.samples},segments}};
}

/** Only identified automatic grids are interpreted; unknown legacy/manual grids stay exact. */
export function playbackGrid<T extends {bpm:number;bpmAuto:boolean;offset:number;beats:Beats|null}>(grid:T,algorithm?:string|null):T {
  if(!grid.beats || !grid.bpmAuto || !algorithm || algorithm==='hand' || grid.beats.set?.length)return grid;
  const beats=musicalBeats(grid.beats);
  if(beats===grid.beats && !beats.musical)return grid;
  if(beats.musical?.ambiguous)return {...grid,beats};
  return {...grid,beats,bpm:musicalTempo(beats),offset:sampleOf(beats,0)/beats.rate};
}
/** The longest supported region is the representative tempo, not an average of unlike sections. */
export function musicalTempo(beats:Beats):number {
  const segments=beats.set?.length ? undefined : beats.musical?.segments;
  if(!segments?.length)return 60*beats.rate*(beats.samples.length-1)/(beats.samples.at(-1)!-beats.samples[0]);
  let best=segments[0],length=-1;
  segments.forEach((s,i)=>{const n=(segments[i+1]?.beat ?? beats.first+beats.samples.length)-s.beat;if(n>length){best=s;length=n;}});
  return Number(best.bpm.toFixed(2));
}
