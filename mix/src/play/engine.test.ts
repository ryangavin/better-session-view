import { afterEach, describe, expect, it, vi } from 'vitest';
import { MixerEngine } from './engine.ts';
import { evenBeats } from '../warp.ts';
import type { Track } from '../openflow.ts';
import type { DeckAsset } from './decks.ts';
import { levelGain, routeGain } from './graph.ts';
const stretching = vi.hoisted(() => ({ prepare: null as Promise<void> | null }));
vi.mock('../stretch.ts', () => ({
  channelsOf: async () => { await stretching.prepare; return [new Float32Array(8),new Float32Array(8)]; },
  stretchOf: async () => ({ latency: .04, node: { addBuffers:async()=>{},dropBuffers:async()=>{},connect(){},disconnect(){},schedule:vi.fn(),setUpdateInterval(){} } }),
}));
class Param {
  value=1;
  cancelScheduledValues() {} setValueAtTime(v:number){this.value=v;return this;} setTargetAtTime(v:number){this.value=v;return this;} linearRampToValueAtTime(v:number){this.value=v;return this;}
}
class Node {
  gain=new Param(); frequency=new Param(); Q=new Param(); delayTime=new Param();
  maxChannelCount=2; channelCount=2; type=''; fftSize=1024; buffer:AudioBuffer|null=null; loop=false;loopStart=0;loopEnd=0;
  merger=0;
  connections:unknown[]=[]; wires:{node:unknown;output:number;input:number}[]=[];
  connect(n:unknown,output=0,input=0){this.connections.push(n);this.wires.push({node:n,output,input});return n;} disconnect(){this.connections=[];this.wires=[];}
  start=vi.fn();stop=vi.fn();getFloatTimeDomainData(a:Float32Array){a.fill(.25);}
}
class Context {
  currentTime=0;sampleRate=48000;destination=new Node();sources:Node[]=[];
  createGain=()=>new Node();createBiquadFilter=()=>new Node();createAnalyser=()=>new Node();createDelay=()=>new Node();createOscillator=()=>new Node();
  mergers:Node[]=[];splitters:Node[]=[];
  createChannelMerger=(n=6)=>{const node=new Node();node.merger=n;this.mergers.push(node);return node;};
  createChannelSplitter=()=>{const node=new Node();this.splitters.push(node);return node;};
  createBuffer=(channels:number,length:number,rate:number)=>({duration:length/rate,sampleRate:rate,length,numberOfChannels:channels,getChannelData:()=>new Float32Array(length)});
  createBufferSource=()=>{const n=new Node();this.sources.push(n);return n;};resume=vi.fn(async()=>{});close=vi.fn(async()=>{});
}
const track:Track={id:'song',title:'Song',artist:'Artist',album:null,art:null,file:'song.wav',bpm:120,key:null,seconds:64,added:'',model:null,stems:'stems/song',sources:['drums','bass','other','vocals']};
const buffer={duration:64,sampleRate:48000,length:64*48000,numberOfChannels:2,getChannelData:()=>new Float32Array(64*48000)} as unknown as AudioBuffer;
function asset():DeckAsset {return {analysis:{grid:{bpm:120,offset:0},slices:[{bar:0,name:'Intro'},{bar:4,name:'Verse'}]} as DeckAsset['analysis'],peaks:[],audio:{map:evenBeats(48000,64*48000,120,0),buffers:Object.fromEntries(['full',...track.sources].map(id=>[id,buffer])),duration:64,overview:[]}};}
const engines:MixerEngine[]=[];
// A deck now loads playing the original; these exercise the stems, so they ask for them.
function setup(){const ctx=new Context(),engine=new MixerEngine(()=>ctx as unknown as AudioContext);engines.push(engine);
  return {ctx,engine,load:async(id='deck-a')=>{await engine.load(id,track,async()=>asset());engine.commands.setDeck(id,'full',false);}};}
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
afterEach(()=>{engines.splice(0).forEach(e=>e.dispose());stretching.prepare=null;vi.useRealTimers();});
describe('the four-deck playback owner',()=>{
  it('adjusts native leader tempo by enabling pitch-preserving Sync and retains the requested rate', async () => {
    vi.useFakeTimers();const {engine,ctx,load}=setup();await load();await engine.play('deck-a',true);
    await vi.advanceTimersByTimeAsync(40);engine.commands.setMaster('bpm',135);await settle();
    expect(engine.snapshot().decks[0].synced).toBe(true);expect(engine.snapshot().bpm).toBe(135);
    ctx.currentTime=1;await vi.advanceTimersByTimeAsync(300);expect(engine.snapshot().bpm).toBe(135);
    await load('deck-b');expect(engine.snapshot().bpm).toBe(135);
  });
  it('defaults waveform moves to all participating stems and allows focused movement explicitly', async () => {
    const {engine,load}=setup();await load();
    expect(engine.snapshot().decks[0].moveTogether).toBe(true);
    engine.move('deck-a','begin');engine.move('deck-a','move',4);engine.move('deck-a','commit');
    expect(Object.values(engine.readFrame().decks['deck-a'].sources!).every(s=>s.seconds===2)).toBe(true);
    engine.commands.setMoveTogether!('deck-a',false);expect(engine.snapshot().decks[0].moveTogether).toBe(true);
    await engine.launch('deck-a','section-0-0','drums');await engine.play('deck-a',false);
    engine.commands.setMoveTogether!('deck-a',false);
    engine.move('deck-a','begin');engine.move('deck-a','move',2);engine.move('deck-a','commit');
    const sources=engine.readFrame().decks['deck-a'].sources!;
    expect(sources.drums.seconds).toBe(3);expect(sources.bass.seconds).toBe(2);
    await engine.launch('deck-a','section-0-0');
    expect(engine.snapshot().decks[0]).toMatchObject({moveTogether:true,independentStems:false});
  });
  it('shows the original waveform without changing stem playback or positioning focus', async () => {
    vi.useFakeTimers();
    const {engine,ctx}=setup(), loaded=asset();
    loaded.audio!.sourceOverviews={full:{start:0,peaks:Array.from({length:1024},()=>({min:-.7,max:.7})),spectrum:[]}};
    await engine.load('deck-a',track,async()=>loaded);
    expect(engine.snapshot().decks[0].waveformSource).toBe('full');
    engine.commands.setDeck('deck-a','full',false);
    await engine.play('deck-a',true,undefined,false,'drums');
    const before=ctx.sources.length;
    engine.commands.setFocus!('deck-a','full');
    expect(engine.snapshot().decks[0]).toMatchObject({full:false,focus:'drums',waveformSource:'full',waveform:{focus:'full'}});
    expect(engine.snapshot().decks[0].peaks.some(p=>p.max===.7)).toBe(true);
    expect(ctx.sources).toHaveLength(before);
    expect(engine.readFrame().decks['deck-a'].sources!.drums.playing).toBe(true);
    engine.commands.setFocus!('deck-a','bass');
    expect(engine.snapshot().decks[0]).toMatchObject({focus:'bass',waveformSource:undefined,waveform:{focus:'bass'}});
  });
  it('indexes the full-track overview from its negative beat origin, including after a page change', async () => {
    vi.useFakeTimers();
    const {engine,ctx} = setup();
    const loaded = asset();
    loaded.audio!.overviewStart = -8;
    loaded.audio!.overview = Array.from({length:1024},(_,i)=>({min:0,max:i/1024}));
    loaded.audio!.overviewSpectrum = Array.from({length:1024},(_,i)=>[i,0,0] as const);
    await engine.load('deck-a',track,async()=>loaded);
    await vi.advanceTimersByTimeAsync(40);
    let d = engine.snapshot().decks[0];
    expect(d.waveform?.start).toBe(-32);
    // Beat -8 appears at index 192 of the 96-beat window; beat zero at 256.
    expect(d.peaks[256].max).toBe(64/1024);
    expect(d.waveformSpectrum?.[256]).toEqual([64,0,0]);
    await engine.launch('deck-a','section-0-0');
    ctx.currentTime = 20;
    await vi.advanceTimersByTimeAsync(40);
    d = engine.snapshot().decks[0];
    expect(d.waveform?.start).toBe(0);
    expect(d.peaks[0].max).toBe(64/1024);
    expect(d.waveformSpectrum?.[0]).toEqual([64,0,0]);
  });
  it('restarts on a new output while retaining tracks, positions and mixer controls', async () => {
    const { engine, ctx, load } = setup(); await load();
    engine.commands.setDeck('deck-a', 'trim', 4);
    await engine.launch('deck-a', 'section-1-4', 'bass'); ctx.currentTime = 2;
    const before = engine.readFrame().decks['deck-a'].beat;
    const next = new Context(); next.sampleRate = 96000;
    engine.replaceAudioContext(next as unknown as AudioContext);
    expect(ctx.close).toHaveBeenCalledOnce(); expect(next.sources).toHaveLength(0);
    expect(engine.snapshot().running).toBe(false);
    expect(engine.snapshot().decks[0]).toMatchObject({ playing: false, trim: 4, track: { id: 'song' } });
    expect(engine.snapshot().decks[0].stems.find(s => s.id === 'bass')?.selected).toBe('section-1-4');
    expect(engine.readFrame().decks['deck-a'].beat).toBeCloseTo(before);
    await engine.play('deck-a', true);
    expect(next.sources).toHaveLength(1);
    expect(next.sources[0].loopStart).toBe(0);
    expect(next.sources[0].loopEnd).toBe(56);
    expect(next.sources[0].start.mock.calls[0][1]).toBeCloseTo(1.97);
  });
  it('uses section names as hot cues that play through the next boundary in stems and Full mode', async () => {
    const {engine,ctx,load}=setup(); await load();
    await engine.launch('deck-a','section-0-0','drums');
    expect(ctx.sources.at(-1)!.loop).toBe(true);
    await engine.launch('deck-a','section-0-0');
    expect(ctx.sources.slice(-4).every(s=>!s.loop)).toBe(true);
    expect(engine.snapshot().decks[0].loop?.enabled).toBe(false);
    ctx.currentTime=10; expect(engine.readFrame().decks['deck-a'].seconds).toBeGreaterThan(8);
    engine.commands.setDeck('deck-a','full',true); await settle();
    await engine.launch('deck-a','section-0-0');
    expect(ctx.sources.at(-1)!.loop).toBe(false);
    expect(ctx.sources.at(-1)!.start.mock.calls[0][1]).toBe(0);
  });
  it('loops a whole-track stem pad but plays the Track name through once', async () => {
    const {engine,ctx}=setup(); const whole=asset(); whole.analysis={...whole.analysis!,slices:[]};
    await engine.load('deck-a',track,async()=>whole);engine.commands.setDeck('deck-a','full',false);
    await engine.launch('deck-a','full-track','drums'); expect(ctx.sources.at(-1)!.loop).toBe(true);
    expect(engine.snapshot().decks[0].loop?.end).toBe(64);
    await engine.launch('deck-a','full-track'); expect(ctx.sources.slice(-4).every(s=>!s.loop)).toBe(true);
  });
  it('exits and reloops one deck without changing the other deck or jumping on exit', async () => {
    const {engine,ctx,load}=setup(); await load(); await load('deck-b');
    await engine.launch('deck-a','section-0-0','drums');
    await engine.launch('deck-b','section-1-4','bass');
    const other=ctx.sources.at(-1)!; ctx.currentTime=2;
    engine.commands.setDeckLoopEnabled!('deck-a',false);
    expect(other.stop).not.toHaveBeenCalled();
    expect(ctx.sources.at(-1)!.loop).toBe(false);
    expect(ctx.sources.at(-1)!.start.mock.calls[0][1]).toBeCloseTo(2);
    expect(engine.snapshot().decks[1].loop?.enabled).toBe(true);
    engine.commands.setDeckLoopEnabled!('deck-a',true);
    expect(ctx.sources.at(-1)!.loopStart).toBe(0); expect(ctx.sources.at(-1)!.loopEnd).toBe(8);
    expect(other.stop).not.toHaveBeenCalled();
  });
  it('captures custom bounds for just the requested deck and hot cues escape them', async () => {
    const {engine,ctx,load}=setup(); await load(); await load('deck-b'); await engine.running(true);
    const other=ctx.sources.slice(-4), stopped=other.map(s=>s.stop.mock.calls.length); ctx.currentTime=2; const from=engine.readFrame().decks['deck-a'].seconds!; engine.commands.deckLoopIn!('deck-a');
    ctx.currentTime=4; const to=engine.readFrame().decks['deck-a'].seconds!; engine.commands.deckLoopOut!('deck-a');
    expect(ctx.sources.at(-1)!.loopStart).toBe(0); expect(ctx.sources.at(-1)!.loopEnd).toBeCloseTo(to-from);
    expect(other.map(s=>s.stop.mock.calls.length)).toEqual(stopped);
    await engine.launch('deck-a','section-1-4');
    expect(ctx.sources.slice(-4).every(s=>!s.loop)).toBe(true);
    expect(ctx.sources.at(-1)!.start.mock.calls[0][1]).toBe(8);
    expect(engine.snapshot().decks[0].loop).toEqual({start:null,end:null,enabled:false});
  });
  it('starts four decks on one sample clock and pauses only the requested deck',async()=>{
    const {engine,ctx,load}=setup();for(const id of ['deck-a','deck-b','deck-c','deck-d'])await load(id);
    await engine.running(true);expect(ctx.sources).toHaveLength(16);
    expect(new Set(ctx.sources.map(s=>s.start.mock.calls[0][0])).size).toBe(1);
    ctx.currentTime=2;await engine.play('deck-b',false);const paused=engine.readFrame().decks['deck-b'].beat;
    ctx.currentTime=3;expect(engine.readFrame().decks['deck-b'].beat).toBe(paused);expect(engine.readFrame().decks['deck-a'].beat).toBeGreaterThan(paused);
    engine.stop();expect(engine.snapshot().running).toBe(false);expect(Object.values(engine.readFrame().decks).every(d=>d.beat===0)).toBe(true);
  });
  it('launches stems independently, loops saved boundaries, and stops just one stem',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.launch('deck-a','section-0-0','drums');await engine.launch('deck-a','section-1-4','bass');
    expect(ctx.sources.map(s=>[s.loopStart,s.loopEnd])).toEqual([[0,8],[0,56]]);
    await engine.launch('deck-a',null,'drums');expect(ctx.sources[0].stop).toHaveBeenCalled();expect(ctx.sources[1].stop).not.toHaveBeenCalled();
    expect(engine.snapshot().decks[0].stems.map(s=>s.selected)).toEqual([null,'section-1-4',null,null]);
  });
  it('switches original/stems without playing both together',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.play('deck-a',true);ctx.currentTime=3;
    engine.commands.setDeck('deck-a','full',true);await settle();expect(ctx.sources).toHaveLength(5);
    expect(ctx.sources.slice(0,4).every(s=>s.stop.mock.calls.length>0)).toBe(true);
    expect(ctx.sources[4].start.mock.calls[0][1]).toBeCloseTo(2.97);
  });
  it('implements return-to-cue, held audition, release, and Play takeover',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.play('deck-a',true);ctx.currentTime=3;
    engine.cue('deck-a',true);expect(engine.snapshot().decks[0].playing).toBe(false);expect(engine.readFrame().decks['deck-a'].beat).toBe(0);engine.cue('deck-a',false);
    engine.cue('deck-a',true);await settle();expect(engine.snapshot().decks[0].playing).toBe(true);ctx.currentTime=4;
    engine.cue('deck-a',false);expect(engine.readFrame().decks['deck-a'].beat).toBe(0);
    engine.cue('deck-a',true);await settle();await engine.play('deck-a',true);engine.cue('deck-a',false);expect(engine.snapshot().decks[0].playing).toBe(true);
  });
  it('sets a new cue while paused, and never resurrects a released audition',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.play('deck-a',true);ctx.currentTime=2;await engine.play('deck-a',false);
    engine.cue('deck-a',true);expect(engine.snapshot().decks[0].playing).toBe(false);engine.cue('deck-a',false);
    const cue=engine.readFrame().decks['deck-a'].beat;engine.cue('deck-a',true);engine.cue('deck-a',false);await settle();expect(engine.snapshot().decks[0].playing).toBe(false);expect(engine.readFrame().decks['deck-a'].beat).toBe(cue);
  });
  it('cancels an in-flight Play when Stop arrives before context resume',async()=>{
    const {engine,ctx,load}=setup();await load();let release!:()=>void;ctx.resume.mockImplementation(()=>new Promise<void>(r=>release=r));
    const starting=engine.play('deck-a',true);engine.stop();release();await starting;expect(ctx.sources).toHaveLength(0);expect(engine.snapshot().running).toBe(false);
  });
  it('does not let a slow Sync or late replacement start an old deck',async()=>{
    const {engine,load}=setup();await load();let release!:()=>void;stretching.prepare=new Promise<void>(r=>release=r);
    const pending=engine.sync('deck-a',true);await load();release();await pending;expect(engine.snapshot().decks[0].synced).toBe(false);
  });
  it('captures real source positions for In/Out and retains the loop on exit',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.play('deck-a',true);ctx.currentTime=2;engine.commands.loopIn();ctx.currentTime=4;engine.commands.loopOut();
    const loop=ctx.sources.at(-1)!;expect(loop.loop).toBe(true);expect(loop.loopStart).toBe(0);expect(loop.loopEnd).toBeCloseTo(2);
    engine.commands.setLoopEnabled(false);expect(ctx.sources.at(-1)!.loop).toBe(false);engine.commands.setLoopEnabled(true);expect(ctx.sources.at(-1)!.loopStart).toBe(0);
  });
  it('preserves a paused synced source position including audio before the first beat',async()=>{
    const {engine,ctx}=setup();const shifted=asset();shifted.audio!.map=evenBeats(48000,64*48000,120,.2);
    await engine.load('deck-a',track,async()=>shifted);await engine.sync('deck-a',true);await engine.play('deck-a',true);
    expect(ctx.sources).toHaveLength(0);ctx.currentTime=.56;expect(engine.readFrame().decks['deck-a'].beat).toBeCloseTo(.6,4);
  });
  it('keeps queued launches and the playhead on the audible section until the bar',async()=>{
    vi.useFakeTimers();
    try {
      const {engine,ctx,load}=setup();await load();await engine.sync('deck-a',true);engine.commands.setDeckTiming!('deck-a','launchBeats',4);await engine.play('deck-a',true);
      ctx.currentTime=1;const before=engine.readFrame().decks['deck-a'].beat;
      await engine.launch('deck-a','section-1-4','drums');
      expect(engine.snapshot().decks[0].stems[0].queued).toBe('section-1-4');
      expect(engine.snapshot().decks[0].stems[0].selected).toBeNull();
      expect(engine.readFrame().decks['deck-a'].beat).toBeCloseTo(before);
      ctx.currentTime=2.2;vi.advanceTimersByTime(40);
      expect(engine.snapshot().decks[0].stems[0].queued).toBeUndefined();
      expect(engine.snapshot().decks[0].stems[0].selected).toBe('section-1-4');
    } finally {vi.useRealTimers();}
  });
  it('recalls a divergent combination and loops without overwriting gains or reviving stopped stems',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.launch('deck-a','section-0-0','drums');await engine.launch('deck-a','section-1-4','bass');ctx.currentTime=1;
    await engine.play('deck-a',false);engine.cue('deck-a',true);engine.cue('deck-a',false);
    const saved=engine.readFrame().decks['deck-a'].sources!;
    engine.commands.setStemLevel('deck-a','bass',37);await engine.play('deck-a',true);ctx.currentTime=2;
    engine.cue('deck-a',true);engine.cue('deck-a',false);
    const got=engine.readFrame().decks['deck-a'].sources!;
    expect(got.drums.seconds).toBe(saved.drums.seconds);expect(got.bass.seconds).toBe(saved.bass.seconds);expect(got.other.enabled).toBe(false);
    engine.cue('deck-a',true);await settle();await engine.play('deck-a',true);engine.cue('deck-a',false);
    expect(ctx.sources.slice(-2).map(s=>s.loopEnd)).toEqual([8,56]);expect(engine.snapshot().decks[0].stems[1].level).toBe(37);
  });
  it('moves only focus or all active stems relatively, clamps the common delta, and cancels without losing loops',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.launch('deck-a','section-0-0','drums');await engine.launch('deck-a','section-1-4','bass');ctx.currentTime=1;await engine.play('deck-a',false);
    const before=engine.readFrame().decks['deck-a'].sources!;
    engine.commands.setMoveTogether!('deck-a',true);engine.move('deck-a','begin');engine.move('deck-a','move',4);
    let got=engine.readFrame().decks['deck-a'].sources!;expect(got.drums.beat-before.drums.beat).toBeCloseTo(4);expect(got.bass.beat-before.bass.beat).toBeCloseTo(4);
    engine.move('deck-a','cancel');expect(engine.snapshot().decks[0].loop?.enabled).toBe(true);
    engine.move('deck-a','begin');engine.move('deck-a','move',1000);engine.move('deck-a','commit');got=engine.readFrame().decks['deck-a'].sources!;
    expect(got.bass.seconds).toBeCloseTo(64);expect(got.bass.beat-got.drums.beat).toBeCloseTo(before.bass.beat-before.drums.beat);
    engine.commands.setMoveTogether!('deck-a',false);engine.commands.setFocus!('deck-a','bass');engine.move('deck-a','begin');engine.move('deck-a','move',-2);engine.move('deck-a','commit');
    expect(engine.readFrame().decks['deck-a'].sources!.drums.seconds).toBe(got.drums.seconds);
  });
  it('scrubs playing focus without stopping other stems, and cancellation restores playback and loops',async()=>{
    const {engine,ctx,load}=setup();await load();engine.commands.setMoveTogether!('deck-a',false);await engine.launch('deck-a','section-0-0','drums');await engine.launch('deck-a','section-1-4','bass');ctx.currentTime=1;
    const before=engine.readFrame().decks['deck-a'].sources!;engine.move('deck-a','begin');ctx.currentTime=1.2;engine.move('deck-a','move',4);ctx.currentTime=1.24;
    let got=engine.readFrame().decks['deck-a'].sources!;expect(got.drums.playing).toBe(true);expect(got.bass.playing).toBe(true);expect(got.drums.seconds).toBeCloseTo(before.drums.seconds+.24+2,2);
    engine.move('deck-a','cancel');ctx.currentTime=1.28;got=engine.readFrame().decks['deck-a'].sources!;expect(got.drums.playing).toBe(true);expect(got.drums.seconds).toBeCloseTo(before.drums.seconds+.01,2);expect(engine.snapshot().decks[0].loop?.enabled).toBe(true);
  });
  it('fits the entire source independently of playhead paging and returns to scrolling zoom',async()=>{
    const {engine,ctx,load}=setup();await load();engine.commands.setZoom!('deck-a',0);let wave=engine.snapshot().decks[0].waveform!;
    expect(wave).toMatchObject({fixed:true,start:0,length:128,visible:128});await engine.play('deck-a',true);ctx.currentTime=40;engine.commands.setZoom!('deck-a',0);expect(engine.snapshot().decks[0].waveform!.start).toBe(0);
    engine.commands.setZoom!('deck-a',32);expect(engine.snapshot().decks[0].waveform!.fixed).toBe(false);
  });
  it('takes tempo from the first playing track and never from loading or syncing a follower',async()=>{
    const {engine,ctx,load}=setup();await load('deck-a');const other=asset();other.audio!.map=evenBeats(48000,64*48000,90,0);
    await engine.load('deck-b',{...track,bpm:90},async()=>other);expect(engine.snapshot().decks.some(d=>d.syncLeader)).toBe(false);
    await engine.play('deck-b',true);expect(engine.snapshot().bpm).toBeCloseTo(90);ctx.currentTime=1;const before=engine.readFrame().decks['deck-b'].seconds;
    await engine.sync('deck-a',true);await engine.play('deck-a',true);expect(engine.snapshot().bpm).toBeCloseTo(90);expect(engine.readFrame().decks['deck-b'].seconds).toBe(before);
    await engine.play('deck-b',false);expect(engine.snapshot().bpm).toBeCloseTo(90);expect(engine.snapshot().decks[0].syncLeader).toBe(true);
  });
  it('elects the first playing deck and hands leadership to the next still playing deck',async()=>{
    const {engine,load}=setup();await load('deck-a');await load('deck-b');await engine.play('deck-b',true);await engine.play('deck-a',true);
    expect(engine.snapshot().decks.find(d=>d.syncLeader)?.id).toBe('deck-b');await engine.play('deck-b',false);expect(engine.snapshot().decks.find(d=>d.syncLeader)?.id).toBe('deck-a');engine.stop();expect(engine.snapshot().decks.some(d=>d.syncLeader)).toBe(false);
  });
  it('corrects a synced follower after a playing scrub without toggling Sync',async()=>{
    vi.useFakeTimers();const {engine,ctx,load}=setup();await load('deck-a');await load('deck-b');await engine.play('deck-a',true);await engine.sync('deck-b',true);await engine.play('deck-b',true);
    ctx.currentTime=1;engine.move('deck-b','begin');engine.move('deck-b','move',.4);engine.move('deck-b','commit');ctx.currentTime=1.2;await vi.advanceTimersByTimeAsync(40);ctx.currentTime=1.4;
    const f=engine.readFrame();const delta=f.decks['deck-a'].beat-f.decks['deck-b'].beat;expect(Math.abs(delta-Math.round(delta))).toBeLessThan(.01);expect(engine.snapshot().decks[1].synced).toBe(true);
  });
  it('queues synced loops to a leader bar and keeps their region on whole beats',async()=>{
    const {engine,ctx,load}=setup();await load('deck-a');await load('deck-b');await engine.play('deck-a',true);await engine.sync('deck-b',true);await engine.play('deck-b',true);ctx.currentTime=.7;
    engine.commands.setLoopBeats!(4);engine.quickLoop('deck-b');expect(engine.snapshot().decks[1].message).toBe('Loop queued for next bar.');const span=engine.snapshot().decks[1].loop!;expect(span.start!*2%1).toBeCloseTo(0);expect((span.end!-span.start!)*2).toBeCloseTo(4);
    ctx.currentTime=1;expect(engine.readFrame().decks['deck-b'].seconds).toBeCloseTo(.97,2);ctx.currentTime=2.1;expect(engine.readFrame().decks['deck-b'].seconds).toBeCloseTo(span.start!+.07,2);
  });
  it('lets Play take over even before asynchronous Cue preparation finishes',async()=>{
    const {engine,ctx,load}=setup();await load();let release!:()=>void;ctx.resume.mockImplementation(()=>new Promise<void>(r=>release=r));
    engine.cue('deck-a',true);await engine.play('deck-a',true);engine.cue('deck-a',false);release();await settle();
    expect(engine.snapshot().decks[0].playing).toBe(true);
  });
  it('keeps stopped stems stopped and preserves their positions across Full playback',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.launch('deck-a','section-1-4','bass');ctx.currentTime=1;await engine.play('deck-a',false);
    const before=engine.readFrame().decks['deck-a'].sources!.bass.seconds;engine.commands.setDeck('deck-a','full',true);await engine.play('deck-a',true);ctx.currentTime=2;engine.commands.setDeck('deck-a','full',false);await settle();
    expect(engine.readFrame().decks['deck-a'].sources!.bass.seconds).toBeCloseTo(before);expect(engine.readFrame().decks['deck-a'].sources!.drums.enabled).toBe(false);
  });
  it('snaps manual In/Out, sets Cue at In and keeps Q separate from launch timing',async()=>{
    const {engine,ctx,load}=setup();await load();engine.commands.setDeckTiming!('deck-a','quantize',1);await engine.play('deck-a',true);
    ctx.currentTime=4.14;engine.deckLoopIn('deck-a');ctx.currentTime=6.42;engine.deckLoopOut('deck-a');
    expect(engine.snapshot().decks[0].loop).toEqual({start:4,end:6.5,enabled:true});
    engine.cue('deck-a',true);engine.cue('deck-a',false);expect(engine.readFrame().decks['deck-a'].seconds).toBe(4);
    await engine.sync('deck-a',true);await engine.launch('deck-a','section-1-4','bass');expect(engine.snapshot().decks[0].stems[1].queued).toBe('section-1-4');
  });
  it('snaps a Cue set on a synced deck to the nearest beat while Q is off',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.sync('deck-a',true);
    expect(engine.snapshot().decks[0].quantize).toBe(0);
    await engine.play('deck-a',true);ctx.currentTime=1.18;await engine.play('deck-a',false);
    engine.cue('deck-a',true);engine.cue('deck-a',false);
    expect(engine.readFrame().decks['deck-a'].seconds).toBe(1);
  });
  it('steps a synced deck loop boundary a whole beat while Q is off',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.sync('deck-a',true);
    await engine.play('deck-a',true);ctx.currentTime=2.03;engine.quickLoop('deck-a');
    const before=engine.snapshot().decks[0].loop!;expect(before.start!%.5).toBe(0);
    engine.editLoops('deck-a','in',.125);
    expect(engine.snapshot().decks[0].loop!.start).toBe(before.start!+.5);
    engine.editLoops('deck-a','out',-.125);
    expect(engine.snapshot().decks[0].loop!.end).toBe(before.end!-.5);
  });
  it('starts a quick loop around the playhead without moving it',async()=>{
    const {engine,ctx,load}=setup();await load();
    engine.commands.setDeckTiming!('deck-a','quantize',1);
    await engine.play('deck-a',true);ctx.currentTime=2.3;
    const before=engine.readFrame().decks['deck-a'].seconds!;
    engine.quickLoop('deck-a');
    const loop=engine.snapshot().decks[0].loop!;
    expect(engine.readFrame().decks['deck-a'].seconds).toBe(before);
    expect(loop.start!).toBeLessThanOrEqual(before);
    expect(loop.end!).toBeGreaterThan(before);
  });
  it('keeps the fader and Sync across a new track on the same deck',async()=>{
    const {engine,ctx,load}=setup();ctx.destination.maxChannelCount=4;await load();
    const desk={gain:42,trim:-3,filter:-25,sendA:20,sendB:30,route:2,cue:true} as const;
    for(const [control,value] of Object.entries(desk)) engine.commands.setDeck('deck-a',control as 'gain',value as never);
    [4,-2,6].forEach((db,band)=>engine.commands.setDeckEq('deck-a',band,db));
    await engine.sync('deck-a',true);
    expect(engine.snapshot().decks[0]).toMatchObject({...desk,eq:[4,-2,6],synced:true});
    await load();
    expect(engine.snapshot().decks[0]).toMatchObject({...desk,eq:[4,-2,6],synced:true});
    await engine.load('deck-a',track,async()=>({...asset(),analysis:{slices:asset().analysis!.slices} as DeckAsset['analysis']}));
    expect(engine.snapshot().decks[0]).toMatchObject({...desk,eq:[4,-2,6],synced:false,gridAvailable:false});
  });
  it('takes a stem clip as the request for stems, and swaps sources without a pause',async()=>{
    const {engine,ctx}=setup();
    await engine.load('deck-a',track,async()=>asset());
    expect(engine.snapshot().decks[0].full).toBe(true);
    await engine.play('deck-a',true);ctx.currentTime=2;
    const stopped=()=>ctx.sources.filter(s=>s.stop.mock.calls.length>0).length;
    const before=stopped();
    await engine.launch('deck-a','section-0-0','bass');
    expect(engine.snapshot().decks[0]).toMatchObject({full:false,playing:true});
    expect(engine.snapshot().decks[0].stems.find(s=>s.id==='bass')!.selected).toBe('section-0-0');
    // Nothing was halted for the swap: the original plays on under a gain the mode gates.
    expect(stopped()).toBe(before);
  });
  it('sends the mix and the cue to the chosen output pairs, and drops the cue a narrow device cannot reach',async()=>{
    const store=new Map<string,string>();
    vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)});
    const held=(mainPair:number,cuePair:number)=>store.set('mix.audio.v1',JSON.stringify({deviceId:'',sampleRate:0,latency:'interactive',mainPair,cuePair}));
    const landings=(ctx:Context)=>{const merge=ctx.mergers.at(-1)!;
      return ctx.splitters.flatMap(sp=>sp.wires.filter(w=>w.node===merge).map(w=>w.input)).sort((a,b)=>a-b);};
    try {
      // A Model 16: the mix on 13/14, the cue on 11/12.
      held(6,5);
      const wide=setup();wide.ctx.destination.maxChannelCount=16;await wide.load();
      expect(wide.engine.phonesAvailable).toBe(true);
      expect([wide.engine.mainPair,wide.engine.cuePair]).toEqual([6,5]);
      expect(wide.ctx.destination.channelCount).toBe(14);
      expect(landings(wide.ctx)).toEqual([10,11,12,13]);
      // Four outputs: 13/14 is out of reach, so the mix falls to the front pair and the cue goes.
      held(6,5);
      const narrow=setup();narrow.ctx.destination.maxChannelCount=4;await narrow.load();
      expect([narrow.engine.mainPair,narrow.engine.cuePair]).toEqual([0,null]);
      expect(narrow.engine.phonesAvailable).toBe(false);
      // The conventional pair of pairs still routes 1/2 and 3/4.
      held(0,1);
      const usual=setup();usual.ctx.destination.maxChannelCount=4;await usual.load();
      expect(usual.engine.phonesAvailable).toBe(true);
      expect(usual.ctx.destination.channelCount).toBe(4);
      expect(landings(usual.ctx)).toEqual([0,1,2,3]);
    } finally { vi.unstubAllGlobals(); }
  });
  it('loads on the original track with every stem back at full level',async()=>{
    const {engine,load}=setup();await load();
    engine.commands.setStemLevel('deck-a','bass',37);
    expect(engine.snapshot().decks[0].stems.find(s=>s.id==='bass')!.level).toBe(37);
    await engine.load('deck-a',track,async()=>asset());
    expect(engine.snapshot().decks[0].full).toBe(true);
    expect(engine.snapshot().decks[0].stems.every(s=>s.level===100)).toBe(true);
  });
  it('gives every deck one quick loop length, two bars by default',async()=>{
    const {engine,ctx,load}=setup();await load('deck-a');await load('deck-b');
    expect(engine.snapshot().loopBeats).toBe(8);
    await engine.play('deck-a',true);await engine.play('deck-b',true);ctx.currentTime=2;
    engine.quickLoop('deck-a');
    const a=engine.snapshot().decks[0].loop!;
    expect(+((a.end!-a.start!)*2).toFixed(2)).toBe(8);
    // The length is the rig's, so the second deck loops the same without being told.
    engine.commands.setLoopBeats!(4);
    engine.quickLoop('deck-b');
    const b=engine.snapshot().decks[1].loop!;
    expect(+((b.end!-b.start!)*2).toFixed(2)).toBe(4);
    expect(engine.snapshot().loopBeats).toBe(4);
  });
  it('creates 16 beats, halves/doubles, moves, exits and reloops without changing the Cue',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.play('deck-a',true);ctx.currentTime=2.03;
    engine.commands.setDeckTiming!('deck-a','quantize',1);engine.commands.setLoopBeats!(16);engine.quickLoop('deck-a');expect(engine.snapshot().decks[0].loop).toEqual({start:2,end:10,enabled:true});
    engine.editLoops('deck-a','resize',.5);expect(engine.snapshot().decks[0].loop?.end).toBe(6);engine.editLoops('deck-a','resize',2);expect(engine.snapshot().decks[0].loop?.end).toBe(10);
    engine.editLoops('deck-a','move',1);expect(engine.snapshot().decks[0].loop?.start).toBe(2.5);
    engine.setDeckLoopEnabled('deck-a',false);expect(engine.snapshot().decks[0].loop?.enabled).toBe(false);engine.setDeckLoopEnabled('deck-a',true);expect(ctx.sources.at(-1)!.loopStart).toBe(0);expect(ctx.sources.at(-1)!.loopEnd).toBe(8);
    engine.cue('deck-a',true);expect(engine.readFrame().decks['deck-a'].seconds).toBe(0);
  });
  it('rejects invalid loop edits atomically and uses musical length on a variable map',async()=>{
    const {engine,ctx}=setup();const a=asset();a.audio!.map={rate:48000,length:64*48000,first:0,samples:[0,24000,48000,72000,96000,144000,192000,240000,288000]};
    await engine.load('deck-a',track,async()=>a);engine.commands.setLoopBeats!(8);engine.quickLoop('deck-a');expect(engine.snapshot().decks[0].loop?.end).toBe(6);
    const before=engine.snapshot().decks[0].loop;engine.editLoops('deck-a','in',20);expect(engine.snapshot().decks[0].loop).toEqual(before);
  });
  it('returns Slip loops to each independent background position and ordinary loops to audible position',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.launch('deck-a','section-0-0','drums');await engine.launch('deck-a','section-1-4','bass');engine.setDeckLoopEnabled('deck-a',false);
    ctx.currentTime=1;engine.commands.setSlip!('deck-a',true);engine.commands.setLoopBeats!(1);engine.quickLoop('deck-a');
    ctx.currentTime=4;const loop=engine.readFrame().decks['deck-a'].sources!;expect(loop.drums.backgroundBeat).toBeGreaterThan(loop.drums.beat+4);
    engine.setDeckLoopEnabled('deck-a',false);ctx.currentTime=4.1;const exited=engine.readFrame().decks['deck-a'].sources!;
    expect(exited.bass.seconds-exited.drums.seconds).toBeCloseTo(8);expect(exited.drums.seconds).toBeGreaterThan(4);expect(exited.drums.backgroundBeat).toBeUndefined();
    engine.commands.setSlip!('deck-a',false);engine.quickLoop('deck-a');ctx.currentTime=6;const at=engine.readFrame().decks['deck-a'].seconds!;engine.setDeckLoopEnabled('deck-a',false);ctx.currentTime=6.04;expect(engine.readFrame().decks['deck-a'].seconds).toBeCloseTo(at+.04,2);
  });
  it('preserves effect configuration and live returns when the group is turned off',async()=>{
    const {engine,load}=setup();await load();engine.commands.setEffectParam!('A','echo','feedback',61);engine.commands.setEffect('A','echo');engine.commands.setDeck('deck-a','sendA',72);engine.commands.setEffectEnabled!('B',false);
    const output=engine.output('fx-a'),saved=engine.snapshot().effectValues;engine.commands.setEffectsEnabled!(false);
    expect(engine.output('fx-a')).toBe(output);expect(engine.snapshot().decks[0].sendA).toBe(72);engine.commands.setEffectsEnabled!(true);expect(engine.snapshot().effectValues).toBe(saved);expect(engine.snapshot().effectEnabled?.B).toBe(false);
    engine.commands.setEffect('A','reverb');expect(engine.output('fx-a')).not.toBe(output);expect((output as unknown as Node).connections.length).toBeGreaterThan(0);
  });
  it('does not let release restore a checkpoint after a stop command supersedes a held Cue',async()=>{
    const {engine,load}=setup();await load();engine.cue('deck-a',true);await settle();await engine.launch('deck-a',null);engine.cue('deck-a',false);expect(engine.snapshot().decks[0].playing).toBe(false);expect(engine.readFrame().decks['deck-a'].sources!.drums.enabled).toBe(false);
  });
  it('beat-jumps a paused combination without collapsing offsets, reviving stopped stems or rewriting Cue',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.launch('deck-a','section-0-0','drums');await engine.launch('deck-a','section-1-4','bass');ctx.currentTime=1;await engine.play('deck-a',false);
    engine.cue('deck-a',true);engine.cue('deck-a',false);const before=engine.readFrame().decks['deck-a'].sources!;
    engine.beatJump('deck-a',1);let got=engine.readFrame().decks['deck-a'].sources!;
    for(const id of ['drums','bass']){expect(got[id].beat-before[id].beat).toBeCloseTo(1);expect(got[id].playing).toBe(false);}
    expect(got.other).toEqual(before.other);expect(engine.snapshot().decks[0].loop?.enabled).toBe(false);
    engine.beatJump('deck-a',-1);got=engine.readFrame().decks['deck-a'].sources!;expect(got.drums.seconds).toBeCloseTo(before.drums.seconds);expect(got.bass.seconds).toBeCloseTo(before.bass.seconds);
    engine.beatJump('deck-a',1);await engine.play('deck-a',true);ctx.currentTime=2;engine.cue('deck-a',true);engine.cue('deck-a',false);
    got=engine.readFrame().decks['deck-a'].sources!;expect(got.drums.seconds).toBe(before.drums.seconds);expect(got.bass.seconds).toBe(before.bass.seconds);expect(engine.snapshot().decks[0].loop?.enabled).toBe(true);
  });
  it('beat-jumps playing and paused participants together while preserving their transport states',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.launch('deck-a','section-0-0','drums');await engine.launch('deck-a','section-1-4','bass');ctx.currentTime=1;await engine.play('deck-a',false,undefined,false,'bass');
    engine.beatJump('deck-a',1);ctx.currentTime=1.04;const got=engine.readFrame().decks['deck-a'].sources!;
    expect(got.drums.seconds).toBeCloseTo(1.51);expect(got.drums.playing).toBe(true);expect(got.bass.seconds).toBeCloseTo(9.47);expect(got.bass.playing).toBe(false);expect(got.other.enabled).toBe(false);
  });
  it('rejects an entire beat jump at either file edge instead of wrapping or shortening a source step',async()=>{
    const {engine,load}=setup();await load();engine.beatJump('deck-a',-1);expect(engine.readFrame().decks['deck-a'].seconds).toBe(0);expect(engine.snapshot().decks[0].message).toContain('boundary');
    engine.move('deck-a','begin');engine.move('deck-a','move',127);engine.move('deck-a','commit');const before=engine.readFrame().decks['deck-a'].sources!;
    engine.beatJump('deck-a',1);expect(engine.readFrame().decks['deck-a'].sources).toEqual(before);
  });
  it('uses mapped beats, including tempo changes, for the same musical step on divergent sources',async()=>{
    const {engine}=setup();const a=asset();a.audio!.map={rate:48000,length:64*48000,first:0,samples:[0,24000,48000,72000,96000,144000,192000,240000,288000]};await engine.load('deck-a',track,async()=>a);engine.commands.setDeck('deck-a','full',false);await engine.launch('deck-a','section-0-0');await engine.launch('deck-a','section-0-0','drums');await engine.play('deck-a',false);engine.commands.setMoveTogether!('deck-a',false);
    engine.move('deck-a','begin');engine.move('deck-a','move',4);engine.move('deck-a','commit');engine.beatJump('deck-a',1);
    const got=engine.readFrame().decks['deck-a'].sources!;expect(got.drums.seconds).toBe(3);expect(got.bass.seconds).toBe(.5);
  });
  it('beat jump leaves a Slip loop from its audible position and retains the region for Reloop',async()=>{
    const {engine,ctx,load}=setup();await load();engine.commands.setSlip!('deck-a',true);engine.commands.setLoopBeats!(1);engine.quickLoop('deck-a');await engine.play('deck-a',true);ctx.currentTime=2.1;
    expect(engine.readFrame().decks['deck-a'].sources!.drums.backgroundBeat).toBeGreaterThan(3);
    engine.beatJump('deck-a',1);ctx.currentTime=2.14;const got=engine.readFrame().decks['deck-a'].sources!.drums;
    expect(got.seconds).toBeCloseTo(.61);expect(got.backgroundBeat).toBeUndefined();expect(got.playing).toBe(true);expect(engine.snapshot().decks[0].loop).toMatchObject({start:0,end:.5,enabled:false});
    engine.setDeckLoopEnabled('deck-a',true);expect(engine.snapshot().decks[0].loop?.enabled).toBe(true);
  });
  it('initializes all volume controls at unity and reserves boost for trim',async()=>{
    const {engine,load}=setup();await load();const state=engine.snapshot();
    expect(state.master).toBe(100);expect(state.masterTrim).toBe(0);
    expect(state.decks.every(d=>d.gain===100 && d.trim===0 && d.stems.every(s=>s.level===100))).toBe(true);
    expect(levelGain(150)).toBe(1);
  });
  it('reports unavailable headphone routing instead of leaking cue into the master',async()=>{
    const {engine,load}=setup();await load();engine.commands.setDeck('deck-a','cue',true);expect(engine.snapshot().decks[0].cue).toBe(false);expect(engine.snapshot().decks[0].message).toContain('a second output pair');
  });
});
it('keeps unity at the fader rest and A/B/THRU at their conventional endpoints',()=>{
  expect(levelGain(100)).toBe(1);expect(levelGain(0)).toBe(0);
  expect([-100,0,100].map(x=>[routeGain(0,x),routeGain(1,x),routeGain(2,x)])).toEqual([[1,1,0],[1,1,1],[0,1,1]]);
});
