import { MixerEngine } from '../src/play/engine.ts';
import { fixture, fixtureTrack } from './dj-fixture.ts';
const rms=(a:Float32Array,start:number,end:number)=>{start=Math.floor(start);end=Math.floor(end);let n=0;for(let i=start;i<end;i++)n+=a[i]*a[i];return Math.sqrt(n/(end-start));};
/** OfflineAudioContext renders actual engine nodes; no audio/controller mocks. */
export async function runControlAudioChecks(report:(text:string)=>void){
 let log='',failures=0;const check=(name:string,ok:boolean,data:unknown)=>{if(!ok)failures++;log+=`${ok?'PASS':'FAIL'} ${name}: ${JSON.stringify(data)}\n`;report(log);};
 const ctx=new OfflineAudioContext(2,48000*3,48000),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
 try {
  await engine.load('deck-a',fixtureTrack,async()=>fixture(ctx));
  await engine.play('deck-a',true);
  const stops=[.5,1,1.5,2,2.5].map(t=>({t,p:ctx.suspend(t)}));
  const rendered=ctx.startRendering();let cue=0;
  for(const {t,p} of stops){await p;
   if(t===.5){await engine.play('deck-a',false);engine.cue('deck-a',true);engine.cue('deck-a',false);cue=engine.readFrame().decks['deck-a'].seconds!;}
   if(t===1){engine.cue('deck-a',true);await Promise.resolve();await Promise.resolve();}
   if(t===1.5){engine.cue('deck-a',false);check('Cue release restores exact position',engine.readFrame().decks['deck-a'].seconds===cue,{cue,at:engine.readFrame().decks['deck-a'].seconds});}
   if(t===2){engine.cue('deck-a',true);await engine.play('deck-a',true);engine.cue('deck-a',false);}
   if(t===2.5)check('Cue latch continues advancing',engine.readFrame().decks['deck-a'].seconds!>cue+.4,engine.readFrame().decks['deck-a'].seconds);
   await ctx.resume();
  }
  const buffer=await rendered,a=buffer.getChannelData(0),slice=(x:number,y:number)=>rms(a,Math.floor(x*48000),Math.floor(y*48000));
  check('Real engine emits audio before pause',slice(.1,.45)>.02,slice(.1,.45));
  check('Pause and Cue release produce silence',slice(.85,.95)<1e-6 && slice(1.85,1.95)<1e-6,{pause:slice(.85,.95),release:slice(1.85,1.95)});
  check('Audition and latch emit captured audio',slice(1.1,1.45)>.02 && slice(2.1,2.8)>.02,{audition:slice(1.1,1.45),latch:slice(2.1,2.8)});
  let edge=0;for(let i=23520;i<24960;i++)edge=Math.max(edge,Math.abs(a[i]-a[i-1]));check('Pause transition has no large sample discontinuity',edge<.03,{maxAdjacentDifference:edge});
  let onset=0;for(let i=48000;i<52800;i++)if(Math.abs(a[i])>1e-4){onset=i/48000;break;}
  check('Audition onset includes only scheduled audio lead',onset>=1.025 && onset<1.04,{onset});
 } catch(e){failures++;log+=`ERROR ${e instanceof Error?e.stack:e}\n`;}finally{engine.dispose();}
 try{await renderLoops(check);await renderEffects(check);await renderPhones(check);await renderSlip(check);await captureSyncedEngine(check);}catch(e){failures++;log+=`ERROR ${e instanceof Error?e.stack:e}\n`;}
 report(log+(failures?`FAILED ${failures}`:'ALL CONTROL AUDIO CHECKS PASSED'));
}

async function renderLoops(check:(name:string,ok:boolean,data:unknown)=>void) {
 const rate=48000,ctx=new OfflineAudioContext(2,rate*3,rate),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
 try {
  const asset=await fixture(ctx);await engine.load('deck-a',fixtureTrack,async()=>asset);
  engine.commands.setDeckTiming!('deck-a','loopBeats',1);engine.quickLoop('deck-a');await engine.play('deck-a',true);
  const halfway=ctx.suspend(1.4),rendering=ctx.startRendering();await halfway;
  const before=engine.readFrame().decks['deck-a'].seconds!;engine.setDeckLoopEnabled('deck-a',false);await ctx.resume();
  const data=(await rendering).getChannelData(0);
  let error=0,power=0;for(let i=rate*.65;i<rate*.9;i++){const a=data[i|0],b=data[(i+rate*.5)|0];error+=(a-b)**2;power+=a*a;}
  check('Real engine loop repeats at exactly one beat',error/power<1e-5,{relativeError:error/power});
  check('Loop exit continues beyond its old end',engine.readFrame().decks['deck-a'].seconds!>.5,{before,after:engine.readFrame().decks['deck-a'].seconds});
  let maxGap=0,gap=0;for(let i=rate*.1;i<rate*2.9;i++){gap=Math.abs(data[i|0])<1e-6?gap+1:0;maxGap=Math.max(maxGap,gap);}
  check('Loop/exit capture has no unintended silent gap over 1 ms',maxGap<48,{maxSilentSamples:maxGap});
 } finally {engine.dispose();}
}
async function renderEffects(check:(name:string,ok:boolean,data:unknown)=>void) {
 const rate=48000,ctx=new OfflineAudioContext(2,rate*6,rate),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
 try {
  const asset=await fixture(ctx),b=asset.audio!.buffers.drums;for(let c=0;c<2;c++){const a=b.getChannelData(c);a.fill(0);for(const t of [.1,2])for(let i=0;i<240;i++)a[Math.round(t*rate)+i]=.3*Math.sin(2*Math.PI*440*i/rate);}
  await engine.load('deck-a',fixtureTrack,async()=>asset);engine.setMonitoring(false);
  engine.commands.setEffect('A','echo');engine.commands.setEffectParam!('A','echo','feedback',35);engine.commands.setDeck('deck-a','sendA',75);
  engine.output('fx-a')!.connect(ctx.destination);await engine.play('deck-a',true,undefined,false,'drums');
  const saved=JSON.stringify({values:engine.snapshot().effectValues,send:engine.snapshot().decks[0].sendA});
  const off=ctx.suspend(.8),reenable=ctx.suspend(5),rendering=ctx.startRendering();await off;engine.commands.setEffectsEnabled!(false);await ctx.resume();await reenable;
  engine.commands.setEffectsEnabled!(true);check('FX group reenable retains settings',saved===JSON.stringify({values:engine.snapshot().effectValues,send:engine.snapshot().decks[0].sendA}),saved);await ctx.resume();
  const a=(await rendering).getChannelData(0),energy=(x:number,y:number)=>rms(a,Math.floor(x*rate),Math.floor(y*rate));
  const first=energy(.47,.52),tail=energy(.84,.9),later=energy(1.21,1.28),blocked=energy(2.37,2.42);
  check('Group off leaves existing echo tail decaying',first>1e-4 && tail>1e-5 && later<tail*.6,{first,tail,later});
  check('Group off blocks new source burst from entering FX',blocked<first*.01,{blocked,first});
 }finally{engine.dispose();}
}
async function renderPhones(check:(name:string,ok:boolean,data:unknown)=>void){
 const rate=48000,ctx=new OfflineAudioContext(4,rate*3,rate),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
 try {
  await engine.load('deck-a',fixtureTrack,async()=>fixture(ctx));await engine.play('deck-a',true,undefined,false,'drums');
  const a=ctx.suspend(.5),b=ctx.suspend(1),c=ctx.suspend(1.5),d=ctx.suspend(2),rendering=ctx.startRendering();
  await a;engine.commands.setDeck('deck-a','cue',true);await ctx.resume();
  await b;engine.commands.setPhones!('phonesLevel',50);await ctx.resume();
  await c;engine.commands.setDeck('deck-a','gain',0);await ctx.resume();
  await d;engine.commands.setPhones!('phonesMix',100);await ctx.resume();
  const out=await rendering,main=out.getChannelData(0),phones=out.getChannelData(2);
  const energy=(data:Float32Array,x:number,y:number)=>rms(data,Math.floor(x*rate),Math.floor(y*rate));
  const pre=energy(main,.2,.4),post=energy(main,.7,.9),monitor=energy(phones,.7,.9),half=energy(phones,1.2,1.4),prefader=energy(phones,1.7,1.9),master=energy(phones,2.7,2.9);
  check('Phones selection does not change main output',Math.abs(pre-post)<1e-5,{pre,post});
  check('Phones level is independent and pre-fader',Math.abs(half/monitor-.5)<.01 && Math.abs(prefader-half)<1e-5,{monitor,half,prefader});
  check('Phones Master blend follows main after fader',master<1e-6,{master});
 }finally{engine.dispose();}
}

async function captureSyncedEngine(check:(name:string,ok:boolean,data:unknown)=>void){
 const ctx=new AudioContext({sampleRate:48000}),engine=new MixerEngine(()=>ctx),chunks:{at:number;samples:Float32Array}[]=[];
 let capture:AudioWorkletNode|undefined;
 const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 try{
  engine.setMonitoring(false);await ctx.resume();await engine.load('deck-a',fixtureTrack,async()=>fixture(ctx));
  await ctx.audioWorklet.addModule(new URL('./capture-worklet.js',import.meta.url));capture=new AudioWorkletNode(ctx,'dj-check-capture');
  capture.port.onmessage=e=>chunks.push(e.data);engine.output('master')!.connect(capture);capture.connect(ctx.destination);
  engine.commands.setMaster('bpm',240);await engine.sync('deck-a',true);await engine.play('deck-a',true,undefined,false,'drums');
  const start=ctx.currentTime;await delay(900);
  const samples=Float32Array.from(chunks.filter(c=>c.at>start+.3).flatMap(c=>Array.from(c.samples)));
  let best=0,hz=0;for(let f=200;f<=450;f++){let real=0,imag=0;const n=Math.min(8192,samples.length);for(let i=0;i<n;i++){const window=.5-.5*Math.cos(2*Math.PI*i/(n-1));real+=samples[i]*window*Math.cos(2*Math.PI*f*i/ctx.sampleRate);imag+=samples[i]*window*Math.sin(2*Math.PI*f*i/ctx.sampleRate);}const power=real*real+imag*imag;if(power>best){best=power;hz=f;}}
  check('Captured MixerEngine Sync preserves pitch at doubled tempo',Math.abs(hz-220)<3 && best>1,{hz,power:best,samples:samples.length});
  const before=engine.readFrame().decks['deck-a'].sources!.drums.seconds,t0=ctx.currentTime;await delay(200);const advance=engine.readFrame().decks['deck-a'].sources!.drums.seconds-before;
  check('Real synced engine source advances at twice output time',Math.abs(advance-2*(ctx.currentTime-t0))<.025,{sourceAdvance:advance,outputAdvance:ctx.currentTime-t0});
  engine.commands.setDeckTiming!('deck-a','loopBeats',1);engine.quickLoop('deck-a');const loop=engine.snapshot().decks[0].loop!;await delay(900);
  const at=engine.readFrame().decks['deck-a'].sources!.drums.seconds;check('Real synced engine repeats its captured musical loop',at>=loop.start! && at<loop.end!,{at,loop});
  await engine.play('deck-a',false);const pausedAt=ctx.currentTime;await delay(700);
  const quiet=chunks.filter(c=>c.at>pausedAt+.35).flatMap(c=>Array.from(c.samples));const energy=quiet.length?Math.sqrt(quiet.reduce((s,v)=>s+v*v,0)/quiet.length):Infinity;
  check('Captured synced pause settles to silence',energy<1e-6,{rms:energy,samples:quiet.length});
 }finally{capture?.disconnect();engine.dispose();}
}

async function renderSlip(check:(name:string,ok:boolean,data:unknown)=>void){
 const render=async(slip:boolean)=>{
  const ctx=new OfflineAudioContext(2,48000*3,48000),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
  try{
   const asset=await fixture(ctx),buffer=asset.audio!.buffers.drums;for(let c=0;c<2;c++){const a=buffer.getChannelData(c);for(let i=0;i<a.length;i++){const t=i/48000;a[i]=.02*(1+t)*Math.sin(2*Math.PI*220*t);}}
   await engine.load('deck-a',fixtureTrack,async()=>asset);engine.commands.setSlip!('deck-a',slip);engine.commands.setLoopFocus!('deck-a',true);engine.commands.setDeckTiming!('deck-a','loopBeats',1);engine.quickLoop('deck-a');await engine.play('deck-a',true,undefined,false,'drums');
   const stop=ctx.suspend(1.4),rendered=ctx.startRendering();await stop;engine.setDeckLoopEnabled('deck-a',false);await ctx.resume();const data=(await rendered).getChannelData(0);
   return rms(data,48000*2.2,48000*2.4);
  }finally{engine.dispose();}
 };
 const ordinary=await render(false),slipped=await render(true);check('Captured Slip exit resumes later source audio than ordinary exit',slipped/ordinary>1.3 && slipped/ordinary<1.6,{ordinary,slipped,ratio:slipped/ordinary});
}
