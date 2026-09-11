import { OutputProtection,alignedCue } from '../src/play/outputProtection.ts';
import { LIMITER_DELAY,LIMITER_CEILING } from '../src/play/peakLimiter.ts';
export async function renderLimiterScenarios(){
  const results=[];
  for(const rate of [44100,48000,96000])for(const overload of [false,true]){
    const count=rate,ctx=new OfflineAudioContext(4,count,rate),errors:string[]=[];
    const master=new OutputProtection(ctx,e=>errors.push(String(e))),phones=new OutputProtection(ctx,e=>errors.push(String(e)));
    await Promise.all([master.ready,phones.ready]);
    const source=ctx.createBufferSource(),buffer=ctx.createBuffer(2,count,rate),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
    for(let i=0;i<count;i++){left[i]=(overload?12:.2)*Math.sin(i*2*Math.PI*997/rate);right[i]=left[i]*.25;}
    if(overload)left[Math.round(rate*.2)]=100;
    source.buffer=buffer;
    source.connect(master.input);
    const cue=alignedCue(ctx),cueMix=ctx.createGain(),masterMix=ctx.createGain();
    cueMix.gain.value=.5;masterMix.gain.value=.5;
    source.connect(cue);cue.connect(cueMix);cueMix.connect(phones.input);
    master.output.connect(masterMix);masterMix.connect(phones.input);
    const merger=ctx.createChannelMerger(4);
    for(const [node,offset] of [[master.output,0],[phones.output,2]] as const){
      const split=ctx.createChannelSplitter(2);node.connect(split);split.connect(merger,0,offset);split.connect(merger,1,offset+1);
    }
    merger.connect(ctx.destination);source.start();
    const rendered=await ctx.startRendering(),delay=Math.round(rate*LIMITER_DELAY);
    let peak=0,unityError=0,stereoError=0;
    for(let ch=0;ch<4;ch++){
      const data=rendered.getChannelData(ch),shift=ch<2?delay:2*delay,original=ch%2?right:left;
      for(let i=0;i<count;i++){
        peak=Math.max(peak,Math.abs(data[i]));
        if(!overload)unityError=Math.max(unityError,Math.abs(data[i]-(i<shift?0:original[i-shift])));
        if(ch%2 && (!overload || Math.abs(i-shift-Math.round(rate*.2))>2))stereoError=Math.max(stereoError,Math.abs(data[i]-rendered.getChannelData(ch-1)[i]*.25));
      }
    }
    results.push({rate,overload,peak,unityError,stereoError,ceiling:LIMITER_CEILING,delay,errors});
    master.dispose();phones.dispose();
  }
  return results;
}

/** Actual engine: summed boosted stems/decks + FX, hardware main/phones and public taps. */
export async function renderEngineProtection(){
  const {MixerEngine}=await import('../src/play/engine.ts');
  const {fixtureTrack}=await import('./dj-fixture.ts');
  const rate=48000,ctx=new OfflineAudioContext(8,rate,rate),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
  try{
    const buffer=ctx.createBuffer(2,rate*2,rate);
    for(let c=0;c<2;c++)for(let i=0;i<buffer.length;i++)buffer.getChannelData(c)[i]=.5*Math.sin(i*2*Math.PI*440/rate);
    const buffers=Object.fromEntries(['full','drums','bass','vocals','other'].map(name=>[name,buffer]));
    for(const id of ['deck-a','deck-b','deck-c','deck-d']){
      await engine.load(id,{...fixtureTrack,sources:['drums','bass','vocals','other']},async()=>({analysis:null,peaks:[],audio:{buffers,map:null,duration:2,overview:[]}}));
      engine.commands.setDeck(id,'full',false);engine.commands.setDeck(id,'trim',12);engine.commands.setDeck(id,'cue',true);
      engine.commands.setDeck(id,'sendA',100);engine.commands.setDeck(id,'sendB',100);
      for(const stem of ['drums','bass','vocals','other'])engine.commands.setStemLevel(id,stem,100*10**.3);
      await engine.play(id,true);
    }
    engine.commands.setMaster('masterTrim',12);engine.commands.setPhones!('phonesMix',50);
    const merger=ctx.createChannelMerger(8);
    for(const [name,offset] of [['master',4],['deck-a',6]] as const){
      const split=ctx.createChannelSplitter(2);engine.output(name)!.connect(split);split.connect(merger,0,offset);split.connect(merger,1,offset+1);
    }
    ctx.destination.channelCount=8; // The engine intentionally configured only hardware main/cue pairs; reserve extra capture channels.
    merger.connect(ctx.destination);
    const bufferOut=await ctx.startRendering();
    const peaks=Array.from({length:8},(_,ch)=>{let peak=0;for(const sample of bufferOut.getChannelData(ch))peak=Math.max(peak,Math.abs(sample));return peak;});
    let tapError=0;for(let i=0;i<rate;i++)tapError=Math.max(tapError,Math.abs(bufferOut.getChannelData(0)[i]-bufferOut.getChannelData(4)[i]));
    return {peaks,tapError,states:engine.snapshot().decks.map(d=>({status:d.status,playing:d.playing,full:d.full,cue:d.cue,message:d.message})),outputs:ctx.destination.channelCount};
  }finally{engine.dispose();}
}
