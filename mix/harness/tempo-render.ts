import { DeckVoice } from '../src/play/voice.ts';
import { evenBeats } from '../src/warp.ts';
import type { Stretch } from '../src/stretch.ts';
import type { StretchChange } from 'signalsmith-stretch';

const RATE=48000, SOURCE_SECONDS=12, OUTPUT_SECONDS=8, HZ=220, START=.75;
// Known groove, intentionally not a list of quantized grid beats.
const HITS=[1.2,1.83,2.1,2.4,2.96,3.9,4.225,4.8,5.7,5.98,6.6,7.53,8.1];
const LOOP={from:1.2,to:4.8};
type Scenario={name:string;ratio:number;preservePitch:boolean;loop:boolean;retime?:boolean};
export type TempoRenderResult={
  name:string;ratio:number;preservePitch:boolean;loop:boolean;path:string;rate:number;
  frequency:number;expectedFrequency:number;rms:number;
  onsets:{source:number;expected:number;actual:number;reportedSource:number;amplitude:number}[];
  maxSourceError:number;maxIntervalError:number;
  retime?:boolean;nativeSourceCount:number;maxAdvanceError:number;
  trace:{time:number;source:number;rate:number}[];
  frequencyWindows:{from:number;to:number;actual:number;expected:number}[];
  schedules:{now:number;change:StretchChange}[];
  rmsWindows:{from:number;rms:number}[];
  maxSilentSeconds:number;
};

function source(ctx:OfflineAudioContext) {
  const buffer=ctx.createBuffer(2,SOURCE_SECONDS*RATE,RATE);
  const tone=buffer.getChannelData(0),drums=buffer.getChannelData(1);
  for(let i=0;i<tone.length;i++)tone[i]=.1*Math.sin(2*Math.PI*HZ*i/RATE);
  for(const hit of HITS)for(let j=0;j<.04*RATE;j++){
    const t=j/RATE;
    drums[Math.round(hit*RATE)+j]+=.5*Math.sin(2*Math.PI*1700*t)*Math.sin(Math.PI*t/.04)**4;
  }
  // Source markers measured from actual samples, not the requested synthesis times.
  const markers=HITS.map(hit=>peak(drums,hit,hit+.04).time);
  return {buffer,markers};
}
function peak(samples:Float32Array,from:number,to:number) {
  let index=0,amplitude=0;
  for(let i=Math.max(0,Math.floor(from*RATE));i<Math.min(samples.length,Math.ceil(to*RATE));i++){
    const value=Math.abs(samples[i]);if(value>amplitude){amplitude=value;index=i;}
  }
  return {time:index/RATE,amplitude};
}
function frequency(samples:Float32Array,from:number,to:number) {
  const crossings:number[]=[];
  for(let i=Math.ceil(from*RATE)+1;i<Math.floor(to*RATE);i++)
    if(samples[i-1]<=0 && samples[i]>0)crossings.push(i-1-samples[i-1]/(samples[i]-samples[i-1]));
  return crossings.length>1 ? (crossings.length-1)*RATE/(crossings.at(-1)!-crossings[0]) : 0;
}

async function render(scenario:Scenario):Promise<TempoRenderResult> {
  const ctx=new OfflineAudioContext(2,OUTPUT_SECONDS*RATE,RATE);
  const {buffer,markers}=source(ctx),map=evenBeats(RATE,buffer.length,100,0);
  const voice=new DeckVoice(ctx as unknown as AudioContext,buffer,map);
  // Offline destination is the returned sample buffer, never a real-time output.
  voice.output.connect(ctx.destination);
  if(scenario.preservePitch && scenario.ratio!==1)await voice.prepare();
  const schedules:TempoRenderResult['schedules']=[];
  const node=(voice as unknown as {stretch:Stretch|null}).stretch?.node;
  if(node){const schedule=node.schedule.bind(node);node.schedule=(change,adjust)=>{
    schedules.push({now:ctx.currentTime,change:{...change}});return schedule(change,adjust);
  };}
  const stops=Array.from({length:Math.floor(OUTPUT_SECONDS/.05)-1},(_,i)=>ctx.suspend((i+1)*.05));
  let started=false,diagnostics:ReturnType<typeof diagnostic>;
  let changed=false,restored=false;
  const trace:TempoRenderResult['trace']=[],nativeSources=new Set<AudioBufferSourceNode>();
  const sourceAt=(time:number)=>Math.max(0,time-START)*scenario.ratio+(scenario.retime?Math.max(0,Math.min(time,4)-2)*.01:0);
  const outputAt=(source:number)=>{
    if(!scenario.retime || source<=sourceAt(2))return START+source/scenario.ratio;
    if(source<=sourceAt(4))return 2+(source-sourceAt(2))/1.21;
    return 4+(source-sourceAt(4))/scenario.ratio;
  };
  const rendered=ctx.startRendering();
  try {
    // Same suspension-pump pattern as offline.ts: allow real worklet messages to be
    // handled between offline blocks rather than pretending main-thread timers run in audio time.
    for(const stopped of stops){
      await stopped;
      if(!started && ctx.currentTime>=.45){
        voice.start(scenario.loop?LOOP.from:0,START,scenario.ratio===1?null:100*scenario.ratio,
          scenario.loop?LOOP:undefined,scenario.loop,scenario.preservePitch);
        started=true;
      }
      if(scenario.retime && !changed && ctx.currentTime>=1.9){voice.retime(121,2,scenario.preservePitch);changed=true;}
      if(scenario.retime && !restored && ctx.currentTime>=3.9){voice.retime(120,4,scenario.preservePitch);restored=true;}
      voice.tick();
      for(let turn=0;turn<3;turn++)await new Promise<void>(resolve=>setTimeout(resolve,0));
      // An offline render can outrun MessagePort scheduling. The read-only RPC is
      // a barrier for preceding schedule messages, not a replacement DSP or clock.
      const stretch=(voice as unknown as {stretch:Stretch|null}).stretch;
      if(stretch)await stretch.node.latency();
      trace.push({time:ctx.currentTime,source:voice.at(),rate:voice.diagnostics.rate});
      const native=(voice as unknown as {source:AudioBufferSourceNode|null}).source;
      if(native)nativeSources.add(native);
      await ctx.resume();
    }
    const output=await rendered;
    diagnostics=diagnostic(voice);
    const expected:{source:number;output:number}[]=[];
    const span=scenario.loop?LOOP.to-LOOP.from:SOURCE_SECONDS;
    for(let cycle=0;cycle<(scenario.loop?4:1);cycle++)for(const marker of markers){
      if(scenario.loop && (marker<LOOP.from+.1 || marker>LOOP.to-.1))continue;
      const time=outputAt(marker-(scenario.loop?LOOP.from:0)+cycle*span);
      if(time>START+.2 && time<OUTPUT_SECONDS-.2)expected.push({source:marker,output:time});
    }
    expected.sort((a,b)=>a.output-b.output);
    const onsets=expected.map(event=>{
      const measured=peak(output.getChannelData(1),event.output-.1,event.output+.1);
      const next=trace.findIndex(p=>p.time>=measured.time);
      const left=trace[Math.max(0,next-1)],right=trace[Math.max(0,next)];
      const interpolated=next>0?left.source+(right.source-left.source)*(measured.time-left.time)/(right.time-left.time):voice.at(measured.time);
      return {source:event.source,expected:event.output,actual:measured.time,
        reportedSource:scenario.retime?interpolated:voice.at(measured.time),amplitude:measured.amplitude};
    });
    const maxSourceError=Math.max(...onsets.map(o=>Math.abs(o.reportedSource-o.source)));
    const maxIntervalError=Math.max(...onsets.slice(1).map((o,i)=>
      Math.abs((o.actual-onsets[i].actual)-(o.expected-onsets[i].expected))));
    const samples=output.getChannelData(0);let energy=0;
    for(let i=2*RATE;i<6*RATE;i++)energy+=samples[i]**2;
    const maxAdvanceError=scenario.loop?0:Math.max(...trace.slice(1).map((p,i)=>trace[i].time<START?0:
      Math.abs((p.source-trace[i].source)-(sourceAt(p.time)-sourceAt(trace[i].time)))));
    const frequencyWindows=[{from:2.3,to:3.7,ratio:scenario.retime?1.21:scenario.ratio},{from:4.3,to:5.7,ratio:scenario.ratio}]
      .map(({from,to,ratio})=>({from,to,actual:frequency(samples,from,to),expected:HZ*(scenario.preservePitch?1:ratio)}));
    const rmsWindows=Array.from({length:14},(_,k)=>{const from=.5+k*.5;let energy=0;
      for(let i=from*RATE;i<(from+.5)*RATE;i++)energy+=samples[i]**2;
      return {from,rms:Math.sqrt(energy/(.5*RATE))};});
    let silent=0,longest=0;
    for(let i=Math.ceil((START+.2)*RATE);i<(OUTPUT_SECONDS-.2)*RATE;i++){
      silent=Math.abs(samples[i])<1e-6?silent+1:0;longest=Math.max(longest,silent);
    }
    return {...scenario,...diagnostics,frequency:frequency(samples,2,6),
      expectedFrequency:HZ*(scenario.preservePitch?1:scenario.ratio+(scenario.retime?.005:0)),rms:Math.sqrt(energy/(4*RATE)),
      onsets,maxSourceError,maxIntervalError,trace,nativeSourceCount:nativeSources.size,maxAdvanceError,frequencyWindows,schedules,rmsWindows,maxSilentSeconds:longest/RATE};
  } finally { voice.dispose(); }
}
function diagnostic(voice:DeckVoice){const {path,rate}=voice.diagnostics;return {path,rate};}

const scenarios:Scenario[]=[
  {name:'native unity',ratio:1,preservePitch:true,loop:false},
  {name:'pitch preserved 1.2',ratio:1.2,preservePitch:true,loop:false},
  {name:'vinyl 1.2',ratio:1.2,preservePitch:false,loop:false},
  {name:'pitch preserved loop 1.2',ratio:1.2,preservePitch:true,loop:true},
  {name:'vinyl loop 1.2',ratio:1.2,preservePitch:false,loop:true},
  {name:'pitch preserved retime 1.2→1.21→1.2',ratio:1.2,preservePitch:true,loop:false,retime:true},
  {name:'vinyl retime 1.2→1.21→1.2',ratio:1.2,preservePitch:false,loop:false,retime:true},
];
export async function renderTempoScenarios(progress:(name:string)=>void=()=>{}):Promise<{results:TempoRenderResult[];error?:string}> {
  const results:TempoRenderResult[]=[];
  try{
    for(const scenario of scenarios){progress(scenario.name);results.push(await render(scenario));}
    return {results};
  }catch(error){return {results,error:String(error)};}
}
