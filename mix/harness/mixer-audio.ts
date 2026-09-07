import { MixerChannel, MixerEffect } from '../src/play/graph.ts';
import { DeckVoice } from '../src/play/voice.ts';
import { evenBeats } from '../src/warp.ts';
const results = document.querySelector<HTMLPreElement>('#results')!;
const rms = (data: Float32Array, from=0) => Math.sqrt(data.slice(from).reduce((sum,v)=>sum+v*v,0)/(data.length-from));
function tone(ctx:BaseAudioContext,seconds:number,frequency=220) {
  const buffer=ctx.createBuffer(2,ctx.sampleRate*seconds,ctx.sampleRate);
  for(let c=0;c<2;c++){const data=buffer.getChannelData(c);for(let i=0;i<data.length;i++)data[i]=.1*Math.sin(2*Math.PI*frequency*i/ctx.sampleRate);}
  return buffer;
}
async function channel(gain=1,trim=0,eq=[0,0,0],filter=0) {
  const ctx=new OfflineAudioContext(2,48000,48000), strip=new MixerChannel(ctx as unknown as AudioContext), source=ctx.createBufferSource();
  source.buffer=tone(ctx,1);source.connect(strip.input);strip.output.connect(ctx.destination);strip.apply(trim,eq,filter,gain);source.start();
  const buffer=await ctx.startRendering();strip.dispose();return rms(buffer.getChannelData(0),24000);
}
async function effect(kind:string) {
  const ctx=new OfflineAudioContext(2,48000*2,48000),fx=new MixerEffect(ctx as unknown as AudioContext,kind),source=ctx.createBufferSource();
  source.buffer=tone(ctx,.1);source.connect(fx.input);fx.output.connect(ctx.destination);fx.apply({feedback:50,decay:2.5,tone:50},120);source.start();
  const buffer=await ctx.startRendering();fx.dispose();return rms(buffer.getChannelData(0),kind==='chorus'||kind==='flanger'?0:24000);
}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
document.querySelector<HTMLButtonElement>('#run')!.onclick=async()=>{
  results.textContent='';let failures=0;
  const check=(name:string,ok:boolean,detail:unknown)=>{results.textContent+=`${ok?'PASS':'FAIL'} ${name}: ${JSON.stringify(detail)}\n`;if(!ok)failures++;};
  try {
    const unity=await channel();check('100% fader unity',Math.abs(unity-Math.SQRT1_2*.1)<.003,unity);
    const muted=await channel(0);check('Zero fader silence',muted<1e-7,muted);
    const boosted=await channel(1,6);check('Trim +6 dB',Math.abs(boosted/unity-10**(.3))<.01,boosted/unity);
    const cut=await channel(1,0,[0,0,-24]);check('Low EQ attenuates bass',cut<unity*.65,cut/unity);
    const filtered=await channel(1,0,[0,0,0],80);check('High-pass removes bass',filtered<unity*.02,filtered/unity);
    for(const kind of ['delay','reverb','echo','chorus','flanger']){const tail=await effect(kind);check(`${kind} finite wet return`,Number.isFinite(tail)&&tail>1e-7,tail);}
    const ctx=new AudioContext(),buffer=tone(ctx,12),voice=new DeckVoice(ctx,buffer,evenBeats(ctx.sampleRate,buffer.length,120,0)),analyser=ctx.createAnalyser(),silent=ctx.createGain();
    try {
      analyser.fftSize=32768;silent.gain.value=0;voice.output.connect(analyser);analyser.connect(silent);silent.connect(ctx.destination);
      await ctx.resume();await voice.prepare();const start=ctx.currentTime+voice.lead;voice.start(0,start,240);await delay(900);
      const spectrum=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(spectrum);let peak=0;for(let i=1;i<spectrum.length;i++)if(spectrum[i]>spectrum[peak])peak=i;
      const hz=peak*ctx.sampleRate/analyser.fftSize;check('Sync doubles tempo without doubling pitch',Math.abs(hz-220)<5,{hz,db:spectrum[peak]});
      check('Sync source position follows audio clock',Math.abs(voice.at()-(ctx.currentTime-start)*2)<.02,voice.at());
      voice.start(2,ctx.currentTime+voice.lead,240,{from:2,to:3},true);await delay(1200);check('Synced voice wraps captured loop',voice.at()>=2&&voice.at()<3,voice.at());
      voice.pause();const paused=voice.at();await delay(80);check('Pause holds position',voice.at()===paused,paused);
    } finally {voice.dispose();await ctx.close();}
  } catch(error){failures++;results.textContent+=`ERROR ${error instanceof Error?error.stack:String(error)}\n`;}
  results.textContent+=failures?`FAILED ${failures} checks`:'ALL AUDIO CHECKS PASSED';
};
