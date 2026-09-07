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
  connections:unknown[]=[]; connect(n:unknown){this.connections.push(n);return n;} disconnect(){this.connections=[];}
  start=vi.fn();stop=vi.fn();getFloatTimeDomainData(a:Float32Array){a.fill(.25);}
}
class Context {
  currentTime=0;sampleRate=48000;destination=new Node();sources:Node[]=[];
  createGain=()=>new Node();createBiquadFilter=()=>new Node();createAnalyser=()=>new Node();createDelay=()=>new Node();createOscillator=()=>new Node();
  createChannelMerger=()=>new Node();createChannelSplitter=()=>new Node();
  createBufferSource=()=>{const n=new Node();this.sources.push(n);return n;};resume=vi.fn(async()=>{});close=vi.fn(async()=>{});
}
const track:Track={id:'song',title:'Song',artist:'Artist',album:null,art:null,file:'song.wav',bpm:120,key:null,seconds:64,added:'',model:null,stems:'stems/song',sources:['drums','bass','other','vocals']};
const buffer={duration:64,sampleRate:48000,length:64*48000,numberOfChannels:2} as AudioBuffer;
function asset():DeckAsset {return {analysis:{grid:{bpm:120,offset:0},slices:[{bar:0,name:'Intro'},{bar:4,name:'Verse'}]} as DeckAsset['analysis'],peaks:[],audio:{map:evenBeats(48000,64*48000,120,0),buffers:Object.fromEntries(['full',...track.sources].map(id=>[id,buffer])),duration:64,overview:[]}};}
const engines:MixerEngine[]=[];
function setup(){const ctx=new Context(),engine=new MixerEngine(()=>ctx as unknown as AudioContext);engines.push(engine);return {ctx,engine,load:(id='deck-a')=>engine.load(id,track,async()=>asset())};}
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
afterEach(()=>{engines.splice(0).forEach(e=>e.dispose());stretching.prepare=null;vi.useRealTimers();});
describe('the four-deck playback owner',()=>{
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
    expect(next.sources[0].loopStart).toBe(8);
    expect(next.sources[0].start.mock.calls[0][1]).toBeCloseTo(9.97);
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
    await engine.load('deck-a',track,async()=>whole);
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
    expect(ctx.sources.at(-1)!.loopStart).toBeCloseTo(from); expect(ctx.sources.at(-1)!.loopEnd).toBeCloseTo(to);
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
    expect(ctx.sources.map(s=>[s.loopStart,s.loopEnd])).toEqual([[0,8],[8,64]]);
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
    const loop=ctx.sources.at(-1)!;expect(loop.loop).toBe(true);expect(loop.loopStart).toBeCloseTo(1.97);expect(loop.loopEnd).toBeCloseTo(3.97);
    engine.commands.setLoopEnabled(false);expect(ctx.sources.at(-1)!.loop).toBe(false);engine.commands.setLoopEnabled(true);expect(ctx.sources.at(-1)!.loopStart).toBeCloseTo(1.97);
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
    expect(ctx.sources.slice(-2).map(s=>s.loopStart)).toEqual([0,8]);expect(engine.snapshot().decks[0].stems[1].level).toBe(37);
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
    await engine.sync('deck-a',true);await engine.launch('deck-a','section-1-4','bass');expect(engine.snapshot().decks[0].stems[1].queued).toBeUndefined();
  });
  it('creates 16 beats, halves/doubles, moves, exits and reloops without changing the Cue',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.play('deck-a',true);ctx.currentTime=2.03;
    engine.commands.setDeckTiming!('deck-a','quantize',1);engine.quickLoop('deck-a');expect(engine.snapshot().decks[0].loop).toEqual({start:2,end:10,enabled:true});
    engine.editLoops('deck-a','resize',.5);expect(engine.snapshot().decks[0].loop?.end).toBe(6);engine.editLoops('deck-a','resize',2);expect(engine.snapshot().decks[0].loop?.end).toBe(10);
    engine.editLoops('deck-a','move',1);expect(engine.snapshot().decks[0].loop?.start).toBe(2.5);
    engine.setDeckLoopEnabled('deck-a',false);expect(engine.snapshot().decks[0].loop?.enabled).toBe(false);engine.setDeckLoopEnabled('deck-a',true);expect(ctx.sources.at(-1)!.loopStart).toBe(2.5);
    engine.cue('deck-a',true);expect(engine.readFrame().decks['deck-a'].seconds).toBe(0);
  });
  it('rejects invalid loop edits atomically and uses musical length on a variable map',async()=>{
    const {engine,ctx}=setup();const a=asset();a.audio!.map={rate:48000,length:64*48000,first:0,samples:[0,24000,48000,72000,96000,144000,192000,240000,288000]};
    await engine.load('deck-a',track,async()=>a);engine.commands.setDeckTiming!('deck-a','loopBeats',8);engine.quickLoop('deck-a');expect(engine.snapshot().decks[0].loop?.end).toBe(6);
    const before=engine.snapshot().decks[0].loop;engine.editLoops('deck-a','in',20);expect(engine.snapshot().decks[0].loop).toEqual(before);
  });
  it('returns Slip loops to each independent background position and ordinary loops to audible position',async()=>{
    const {engine,ctx,load}=setup();await load();await engine.launch('deck-a','section-0-0','drums');await engine.launch('deck-a','section-1-4','bass');engine.setDeckLoopEnabled('deck-a',false);
    ctx.currentTime=1;engine.commands.setSlip!('deck-a',true);engine.commands.setDeckTiming!('deck-a','loopBeats',1);engine.quickLoop('deck-a');
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
  it('initializes all volume controls at unity and reserves boost for trim',async()=>{
    const {engine,load}=setup();await load();const state=engine.snapshot();
    expect(state.master).toBe(100);expect(state.masterTrim).toBe(0);
    expect(state.decks.every(d=>d.gain===100 && d.trim===0 && d.stems.every(s=>s.level===100))).toBe(true);
    expect(levelGain(150)).toBe(1);
  });
  it('reports unavailable headphone routing instead of leaking cue into the master',async()=>{
    const {engine,load}=setup();await load();engine.commands.setDeck('deck-a','cue',true);expect(engine.snapshot().decks[0].cue).toBe(false);expect(engine.snapshot().decks[0].message).toContain('outputs 3/4');
  });
});
it('keeps unity at the fader rest and A/B/THRU at their conventional endpoints',()=>{
  expect(levelGain(100)).toBe(1);expect(levelGain(0)).toBe(0);
  expect([-100,0,100].map(x=>[routeGain(0,x),routeGain(1,x),routeGain(2,x)])).toEqual([[1,1,0],[1,1,1],[0,1,1]]);
});
