import { MixerEffect } from '../../src/play/graph.ts';

const rate=48000, kinds=['delay','echo','reverb','chorus','flanger'];
async function render(kind:string,hz:number,on:boolean | undefined,toggleAt?:number,impulse=false) {
  const ctx=new OfflineAudioContext(2,rate*3,rate), effect=new MixerEffect(ctx as unknown as AudioContext,kind);
  effect.apply({feedback:60,tone:100,decay:2.5,depth:0,rate:1},120);
  if(on!==undefined)effect.setHighPass(on);
  const buffer=ctx.createBuffer(1,rate*3,rate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=impulse?(i===0?.5:0):.2*Math.sin(2*Math.PI*hz*i/rate);
  const source=ctx.createBufferSource();source.buffer=buffer;
  const merger=ctx.createChannelMerger(2);source.connect(merger,0,0);source.connect(effect.input);effect.output.connect(merger,0,1);merger.connect(ctx.destination);source.start();
  const suspended=toggleAt===undefined?null:ctx.suspend(toggleAt).then(()=>{effect.setHighPass(true);return ctx.resume();});
  const result=await ctx.startRendering();await suspended;effect.dispose();return [result.getChannelData(0),result.getChannelData(1)];
}
const rms=(a:Float32Array)=>Math.sqrt(a.slice(rate*2).reduce((sum,v)=>sum+v*v,0)/rate);
const delta=(a:Float32Array,b:Float32Array,start=0)=>a.slice(start).reduce((max,v,i)=>Math.max(max,Math.abs(v-b[i+start])),0);
const assert=(ok:boolean,message:string)=>{if(!ok)throw Error(message);};
const output=document.querySelector('#result')!;const rows:string[]=[];
try {
  for(const kind of kinds) {
    const lowOff=await render(kind,60,false),lowOn=await render(kind,60,true),highOff=await render(kind,2000,false),highOn=await render(kind,2000,true),legacy=await render(kind,60,undefined);
    const low=rms(lowOn[1])/rms(lowOff[1]),high=rms(highOn[1])/rms(highOff[1]);
    assert(low<.15,`${kind}: bass not attenuated (${low})`);assert(high>.85 && high<1.1,`${kind}: high band changed (${high})`);
    assert(delta(lowOff[0],lowOn[0])===0,`${kind}: dry signal changed`);
    assert(delta(lowOff[1],legacy[1])<1e-6,`${kind}: bypass differs from default (${delta(lowOff[1],legacy[1])})`);
    const tail=await render(kind,60,false,undefined,true),changedTail=await render(kind,60,false,.5,true);
    assert(delta(tail[1],changedTail[1],rate) < 1e-6,`${kind}: existing tail changed`);
    const toggled=await render(kind,60,false,1);
    const jump=toggled[1].slice(rate,rate*1.1).reduce((max,v,i,a)=>i?Math.max(max,Math.abs(v-a[i-1])):max,0);
    assert(jump<.03 && toggled[1].every(Number.isFinite),`${kind}: toggle discontinuity/instability (${jump})`);
    rows.push(`${kind}: bass ${(20*Math.log10(low)).toFixed(2)} dB; high ${(20*Math.log10(high)).toFixed(2)} dB; dry unchanged; bypass within 1e-6; tails preserved; toggle step ${jump.toFixed(5)}`);
    output.textContent=rows.join('\n');
  }
  output.textContent='PASS — all five effect types\n'+rows.join('\n');
} catch(error) { output.textContent='FAIL\n'+rows.join('\n')+'\n'+String(error); }
