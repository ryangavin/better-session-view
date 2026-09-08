import type { DeckAsset } from '../src/play/decks.ts';
import type { Track } from '../src/openflow.ts';
import { evenBeats } from '../src/warp.ts';
import { measureScan, overviewOf } from '../src/play/overview.ts';
export const fixtureTrack:Track={id:'dj-check',title:'Measured stem fixture',artist:'Local generated audio',album:null,art:null,file:'fixture.wav',bpm:120,key:null,seconds:32,added:'',model:null,stems:'fixture',sources:['drums','bass','vocals']};
export async function fixture(ctx:BaseAudioContext):Promise<DeckAsset> {
  const map=evenBeats(ctx.sampleRate,32*ctx.sampleRate,120,0),buffers:Record<string,AudioBuffer>={};
  for(const [name,hz] of [['drums',220],['bass',330],['vocals',550],['full',440]] as const){
    const b=ctx.createBuffer(2,32*ctx.sampleRate,ctx.sampleRate);for(let c=0;c<2;c++){const a=b.getChannelData(c);for(let i=0;i<a.length;i++){const t=i/ctx.sampleRate;a[i]=.08*Math.sin(2*Math.PI*hz*t)*(0.65+0.35*Math.cos(2*Math.PI*2*t));}}buffers[name]=b;
  }
  const sourceOverviews=Object.fromEntries(await Promise.all(Object.entries(buffers).map(async([id,b])=>[id,overviewOf(await measureScan(b,new AbortController().signal),map,b.duration)])));
  return {analysis:{grid:{bpm:120,offset:0},slices:[{bar:0,name:'Intro'},{bar:4,name:'Verse'}]} as DeckAsset['analysis'],peaks:[],audio:{buffers,map,duration:32,sourceOverviews,overview:sourceOverviews.full.peaks,overviewStart:0,overviewSpectrum:sourceOverviews.full.spectrum}};
}
