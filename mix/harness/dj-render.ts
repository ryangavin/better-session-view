import { MixerEngine } from '../src/play/engine.ts';
import { fixture, fixtureTrack } from './dj-fixture.ts';
const rms=(a:Float32Array,start:number,end:number)=>{start=Math.floor(start);end=Math.floor(end);let n=0;for(let i=start;i<end;i++)n+=a[i]*a[i];return Math.sqrt(n/(end-start));};
/** OfflineAudioContext renders actual engine nodes; no audio/controller mocks. */
export async function runControlAudioChecks(report:(text:string)=>void, transitionsOnly=false){
 let log='',failures=0;const check=(name:string,ok:boolean,data:unknown)=>{if(!ok)failures++;log+=`${ok?'PASS':'FAIL'} ${name}: ${JSON.stringify(data)}\n`;report(log);};
 if(transitionsOnly){try{await captureTransitions(check);}catch(e){failures++;log+=`ERROR ${String(e)}\n`;}report(log+(failures?`FAILED ${failures}`:'ALL TRANSITION CHECKS PASSED'));return;}
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
 try{await renderLoops(check);await renderBeatJump(check);await renderScrub(check);await renderLoopSeam(check);await renderEffects(check);await renderPhones(check);await captureStereo(check);await renderSlip(check);await captureSyncedEngine(check);await captureTransitions(check);}catch(e){failures++;log+=`ERROR ${e instanceof Error?e.stack:e}\n`;}
 report(log+(failures?`FAILED ${failures}`:'ALL CONTROL AUDIO CHECKS PASSED'));
}

async function renderLoops(check:(name:string,ok:boolean,data:unknown)=>void) {
 const rate=48000,ctx=new OfflineAudioContext(2,rate*3,rate),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
 try {
  const asset=await fixture(ctx);await engine.load('deck-a',fixtureTrack,async()=>asset);
  engine.commands.setLoopBeats!(1);engine.quickLoop('deck-a');await engine.play('deck-a',true);
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
  await engine.sync('deck-a',true);await engine.play('deck-a',true,undefined,false,'drums');engine.commands.setMaster('bpm',240);
  const start=ctx.currentTime;await delay(900);
  const samples=Float32Array.from(chunks.filter(c=>c.at>start+.3).flatMap(c=>Array.from(c.samples)));
  let best=0,hz=0;for(let f=200;f<=450;f++){let real=0,imag=0;const n=Math.min(8192,samples.length);for(let i=0;i<n;i++){const window=.5-.5*Math.cos(2*Math.PI*i/(n-1));real+=samples[i]*window*Math.cos(2*Math.PI*f*i/ctx.sampleRate);imag+=samples[i]*window*Math.sin(2*Math.PI*f*i/ctx.sampleRate);}const power=real*real+imag*imag;if(power>best){best=power;hz=f;}}
  check('Captured MixerEngine Sync preserves pitch at doubled tempo',Math.abs(hz-220)<3 && best>1,{hz,power:best,samples:samples.length});
  const before=engine.readFrame().decks['deck-a'].sources!.drums.seconds,t0=ctx.currentTime;await delay(200);const advance=engine.readFrame().decks['deck-a'].sources!.drums.seconds-before;
  check('Real synced engine source advances at twice output time',Math.abs(advance-2*(ctx.currentTime-t0))<.025,{sourceAdvance:advance,outputAdvance:ctx.currentTime-t0});
  engine.commands.setLoopBeats!(1);engine.quickLoop('deck-a');const loop=engine.snapshot().decks[0].loop!;await delay(900);
  const at=engine.readFrame().decks['deck-a'].sources!.drums.seconds;check('Real synced engine repeats its captured musical loop',at>=loop.start! && at<loop.end!,{at,loop});
  await engine.play('deck-a',false);const pausedAt=ctx.currentTime;await delay(900);
  // The serial 10 Hz channel/master high-pass filters have phase-dependent decay.
  // Sample after 500 ms; this is settled-output silence, not a latency assertion.
  const quiet=chunks.filter(c=>c.at>pausedAt+.5).flatMap(c=>Array.from(c.samples));const energy=quiet.length?Math.sqrt(quiet.reduce((s,v)=>s+v*v,0)/quiet.length):Infinity;
  check('Captured synced pause settles to silence',energy<1e-6,{rms:energy,samples:quiet.length});
  engine.stop();await engine.sync('deck-a',false);await engine.play('deck-a',true,undefined,false,'drums');await engine.load('deck-b',fixtureTrack,async()=>fixture(ctx));await engine.sync('deck-b',true);await engine.play('deck-b',true,undefined,false,'drums');await delay(300);
  engine.move('deck-b','begin');engine.move('deck-b','move',.35);engine.move('deck-b','commit');await delay(700);
  const phase=()=>{const f=engine.readFrame(),delta=f.decks['deck-a'].beat-f.decks['deck-b'].beat;return Math.abs(delta-Math.round(delta));};
  check('Real synced follower realigns after a playing scrub',phase()<.03,{phaseErrorBeats:phase()});
  engine.commands.setLoopBeats!(4);engine.quickLoop('deck-b');await delay(2500);
  check('Real synced loop remains aligned to leader beats',phase()<.03,{phaseErrorBeats:phase()});
  const tempo=engine.snapshot().bpm;await engine.play('deck-a',false);await delay(100);
  check('Real engine hands leadership to playing follower without changing tempo',engine.snapshot().decks[1].syncLeader===true && engine.snapshot().bpm===tempo,{leader:engine.snapshot().decks.find(d=>d.syncLeader)?.letter,tempo:engine.snapshot().bpm});
 }finally{capture?.disconnect();engine.dispose();}
}

async function renderSlip(check:(name:string,ok:boolean,data:unknown)=>void){
 const render=async(slip:boolean)=>{
  const ctx=new OfflineAudioContext(2,48000*3,48000),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
  try{
   const asset=await fixture(ctx),buffer=asset.audio!.buffers.drums;for(let c=0;c<2;c++){const a=buffer.getChannelData(c);for(let i=0;i<a.length;i++){const t=i/48000;a[i]=.02*(1+t)*Math.sin(2*Math.PI*220*t);}}
   await engine.load('deck-a',fixtureTrack,async()=>asset);engine.commands.setSlip!('deck-a',slip);engine.commands.setLoopFocus!('deck-a',true);engine.commands.setLoopBeats!(1);engine.quickLoop('deck-a');await engine.play('deck-a',true,undefined,false,'drums');
   const stop=ctx.suspend(1.4),rendered=ctx.startRendering();await stop;engine.setDeckLoopEnabled('deck-a',false);await ctx.resume();const data=(await rendered).getChannelData(0);
   return rms(data,48000*2.2,48000*2.4);
  }finally{engine.dispose();}
 };
 const ordinary=await render(false),slipped=await render(true);check('Captured Slip exit resumes later source audio than ordinary exit',slipped/ordinary>1.3 && slipped/ordinary<1.6,{ordinary,slipped,ratio:slipped/ordinary});
}

async function renderBeatJump(check:(name:string,ok:boolean,data:unknown)=>void){
 const rate=48000,ctx=new OfflineAudioContext(2,rate*2,rate),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
 try{
  const asset=await fixture(ctx),buffer=asset.audio!.buffers.drums;
  for(let c=0;c<2;c++){const a=buffer.getChannelData(c);for(let i=0;i<a.length;i++)a[i]=.02*(1+i/rate)*Math.sin(2*Math.PI*220*i/rate);}
  await engine.load('deck-a',fixtureTrack,async()=>asset);await engine.play('deck-a',true,undefined,false,'drums');
  const stops=[.5,.75,1.5,1.75].map(t=>({t,p:ctx.suspend(t)})),rendered=ctx.startRendering();
  for(const {t,p} of stops){await p;if(t===.5)engine.beatJump('deck-a',1);if(t===1.5)engine.beatJump('deck-a',-1);
   if(t===.75 || t===1.75){const source=engine.readFrame().decks['deck-a'].sources!.drums;check(`Captured beat jump ${t===.75?'forward':'backward'} keeps playback advancing`,source.playing && Math.abs(source.seconds-(ctx.currentTime-.03+(t===.75?.5:0)))<.001,source.seconds);}
   await ctx.resume();
  }
  const a=(await rendered).getChannelData(0),before=rms(a,.1*rate,.3*rate),after=rms(a,.7*rate,.9*rate);
  check('Beat jump reaches later source audio in the captured amplitude ramp',after/before>1.8 && after/before<2.1,{before,after,ratio:after/before});
  let gap=0,longest=0;for(let i=Math.floor(.4*rate);i<1.7*rate;i++){gap=Math.abs(a[i])<1e-5?gap+1:0;longest=Math.max(longest,gap);}
  check('Beat jumps introduce no silent gap longer than 1 ms',longest<=48,{maxSilentSamples:longest});
 }finally{engine.dispose();}
}

async function renderScrub(check:(name:string,ok:boolean,data:unknown)=>void){
 const rate=48000,ctx=new OfflineAudioContext(2,rate*2,rate),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
 try{
  await engine.load('deck-a',fixtureTrack,async()=>fixture(ctx));await engine.play('deck-a',true,undefined,false,'drums');
  const stops=[.5,.55,.6,.65,.9].map(t=>({t,p:ctx.suspend(t)})),rendered=ctx.startRendering();
  for(const {t,p} of stops){await p;if(t===.5)engine.move('deck-a','begin');if(t<=.6)engine.move('deck-a','move',(t-.5)*10+1);if(t===.65)engine.move('deck-a','commit');if(t===.9){const at=engine.readFrame().decks['deck-a'].sources!.drums;check('Repeated playing scrub keeps audio advancing at the moved position',at.playing && at.seconds>1.8,{seconds:at.seconds,playing:at.playing});}await ctx.resume();}
  const data=(await rendered).getChannelData(0);let gap=0,longest=0;for(let i=.4*rate;i<1.2*rate;i++){gap=Math.abs(data[i])<1e-5?gap+1:0;longest=Math.max(longest,gap);}
  check('Captured playing scrub has no silent gap longer than 1 ms',longest<=48,{maxSilentSamples:longest});
 }finally{engine.dispose();}
}

async function captureTransitions(check:(name:string,ok:boolean,data:unknown)=>void){
 const ctx=new AudioContext({sampleRate:48000}),engine=new MixerEngine(()=>ctx),chunks:{at:number;samples:Float32Array}[]=[];let capture:AudioWorkletNode|undefined;
 const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 try{
  engine.setMonitoring(false);await ctx.resume();await engine.load('deck-a',fixtureTrack,async()=>fixture(ctx));await ctx.audioWorklet.addModule(new URL('./capture-worklet.js',import.meta.url));capture=new AudioWorkletNode(ctx,'dj-check-capture');capture.port.onmessage=e=>chunks.push(e.data);engine.output('master')!.connect(capture);capture.connect(ctx.destination);
  await engine.play('deck-a',true,undefined,false,'drums');await delay(500);
  const transitions:{name:string;at:number}[]=[];
  transitions.push({name:'native to Sync',at:ctx.currentTime});await engine.sync('deck-a',true);await delay(600);
  transitions.push({name:'synced beat jump',at:ctx.currentTime});engine.beatJump('deck-a',1);await delay(600);
  transitions.push({name:'synced scrub',at:ctx.currentTime});engine.move('deck-a','begin');engine.move('deck-a','move',1.3);engine.move('deck-a','commit');await delay(600);
  transitions.push({name:'Sync to native',at:ctx.currentTime});await engine.sync('deck-a',false);await delay(600);
  for(const t of transitions){const samples=chunks.filter(c=>c.at>=t.at-.1 && c.at<t.at+.5).flatMap(c=>Array.from(c.samples));let gap=0,maxGap=0,edge=0,edgeIndex=0;
   for(let i=0;i<samples.length;i++){gap=Math.abs(samples[i])<1e-5?gap+1:0;maxGap=Math.max(maxGap,gap);if(i && Math.abs(samples[i]-samples[i-1])>edge){edge=Math.abs(samples[i]-samples[i-1]);edgeIndex=i;}}
   check(`Captured ${t.name} transition avoids dropout and abrupt clicks`,samples.length>1000 && maxGap<=48 && edge<.03,{maxSilentSamples:maxGap,maxAdjacentDifference:edge,edgeIndex,chunkOffset:edgeIndex%4096,edgeAfterAction:(chunks.find(c=>c.at>=t.at-.1)?.at ?? 0)+edgeIndex/ctx.sampleRate-t.at,near:samples.slice(Math.max(0,edgeIndex-3),edgeIndex+4)});
  }
 }finally{capture?.disconnect();engine.dispose();}
}

async function renderLoopSeam(check:(name:string,ok:boolean,data:unknown)=>void){
 const ctx=new OfflineAudioContext(2,48000*2,48000),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
 try{
  const asset=await fixture(ctx);for(let c=0;c<2;c++){const a=asset.audio!.buffers.drums.getChannelData(c);for(let i=0;i<a.length;i++)a[i]=.08*Math.sin(2*Math.PI*223.3*i/48000+.7);}
  await engine.load('deck-a',fixtureTrack,async()=>asset);engine.commands.setLoopBeats!(1);engine.quickLoop('deck-a');await engine.play('deck-a',true,undefined,false,'drums');const samples=(await ctx.startRendering()).getChannelData(0);
  let edge=0;for(let i=4800;i<samples.length;i++)edge=Math.max(edge,Math.abs(samples[i]-samples[i-1]));check('Native loop smooths a non-zero-crossing musical boundary',edge<.03,{maxAdjacentDifference:edge});
 }finally{engine.dispose();}
}


async function captureStereo(check:(name:string,ok:boolean,data:unknown)=>void){
 const ctx=new AudioContext({sampleRate:48000}),engine=new MixerEngine(()=>ctx);
 try{
  engine.setMonitoring(false);await ctx.resume();
  const asset=await fixture(ctx),buffer=asset.audio!.buffers.drums;
  const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  for(let i=0;i<left.length;i++)right[i]=left[i]*.25;
  await engine.load('deck-a',fixtureTrack,async()=>asset);await engine.play('deck-a',true,undefined,false,'drums');await new Promise(resolve=>setTimeout(resolve,300));
  const levels=engine.readFrame().masterStereo!,ratio=levels[1]/levels[0];
  check('Master meters measure separate left and right output channels',levels[0]>.01 && ratio>.24 && ratio<.26,{left:levels[0],right:levels[1],ratio});
 }finally{engine.dispose();}
}
export async function runStereoMeterChecks(report:(text:string)=>void){
 try{await captureStereo((name,ok,data)=>report(`${ok?'PASS':'FAIL'} ${name}: ${JSON.stringify(data)}`));}catch(error){report(`ERROR ${String(error)}`);}
}
