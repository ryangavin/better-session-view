import { MixerChannel } from '../src/play/graph.ts';
import { OutputProtection } from '../src/play/outputProtection.ts';

/** Offline only: compare real channel output and the existing protected output. */
export async function renderFilterResonance() {
  const reports=[];
  for(const rate of [44100,48000,96000])for(const direction of [-1,0,1]){
    const ctx=new OfflineAudioContext(3,rate,rate),audio=ctx as unknown as AudioContext;
    const plain=new MixerChannel(audio),resonant=new MixerChannel(audio);
    // Both directions place their cutoff at exactly 1 kHz.
    const position=direction>0?100*Math.log(1000/20)/Math.log(1000):direction<0?-100*Math.log(1000/20000)/Math.log(40/20000):0;
    plain.apply(0,[0,0,0],position,1);
    resonant.apply(0,[0,0,0],position,1,12);
    const protectedOutput=new OutputProtection(ctx,error=>{throw error;});await protectedOutput.ready;
    const source=ctx.createBufferSource(),buffer=ctx.createBuffer(1,rate,rate);
    for(let i=0;i<rate;i++)buffer.getChannelData(0)[i]=.5*Math.sin(2*Math.PI*1000*i/rate);
    source.buffer=buffer;source.connect(plain.input);source.connect(resonant.input);
    resonant.output.connect(protectedOutput.input);
    const merger=ctx.createChannelMerger(3);
    [plain.output,resonant.output,protectedOutput.output].forEach((node,i)=>node.connect(merger,0,i));
    merger.connect(ctx.destination);source.start(.1);
    const out=await ctx.startRendering(),peaks=[0,0,0],squares=[0,0,0];let centerError=0,finite=true;
    for(let ch=0;ch<3;ch++)for(let i=0;i<rate;i++){
      const value=out.getChannelData(ch)[i];finite&&=Number.isFinite(value);peaks[ch]=Math.max(peaks[ch],Math.abs(value));
      if(i>rate*.5)squares[ch]+=value*value;
      if(ch===1)centerError=Math.max(centerError,Math.abs(value-out.getChannelData(0)[i]));
    }
    reports.push({rate,direction,peaks,ratio:Math.sqrt(squares[1]/squares[0]),centerError,finite});
    plain.dispose();resonant.dispose();protectedOutput.dispose();
  }
  // Sweep both ways through center during a continuous, full-scale multi-tone.
  const rate=48000,ctx=new OfflineAudioContext(1,rate*2,rate),channel=new MixerChannel(ctx as unknown as AudioContext);
  const source=ctx.createBufferSource(),buffer=ctx.createBuffer(1,rate*2,rate);
  for(let i=0;i<buffer.length;i++)buffer.getChannelData(0)[i]=[80,1000,8000].reduce((sum,hz)=>sum+Math.sin(i*2*Math.PI*hz/rate)/3,0);
  source.buffer=buffer;source.connect(channel.input);channel.output.connect(ctx.destination);source.start();
  channel.apply(0,[0,0,0],0,1,12);
  const positions=[100,50,0,-50,-100,-50,0,50,100,0];
  const changes=positions.map((position,i)=>ctx.suspend(.1+i*.15).then(()=>{channel.apply(0,[0,0,0],position,1,12);return ctx.resume();}));
  const rendered=await ctx.startRendering();await Promise.all(changes);
  let peak=0,step=0,finite=true;const samples=rendered.getChannelData(0);
  for(let i=0;i<samples.length;i++){finite&&=Number.isFinite(samples[i]);peak=Math.max(peak,Math.abs(samples[i]));if(i)step=Math.max(step,Math.abs(samples[i]-samples[i-1]));}
  channel.dispose();return {reports,sweep:{peak,step,finite}};
}

/** Deck taps exercise the engine command path, independent of master protection. */
export async function renderDeckResonanceIsolation(){
  const {MixerEngine}=await import('../src/play/engine.ts');
  const {fixtureTrack}=await import('./dj-fixture.ts');
  const rate=48000,ctx=new OfflineAudioContext(4,rate,rate),engine=new MixerEngine(()=>ctx as unknown as AudioContext);
  try{
    const buffer=ctx.createBuffer(1,rate*2,rate);
    for(let i=0;i<buffer.length;i++)buffer.getChannelData(0)[i]=.1*Math.sin(2*Math.PI*1000*i/rate);
    for(const id of ['deck-a','deck-b']){
      await engine.load(id,fixtureTrack,async()=>({analysis:null,peaks:[],audio:{buffers:{full:buffer},map:null,duration:2,overview:[]}}));
      engine.commands.setDeck(id,'filter',100*Math.log(1000/20)/Math.log(1000));
      engine.commands.setDeck(id,'route',1);
      await engine.play(id,true);
    }
    engine.commands.setDeck('deck-a','filterResonance',12);
    const merger=ctx.createChannelMerger(4);
    engine.output('deck-a')!.connect(merger,0,2);engine.output('deck-b')!.connect(merger,0,3);
    merger.connect(ctx.destination);
    const out=await ctx.startRendering(),rms=[0,0];let finite=true;
    for(let ch=0;ch<2;ch++)for(let i=rate/2;i<rate;i++){
      const value=out.getChannelData(ch+2)[i];finite&&=Number.isFinite(value);rms[ch]+=value*value;
    }
    return {rms:rms.map(sum=>Math.sqrt(sum/(rate/2))),ratio:Math.sqrt(rms[0]/rms[1]),finite};
  }finally{engine.dispose();}
}
