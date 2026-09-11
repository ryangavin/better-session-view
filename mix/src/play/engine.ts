import { createAudioContext } from '../audioSettings.ts';
import type { MixerCommands, MixerDeck, MixerFrame, MixerState, MixerWaveLane } from '@openflow/widgets/mixer/model.ts';
import type { Track } from '../openflow.ts';
import { beatAt, sampleOf } from '../warp.ts';
import type { Span } from '../schedule.ts';
import { LinkAudioSender, LINK_AUDIO_OFF } from '../linkAudio.ts';
import { linkBeatAt, type LinkTimeline } from '../linkTiming.ts';
import { DECK_IDS, emptyDeck, initialMixer, loadedDeck, loadDeckAsset, type DeckAudio } from './decks.ts';
import { DeckVoice } from './voice.ts';
import { MixerChannel, MixerEffect, levelGain, routeGain, smooth } from './graph.ts';
import { floorBeat, snapBeat, launchWait, LOOP_LENGTHS } from './timing.ts';
import { readEffectHighPass, saveEffectHighPass, highPassHz, highPassPosition, EFFECT_HIGH_PASS_PARAM, EFFECT_HIGH_PASS_HINT } from './effectHighPass.ts';
import { EFFECTS } from './effects.ts';
import { outputPairs, pairReach, readAudioSettings } from '../audioSettings.ts';

type Slot = { pending?: {selected:string;at:number}; revision: number; voice: DeckVoice; selected: string | null; span?: Span; enabled: boolean };
type Position = { at: number; enabled: boolean; selected: string | null; span?: Span };
type Checkpoint = Map<string, Position>;
type CueHold = { phase: 'set' | 'return' | 'audition'; latched: boolean };
type Background = {at:number;time:number;bpm:number|null};
type Move = { before: Checkpoint; delta: number; playing: Set<string>; time: number };
type Deck = { audio: DeckAudio; slots: Map<string, Slot>; channel: MixerChannel; sends: GainNode[]; phones: GainNode; cue: number; audition: boolean; backgrounds:Map<string,Background>;checkpoints: Map<string, Checkpoint>; holds: Map<string, CueHold>; move?: Move; initialized: boolean; page: number; operation: number };
type Loader = typeof loadDeckAsset;

/** One playback owner for all decks, sends, master, output routing and Link. No React. */
export class MixerEngine {
  private state: MixerState = { ...initialMixer(), effectHighPass: readEffectHighPass(), effectHighPassHint: EFFECT_HIGH_PASS_HINT, effectHighPassParam: EFFECT_HIGH_PASS_PARAM };
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private decks = new Map<string, Deck>();
  private requests = new Map<string, AbortController>();
  private master!: MixerChannel; private dry!: GainNode; private local!: GainNode; private phones!: GainNode; private phonesCue!: GainNode; private phonesMaster!: GainNode;
  private masterSends: GainNode[] = []; private effects: MixerEffect[] = [];
  private retiredEffects: {effect:MixerEffect;since:number}[]=[];
  private publisher: LinkAudioSender | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private anchor = { beat: 0, time: 0 };
  private disposed = false; private operation = 0;
  private loopStarts = new Map<string, number>(); private loopSpans = new Map<string, Span>();
  monitoring = true; phonesAvailable = false; problem: string | null = null;
  /** The pairs actually in use, after clamping the stored choice to the device. */
  mainPair = 0; cuePair: number | null = null;
  /**
   * Clamp the stored pairs to what this output can reach.
   *
   * A saved 13/14 on a machine now driving a laptop's two outputs has to land
   * somewhere, and silence is worse than the front pair. The cue is dropped
   * rather than moved: sharing a pair with the mix would put the pre-fader
   * signal into the room.
   */
  private outputPairsFor(outputs: number): { main: number; cue: number | null } {
    const pairs = outputPairs(outputs);
    if (!pairs.length) return { main: 0, cue: null };
    const held = readAudioSettings();
    const main = pairs.includes(held.mainPair) ? held.mainPair : 0;
    const cue = pairs.includes(held.cuePair) && held.cuePair !== main ? held.cuePair : null;
    return { main, cue };
  }
  private wasLinked = false;
  private phaseCorrectedAt = -Infinity;
  private playingOrder: string[] = [];
  private leader?: {id:string;source:string};
  private loopScheduled = new Map<string,number>();
  constructor(private contextFactory = () => createAudioContext()) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private publish(next: MixerState = this.state) { this.frameCache = null; if (this.disposed) return; this.state = next === this.state ? { ...next } : next; this.listeners.forEach(fn => fn()); }
  private patchDeck(id: string, patch: Partial<MixerDeck>) { this.publish({ ...this.state, decks: this.state.decks.map(d => d.id === id ? { ...d, ...patch } : d) }); }
  private model(id: string) { return this.state.decks.find(d => d.id === id)!; }
  get linkAudio() { return this.publisher?.state ?? LINK_AUDIO_OFF; }
  get position() { return this.beat() * 60 / this.state.bpm; }
  private audio(prepared?: AudioContext): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = this.ctx = prepared ?? this.contextFactory();
    this.master = new MixerChannel(ctx,true); this.dry = ctx.createGain(); this.dry.connect(this.master.input);
    this.local = ctx.createGain(); this.local.gain.value = this.monitoring ? 1 : 0; this.phones = ctx.createGain(); this.phonesCue=ctx.createGain();this.phonesMaster=ctx.createGain();this.phonesMaster.gain.value=0;this.phonesCue.connect(this.phones);this.master.output.connect(this.phonesMaster);this.phonesMaster.connect(this.phones);this.master.output.connect(this.local);
    /**
     * The mix and the cue go to the pairs the person chose, not to 1/2 and 3/4.
     *
     * A two-output interface has one pair and no cue; a sixteen-output one has
     * eight and no convention about which is the booth. So the destination is
     * opened wide enough to reach the further of the two chosen pairs and the
     * merger carries silence everywhere else, which is what lets a mix sit on
     * 13/14 while the cue sits on 11/12.
     */
    const outputs = ctx.destination.maxChannelCount;
    const chosen = this.outputPairsFor(outputs);
    this.mainPair = chosen.main; this.cuePair = chosen.cue;
    this.phonesAvailable = chosen.cue !== null;
    const reach = pairReach(Math.max(chosen.main, chosen.cue ?? chosen.main));
    if (reach > 2) {
      ctx.destination.channelCount = Math.min(outputs, reach);
      const merge = ctx.createChannelMerger(ctx.destination.channelCount);
      const feed = (node: AudioNode, pair: number) => { const split = ctx.createChannelSplitter(2); node.connect(split); split.connect(merge, 0, pair * 2); split.connect(merge, 1, pair * 2 + 1); };
      feed(this.local, chosen.main);
      if (chosen.cue !== null) feed(this.phones, chosen.cue);
      merge.connect(ctx.destination);
    } else this.local.connect(ctx.destination);
    this.masterSends = [ctx.createGain(), ctx.createGain()]; this.masterSends.forEach(send => {send.gain.value=0;this.dry.connect(send);});
    this.publisher = new LinkAudioSender(ctx, () => {
      const enabled = this.linkAudio.enabled;
      if (enabled !== this.wasLinked) { this.wasLinked = enabled; this.setMonitoring(!enabled); }
      this.publish();
    }, (timeline, changed) => this.linkClock(timeline, changed), () => this.state.bpm);
    this.apply(); this.publishOutputs();
    this.timer = setInterval(() => this.tick(), 40);
    this.publish({ ...this.state, playbackAvailable: true });
    return ctx;
  }
  private async resumeAudio() { const ctx=this.audio(); if(typeof OfflineAudioContext==='undefined' || !(ctx instanceof OfflineAudioContext)) await ctx.resume(); }
  /** Read-only audio output for metering/recording, including the dev render harness. */
  output(id: string): AudioNode | null { return id==='master' ? this.master?.output ?? null : id==='phones' ? this.phones ?? null : id==='fx-a' ? this.effects[0]?.output ?? null : id==='fx-b' ? this.effects[1]?.output ?? null : this.decks.get(id)?.channel.output ?? null; }
  get audioContext(): AudioContext | null { return this.ctx; }

  /** Audio preferences restart sound, retaining the complete deck configuration. */
  replaceAudioContext(context: AudioContext): void {
    const held = [...this.decks].map(([id,d]) => ({id,audio:d.audio,cue:d.cue,checkpoints:d.checkpoints,initialized:d.initialized,slots:[...d.slots].map(([name,s]) => ({name,at:s.voice.at(),enabled:s.enabled,selected:s.selected,span:s.span}))}));
    const models = this.state.decks;
    this.operation++; this.cancelLoads();
    this.anchor = {beat:this.beat(),time:context.currentTime};
    this.setLinkAudio(false); this.publisher?.dispose(); this.publisher=null;
    this.decks.forEach(d=>{d.operation++;d.slots.forEach(s=>s.voice.dispose());d.channel.dispose();d.sends.forEach(s=>s.disconnect());d.phones.disconnect();});
    this.decks.clear();this.retiredEffects.forEach(e=>e.effect.dispose());this.retiredEffects=[];this.effects.forEach(e=>e.dispose());this.effects=[];
    this.master?.dispose();this.masterSends.forEach(s=>s.disconnect());this.dry?.disconnect();this.local?.disconnect();this.phones?.disconnect();this.phonesCue?.disconnect();this.phonesMaster?.disconnect();
    if(this.timer)clearInterval(this.timer);
    const old=this.ctx;this.ctx=null;this.publish({...this.state,running:false});this.audio(context);
    for(const saved of held) {
      this.adopt(saved.id,saved.audio);const d=this.decks.get(saved.id)!;d.cue=saved.cue;d.checkpoints=saved.checkpoints;d.initialized=saved.initialized;
      for(const slot of saved.slots){const next=d.slots.get(slot.name)!;next.voice.seek(slot.at);next.enabled=slot.enabled;next.selected=slot.selected;next.span=slot.span;}
    }
    this.publish({...this.state,decks:models.map(d=>({...d,playing:false,cueHeld:false,fullQueued:undefined,status:d.status==='loading'?'unavailable':d.status,message:d.status==='loading'?'Audio settings changed during load. Drop the track again.':d.message,stems:d.stems.map(s=>({...s,queued:undefined}))}))});
    this.apply();this.publishOutputs();if(old)void old.close();
  }

  private publishOutputs() {
    if (!this.publisher) return;
    this.publisher.setInputs([...DECK_IDS.flatMap((id, i) => this.decks.has(id) ? [{ id, name: `Deck ${'ABCD'[i]}`, node: this.decks.get(id)!.channel.output }] : []), { id: 'master', name: 'Master', node: this.master.output }, { id: 'phones', name: 'Phones', node: this.phones }]);
  }
  private beat(when = this.ctx?.currentTime ?? 0) { return this.state.running ? this.anchor.beat + Math.max(0, when - this.anchor.time) * this.state.bpm / 60 : this.anchor.beat; }
  private startClock(when: number) { if (!this.state.running) { this.anchor = { beat: this.anchor.beat, time: when }; this.publish({ ...this.state, running: true }); } }
  /** Link owns tempo authority while enabled, so it has no local track leader. */
  get normalSpeedBpm(): number | null {
    const bpm = this.state.decks.find(deck => deck.syncLeader)?.track?.bpm;
    return !this.linkAudio.enabled && typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0 ? bpm : null;
  }
  normalSpeed = () => {
    this.refreshLeader();
    const bpm = this.normalSpeedBpm;
    if (bpm !== null) this.commands.setMaster('bpm', bpm);
  };
  private deckPlaying(id: string) { return this.target(id).some(([,slot]) => slot.enabled && slot.voice.playing); }
  /** Freeze only our idle clock: never reset positions, cancel Cue, or send Link Stop. */
  private stopIdleClock() {
    if (!this.state.running || this.linkAudio.enabled || [...this.decks.keys()].some(id => this.deckPlaying(id))) return;
    this.anchor = { beat: this.beat(), time: this.ctx?.currentTime ?? 0 };
    this.publish({ ...this.state, running: false, beat: Math.floor(this.anchor.beat) });
  }
  private lead() { return Math.max(0.03, ...[...this.decks.values()].flatMap(d => [...d.slots.values()].map(s => s.voice.lead))); }
  private error(error: unknown, id?: string) { const message = error instanceof Error ? error.message : String(error); if (id) this.patchDeck(id, { message }); else { this.problem = message; this.publish(); } }
  private run(task: Promise<unknown>, id?: string) { void task.catch(error => this.error(error, id)); }

  async load(id: string, track: Track, loader: Loader = loadDeckAsset): Promise<void> {
    if (!DECK_IDS.includes(id) || this.disposed) return;
    this.requests.get(id)?.abort(); this.remove(id);
    const request = new AbortController(); this.requests.set(id, request);
    // The channel belongs to the desk rather than to the record: a new track
    // arrives at the fader the last one left, and on a deck that is still
    // synced. Everything the track owns — sections, stems, grid — is fresh.
    const held = this.model(id), wasSynced = held.synced ?? false;
    const desk = { gain: held.gain, trim: held.trim, eq: [...held.eq], filter: held.filter, sendA: held.sendA, sendB: held.sendB, route: held.route, cue: held.cue };
    const fresh = emptyDeck(id, DECK_IDS.indexOf(id));
    this.patchDeck(id, { ...fresh, ...desk, track: { id: track.id, title: track.title, artist: track.artist ?? '', bpm: track.bpm, key: track.key ?? '—' }, status: 'loading', message: 'Loading audio…' });
    try {
      const asset = await (loader === loadDeckAsset
        ? loader(track, request.signal, this.audio(), message => { if (!request.signal.aborted) this.patchDeck(id, { message }); })
        : loader(track, request.signal));
      if (request.signal.aborted || this.disposed) return;
      if (asset.audio) this.adopt(id, asset.audio);
      this.startAtFirstBeat(id);
      const loaded = loadedDeck(fresh, track, asset);
      // Sync needs a grid to hold the deck to; a track without one cannot keep it.
      this.patchDeck(id, { ...loaded, ...desk, playing: false, synced: wasSynced && loaded.gridAvailable, cueHeld: false });

      this.apply();
    } catch (error) { if (!request.signal.aborted) this.patchDeck(id, { status: 'unavailable', message: error instanceof Error ? error.message : 'Could not load audio' }); }
    finally { if (this.requests.get(id) === request) this.requests.delete(id); }
  }
  /**
   * A freshly loaded track sits on its first beat, with the cue point there.
   *
   * Files start a moment before the count does. Leaving the deck at zero puts
   * that silence under the first press and under every return to the cue, so
   * the head goes to beat one and the checkpoints the cue restores are seeded
   * from it.
   */
  private startAtFirstBeat(id: string) {
    const d = this.decks.get(id); if (!d?.audio.map) return;
    const at = sampleOf(d.audio.map, d.audio.map.first) / d.audio.map.rate;
    if (at <= 0) return;
    d.slots.forEach(slot => slot.voice.seek(at));
    const point = (names: string[]): Checkpoint => new Map(names.map(name => [name, { at, enabled: true, selected: null }]));
    const stems = [...d.slots.keys()].filter(name => name !== 'full');
    if (stems.length) d.checkpoints.set('deck', point(stems));
    if (d.slots.has('full')) d.checkpoints.set('full', point(['full']));
  }
  private adopt(id: string, audio: DeckAudio) {
    const ctx = this.audio(), channel = new MixerChannel(ctx,true), sends = [ctx.createGain(), ctx.createGain()], phones = ctx.createGain();
    sends.forEach(send=>send.gain.value=0);phones.gain.value=0;
    channel.output.connect(this.dry); sends.forEach(send => channel.output.connect(send)); channel.pre.connect(phones); phones.connect(this.phonesCue);
    const slots = new Map<string, Slot>();
    for (const [name, buffer] of Object.entries(audio.buffers)) { const voice = new DeckVoice(ctx, buffer, audio.map); voice.output.connect(channel.input); slots.set(name, { revision: 0, voice, enabled: false, selected: null }); }
    this.decks.set(id, { audio, slots, channel, sends, phones, cue: 0, audition: false, backgrounds:new Map(),checkpoints: new Map(), holds: new Map(), initialized: false, page: 0, operation: 0 });
    this.effects.forEach((fx, i) => sends[i].connect(fx.input)); this.publishOutputs();
  }
  private remove(id: string) {
    const deck = this.decks.get(id); if (!deck) return;
    deck.operation++; deck.slots.forEach(slot => slot.voice.dispose()); deck.channel.dispose(); deck.sends.forEach(s => s.disconnect()); deck.phones.disconnect(); this.decks.delete(id);
    this.clearLoop(id);
    this.publishOutputs();
    this.stopIdleClock();
  }
  private chosen(deck: Deck, model: MixerDeck) { return [...deck.slots].filter(([id]) => model.full ? id === 'full' : id !== 'full'); }
  private span(deck: Deck, model: MixerDeck, section: string): Span | undefined {
    if (section === 'full-track') return undefined;
    const match = /^section-\d+-(.+)$/.exec(section), i = model.sections.findIndex(s => s.id === section);
    if (!match || !deck.audio.map) return undefined;
    const next = /^section-\d+-(.+)$/.exec(model.sections[i + 1]?.id ?? '');
    const from = Math.max(0, sampleOf(deck.audio.map, Number(match[1]) * 4) / deck.audio.map.rate);
    const to = Math.min(deck.audio.duration, next ? sampleOf(deck.audio.map, Number(next[1]) * 4) / deck.audio.map.rate : deck.audio.duration);
    return to > from + 0.01 ? { from, to } : undefined;
  }
  private startSlot(id: string, name: string, slot: Slot, at: number, when: number) {
    const model = this.model(id), span = slot.span;
    const d=this.decks.get(id)!;
    if(span && model.slip && !d.backgrounds.has(name))d.backgrounds.set(name,{at:slot.voice.at(when),time:when,bpm:model.synced?this.state.bpm:null});
    slot.voice.start(at, when, model.synced ? this.state.bpm : null, span, !!span); slot.enabled = true;
  }
  private target(id: string, stem?: string): [string, Slot][] {
    const d = this.decks.get(id)!;
    return this.chosen(d, this.model(id)).filter(([name]) => !stem || name === stem);
  }
  private capture(slots: [string, Slot][], when = this.ctx!.currentTime): Checkpoint {
    return new Map(slots.map(([name,s]) => [name,{at:s.voice.at(when),enabled:s.enabled,selected:s.selected,span:s.span && {...s.span}}]));
  }
  private restore(id: string, checkpoint: Checkpoint) {
    const d = this.decks.get(id)!;
    for (const [name,p] of checkpoint) {
      const s = d.slots.get(name)!; s.revision++; s.pending=undefined;
      d.backgrounds.delete(name);this.loopStarts.delete(`${id}/${name}`);s.voice.seek(p.at); s.enabled=p.enabled; s.selected=p.selected; s.span=p.span && {...p.span};
    }
    d.initialized=true; this.loopState(id); this.selection(id);
  }
  private checkpoint(id: string, stem?: string): Checkpoint {
    const d=this.decks.get(id)!, key=stem ?? (this.model(id).full ? 'full' : 'deck');
    let point=d.checkpoints.get(key);
    if (!point) { point=new Map(this.target(id,stem).map(([name])=>[name,{at:0,enabled:true,selected:null}])); d.checkpoints.set(key,point); }
    return point;
  }
  async play(id: string, on: boolean, when?: number, audition = false, stem?: string): Promise<void> {
    const d=this.decks.get(id); if(!d || d.move) return;
    const key=stem ?? (this.model(id).full ? 'full' : 'deck'), hold=d.holds.get(key);
    if (on && hold?.phase==='audition' && !audition) {
      if(hold.latched)return;
      hold.latched=true;
      const start=this.ctx!.currentTime+this.lead(),playing=this.target(id,stem).filter(([,s])=>s.voice.playing);
      const anchor=playing.find(([name])=>name===this.model(id).focus) ?? playing[0];
      // Audition is immediate/off-beat; pressing Play is the alignment point.
      if(anchor){const correction=this.playCorrection(id,this.beatOf(id,anchor[1].voice.at(start)),start);
        if(correction)for(const [name,s] of playing)this.startSlot(id,name,s,this.secondsOf(id,this.beatOf(id,s.voice.at(start))+correction),start);
      }
      this.selection(id);return;
    }
    const operation=d.operation, chosen=this.target(id,stem);
    if (!audition) { d.holds.delete(key); if(!stem) d.holds.clear(); }
    const revisions=new Map(chosen.map(([,s])=>[s,++s.revision]));
    if(!on) { chosen.forEach(([name,s])=>{d.backgrounds.delete(name);s.pending=undefined;s.voice.pause();}); this.selection(id); return; }
    await this.resumeAudio();
    if(this.model(id).synced) await Promise.all(chosen.map(([,s])=>s.voice.prepare()));
    if(this.disposed || d.operation!==operation || this.decks.get(id)!==d) return;
    const start=Math.max(when ?? 0,this.ctx!.currentTime+this.lead());
    const eligible=chosen.filter(([,s])=>s.revision===revisions.get(s) && (s.enabled || !!stem || !d.initialized));
    if(!eligible.length) return;
    // A finished source can be explicitly started again; a paused source keeps its position.
    for (const [,slot] of eligible) if (slot.voice.at() >= slot.voice.buffer.duration - .001)
      slot.voice.seek(d.audio.map ? sampleOf(d.audio.map, d.audio.map.first) / d.audio.map.rate : 0);
    this.startClock(start);
    this.refreshLeader();
    const anchor=eligible.find(([name])=>name===this.model(id).focus) ?? eligible[0];
    if(!this.linkAudio.enabled && !this.leader){const b=this.beatOf(id,anchor[1].voice.at()),duration=this.secondsOf(id,Math.floor(b)+1)-this.secondsOf(id,Math.floor(b));if(duration>0)this.tempo(60/duration,false);}
    const correction=!audition || hold?.latched ? this.playCorrection(id,this.beatOf(id,anchor[1].voice.at()),start) : 0;
    for(const [name,s] of eligible) this.startSlot(id,name,s,this.secondsOf(id,this.beatOf(id,s.voice.at())+correction),start);
    d.initialized=true; this.selection(id); this.apply();
  }
  private playCorrection(id:string,beat:number,when:number) {
    return this.model(id).synced && (this.linkAudio.enabled || this.leader && this.leader.id!==id)
      ? ((this.syncBeat(when)-beat+.5)%1+1)%1-.5 : 0;
  }
  cue(id: string, held: boolean, stem?: string) {
    const d=this.decks.get(id); if(!d || d.move) return;
    const key=stem ?? (this.model(id).full ? 'full' : 'deck');
    if(!held) {
      const hold=d.holds.get(key); if(!hold) return;
      if(!hold.latched) this.restore(id,this.checkpoint(id,stem));
      d.holds.delete(key); this.selection(id); return;
    }
    if(d.holds.has(key)) return;
    const slots=this.target(id,stem), point=this.checkpoint(id,stem);
    if(slots.some(([,s])=>s.voice.playing)) {
      this.restore(id,point); d.holds.set(key,{phase:'return',latched:false});
    } else {
      const current=this.capture(slots);
      const changed=[...current].some(([name,p])=>{const c=point.get(name);return !c || Math.abs(c.at-p.at)>1/this.ctx!.sampleRate || d.initialized && (p.enabled!==c.enabled || p.selected!==c.selected || JSON.stringify(p.span)!==JSON.stringify(c.span));});
      if(changed) {
        if(!d.initialized) current.forEach(p=>p.enabled=true);
        this.snapCheckpoint(id,current);
        d.checkpoints.set(key,current); d.holds.set(key,{phase:'set',latched:false});
      } else {
        this.restore(id,point); d.holds.set(key,{phase:'audition',latched:false});
        this.run(this.play(id,true,undefined,true,stem),id);
      }
    }
    this.selection(id);
  }
  /** The beat division markers answer to: Q when set, and a whole beat while synced. */
  private division(id:string) { return this.state.quantize || (this.model(id).synced && this.decks.get(id)?.audio.map ? 1 : 0); }
  /** A nudge never lands off the division, and never rounds away to no move at all. */
  private nudge(id:string, beat:number, amount:number) {
    const q=this.division(id); if(!q) return beat+amount;
    const moved=snapBeat(beat+amount,q);
    return moved===snapBeat(beat,q) ? snapBeat(beat,q)+Math.sign(amount)*q : moved;
  }
  private snapCheckpoint(id:string, point:Checkpoint, edge:'nearest'|'before'='nearest') {
    const d=this.decks.get(id)!;const q=this.division(id);if(!q)return;
    const focused=point.get(this.focused(id)?.[0] ?? '');const anchor=focused?.enabled?focused:[...point.values()].find(p=>p.enabled) ?? focused ?? [...point.values()][0];
    if(!anchor)return;
    const beat=this.beatOf(id,anchor.at);let delta=(edge==='before'?floorBeat(beat,q):snapBeat(beat,q))-beat;
    let low=-Infinity,high=Infinity;for(const p of point.values())if(p.enabled){low=Math.max(low,this.beatOf(id,0)-this.beatOf(id,p.at));high=Math.min(high,this.beatOf(id,d.audio.duration)-this.beatOf(id,p.at));}
    delta=Math.max(low,Math.min(high,delta));point.forEach(p=>{if(p.enabled)p.at=this.secondsOf(id,this.beatOf(id,p.at)+delta);});
  }
  private beatOf(id: string, seconds: number) { const d=this.decks.get(id)!; return d.audio.map ? beatAt(d.audio.map,seconds*d.audio.map.rate) : seconds*(this.model(id).track?.bpm ?? 120)/60; }
  private secondsOf(id: string, beat: number) { const d=this.decks.get(id)!; return d.audio.map ? sampleOf(d.audio.map,beat)/d.audio.map.rate : beat*60/(this.model(id).track?.bpm ?? 120); }
  private focused(id: string): [string, Slot] | undefined { const m=this.model(id); return this.target(id).find(([name])=>name===(m.full?'full':m.focus)) ?? this.target(id).find(([,s])=>s.enabled) ?? this.target(id)[0]; }
  move(id: string, phase: 'begin'|'move'|'commit'|'cancel', delta=0) {
    const d=this.decks.get(id); if(!d) return;
    if(phase==='begin') {
      const slots=this.model(id).moveTogether ? this.target(id).filter(([,s])=>s.enabled || !d.initialized) : [this.focused(id)!].filter(Boolean);
      if(!slots.length || d.move) return;
      if(d.holds.size) return;
      d.move={before:this.capture(slots),delta:0,playing:new Set(slots.filter(([,s])=>s.voice.playing).map(([name])=>name)),time:this.ctx!.currentTime};
      slots.forEach(([,s])=>{s.revision++;s.pending=undefined;});
    } else if(d.move) {
      const {before,playing,time}=d.move, when=this.ctx!.currentTime+this.lead();
      if(phase==='cancel') {
        before.forEach((p,name)=>{const s=d.slots.get(name)!;d.backgrounds.delete(name);s.span=p.span && {...p.span};s.selected=p.selected;s.enabled=p.enabled;
          if(playing.has(name))this.startSlot(id,name,s,p.at,when);else s.voice.seek(p.at);});
        d.move=undefined;
      }
      else if(phase==='commit') { d.move=undefined; this.phaseCorrectedAt=-Infinity; }
      else if(Number.isFinite(delta)) {
        let low=-Infinity,high=Infinity;
        const positions=new Map([...before].map(([name,p])=>[name,playing.has(name)?(this.model(id).synced?this.beatOf(id,p.at)+(when-time)*this.state.bpm/60:this.beatOf(id,p.at+when-time)):this.beatOf(id,p.at)]));
        before.forEach((p,name)=>{const at=positions.get(name)!;low=Math.max(low,this.beatOf(id,0)-at);high=Math.min(high,this.beatOf(id,d.slots.get(name)!.voice.buffer.duration-(playing.has(name)?.002:0))-at);});
        delta=Math.max(low,Math.min(high,delta));d.move.delta=delta;
        before.forEach((p,name)=>{const s=d.slots.get(name)!;if(s.span)this.loopSpans.set(`${id}/${name}`,s.span);s.span=undefined;s.selected=null;d.backgrounds.delete(name);this.loopStarts.delete(`${id}/${name}`);
          const at=this.secondsOf(id,positions.get(name)!+delta);if(playing.has(name))this.startSlot(id,name,s,at,when);else s.voice.seek(at);});
      }
      this.loopState(id); this.selection(id);
    }
    this.publish(); this.tick();
  }
  beatJump(id:string, delta:number) {
    const d=this.decks.get(id);if(!d || ![-1,1].includes(delta) || d.move || d.holds.size)return;
    if(!d.audio.map){this.error('Beat jump needs a saved beat grid.',id);return;}
    const when=this.ctx!.currentTime+this.lead();
    const targets=this.target(id).filter(([,s])=>s.enabled || !d.initialized).map(([name,s])=>({name,s,playing:s.voice.playing,at:this.secondsOf(id,this.beatOf(id,s.voice.at(when))+delta)}));
    if(!targets.length)return;
    // Reject the whole jump at a file edge: never shorten one stem's step or wrap it to zero.
    if(targets.some(({s,at})=>at<0 || at>=s.voice.buffer.duration-.001)){this.error('Beat jump would cross an active source’s audio boundary.',id);return;}
    for(const {name,s,playing,at} of targets){
      s.revision++;s.pending=undefined;this.loopStarts.delete(`${id}/${name}`);d.backgrounds.delete(name);
      if(s.span)this.loopSpans.set(`${id}/${name}`,{...s.span});s.span=undefined;s.selected=null;
      if(playing)this.startSlot(id,name,s,at,when);else s.voice.seek(at);
    }
    this.loopState(id);this.selection(id);this.patchDeck(id,{message:undefined});this.tick();
  }
  async sync(id: string, on: boolean) {
    const d = this.decks.get(id); if (!d) return;
    const op = ++d.operation;
    if (on) { this.patchDeck(id, { message: 'Preparing Sync…' }); await Promise.all([...d.slots.values()].map(s => s.voice.prepare())); }
    if (this.disposed || this.decks.get(id) !== d || op !== d.operation) return;
    this.patchDeck(id, { synced: on, message: undefined });
    const when = this.ctx!.currentTime + this.lead();
    const playing=this.target(id).filter(([,s])=>s.voice.playing);
    const anchor=playing.find(([name])=>name===this.focused(id)?.[0]) ?? playing[0];
    let delta=0;
    if(on && d.audio.map && anchor && (this.linkAudio.enabled || this.leader?.id!==id)){const beat=this.beatOf(id,anchor[1].voice.at(when)),target=this.syncBeat(when);delta=((target-beat+.5)%1+1)%1-.5;}
    for(const [name,s] of playing){const bg=d.backgrounds.get(name);if(bg){bg.at=this.backgroundAt(id,bg,when);bg.time=when;bg.bpm=on?this.state.bpm:null;}
      this.startSlot(id,name,s,this.secondsOf(id,this.beatOf(id,s.voice.at(when))+delta),when);
    }
    if(on){const spans=new Map(this.target(id).flatMap(([name,s])=>s.span?[[name,s.span] as const]:[]));if(spans.size)this.installLoops(id,spans,true);}
  }
  async launch(id: string, section: string | null, stemId?: string) {
    const d = this.decks.get(id); if (!d || d.move) return;
    // Reaching for one stem is the request to hear stems: a deck plays the
    // original until a stem clip asks otherwise, and then only that stem.
    if (stemId && this.model(id).full) this.source(id, false);
    const model = this.model(id); if (section !== null && !model.sections.some(s => s.id === section)) return;
    const chosen = this.chosen(d, model).filter(([name]) => !stemId || name === stemId);
    for(const key of d.holds.keys())if(!stemId || key==='deck' || key===stemId || key==='full')d.holds.delete(key);
    if (section === null) {
      if (!stemId) d.operation++;
      for (const [,s] of chosen) { s.revision++; s.pending = undefined; s.voice.pause(); s.enabled = false; s.selected = null; }
      this.selection(id); return;
    }
    const op = d.operation;
    const revisions = new Map(chosen.map(([,s]) => [s, ++s.revision]));
    await this.resumeAudio();
    if (model.synced) await Promise.all(chosen.map(([,s]) => s.voice.prepare()));
    if (d.operation !== op || this.disposed || this.decks.get(id) !== d) return;
    let when = this.ctx!.currentTime + this.lead();
    if (this.state.running) when += launchWait(this.syncBeat(when), model.synced?4:this.state.launchBeats) * 60 / this.state.bpm;
    this.startClock(when);
    const bounds = this.span(d, model, section);
    this.patchDeck(id,stemId ? {independentStems:true} : {independentStems:false,moveTogether:true});
    // Section names are hot cues. Only individual stem pads install a repeating span.
    if (!stemId) {
      this.clearLoop(id);
      d.slots.forEach(s => { s.span = undefined; });
    }
    for (const [name,s] of chosen) {
      if (s.revision !== revisions.get(s)) continue;
      s.span = stemId ? bounds ?? (section === 'full-track' ? {from:0,to:d.audio.duration} : undefined) : undefined;
      if (s.span) this.loopSpans.set(`${id}/${name}`, s.span);
      if (when > this.ctx!.currentTime + 0.08) s.pending = {selected:section,at:when};
      else { s.selected = section; s.pending = undefined; }
      this.startSlot(id, name, s, bounds?.from ?? 0, when);
    }
    d.initialized=true; this.loopState(id);
    this.selection(id); this.apply();
  }
  private refreshLeader() {
    const live=(id:string)=>this.decks.has(id) && !!this.decks.get(id)!.audio.map && this.target(id).some(([,s])=>s.enabled && s.voice.playing);
    this.playingOrder=this.playingOrder.filter(live);
    for(const [id] of this.decks)if(live(id) && !this.playingOrder.includes(id))this.playingOrder.push(id);
    const id=this.playingOrder[0];
    if(!id)this.leader=undefined;
    else if(this.leader?.id!==id || !this.decks.get(id)?.slots.get(this.leader.source)?.voice.playing){
      const source=this.target(id).find(([name,s])=>name===this.model(id).focus && s.voice.playing) ?? this.target(id).find(([,s])=>s.voice.playing);
      this.leader=source?{id,source:source[0]}:undefined;
    }
    const leader=this.linkAudio.enabled?undefined:this.leader?.id;
    if(this.state.decks.some(d=>!!d.syncLeader!==(d.id===leader)))this.publish({...this.state,decks:this.state.decks.map(d=>({...d,syncLeader:d.id===leader}))});
  }
  private syncBeat(when:number) {
    if(!this.linkAudio.enabled && this.leader){const s=this.decks.get(this.leader.id)?.slots.get(this.leader.source);if(s?.voice.playing)return this.beatOf(this.leader.id,s.voice.at(when));}
    return this.beat(when);
  }
  private maintainSync() {
    if(!this.ctx || this.linkAudio.enabled)return;
    this.refreshLeader();if(!this.leader)return;
    const now=this.ctx.currentTime;if(now-this.phaseCorrectedAt<.25)return;
    this.phaseCorrectedAt=now;
    const leader=this.leader, slot=this.decks.get(leader.id)!.slots.get(leader.source)!;
    if(!this.model(leader.id).synced){const b=this.beatOf(leader.id,slot.voice.at()),duration=this.secondsOf(leader.id,Math.floor(b)+1)-this.secondsOf(leader.id,Math.floor(b));
      if(duration>0 && Math.abs(60/duration-this.state.bpm)>.01)this.tempo(60/duration,false);}
    const when=now+this.lead(),target=this.syncBeat(when);
    for(const [id,d] of this.decks){
      if(id===leader.id || !this.model(id).synced || d.move || d.holds.size || (this.loopScheduled.get(id) ?? 0)>now)continue;
      const playing=this.target(id).filter(([,s])=>s.voice.playing);if(playing.some(([,s])=>s.pending))continue;
      const anchor=playing.find(([name])=>name===this.model(id).focus) ?? playing[0];if(!anchor)continue;
      const correction=((target-this.beatOf(id,anchor[1].voice.at(when))+.5)%1+1)%1-.5;
      if(Math.abs(correction)>.025)for(const [name,s] of playing)this.startSlot(id,name,s,this.secondsOf(id,this.beatOf(id,s.voice.at(when))+correction),when);
    }
  }
  private loopWhen(id:string) {
    let when=this.ctx!.currentTime+this.lead();
    if(this.model(id).synced && this.target(id).some(([,s])=>s.voice.playing))when+=launchWait(this.syncBeat(when),4)*60/this.state.bpm;
    return when;
  }
  private selection(id: string) {
    const d = this.decks.get(id)!;
    this.patchDeck(id, { fullSection: d.slots.get('full')?.selected ?? null, fullQueued:d.slots.get('full')?.pending?.selected, cueHeld: d.holds.has(this.model(id).full ? 'full' : 'deck'), stems: this.model(id).stems.map(s => ({ ...s, playing: d.slots.get(s.id)?.voice.playing ?? false, cueHeld: d.holds.has(s.id), selected: d.slots.get(s.id)?.selected ?? null, queued: d.slots.get(s.id)?.pending?.selected })), playing: this.deckPlaying(id) });
    this.refreshLeader();
    this.stopIdleClock();
  }
  /**
   * Swap which source the deck is listening to, without stopping either.
   *
   * `apply` already gates every voice's output by the mode, so the switch is a
   * gain ramp rather than a transport event. What the outgoing side must not do
   * is pause: pausing it and running `play` again left a gap and rescheduled
   * every source, which is what made the swap audible. The incoming side is
   * started from where the outgoing one is, so the two agree at the moment the
   * gains cross.
   */
  private source(id: string, full: boolean) {
    const d=this.decks.get(id);if(!d)return;
    const previous=this.model(id);if(previous.full===full)return;
    if (!full && ![...d.slots].some(([name, slot]) => name !== 'full' && slot.voice.buffer.duration > 0)) return;
    const playing=!!previous.playing, at=this.focused(id)?.[1].voice.at() ?? 0;
    d.operation++;d.holds.clear();d.move=undefined;d.backgrounds.clear();
    d.slots.forEach(s=>{s.pending=undefined;});
    if(full)d.slots.get('full')!.enabled=true;
    this.patchDeck(id,{full});
    const when=this.ctx?this.ctx.currentTime+this.lead():0;
    const arriving=this.target(id);
    // Nothing in the group has ever been asked for — a deck that opened on the
    // original and is being switched to its stems for the first time — so the
    // whole group starts. Where some of it is already enabled, the ones stopped
    // on purpose stay stopped.
    const first=!arriving.some(([,slot])=>slot.enabled);
    for(const [name,slot] of arriving){
      if(!(slot.enabled || first || !d.initialized))continue;
      // Started even when it is already running: the idle group has been playing
      // on under the ramp and has drifted from what was heard, so the swap has to
      // bring it to the audible position rather than adopt its own.
      if(playing)this.startSlot(id,name,slot,at,when);
      else slot.voice.seek(at);
    }
    this.loopState(id);this.selection(id);this.apply(playing?when:undefined);
  }
  /**
   * Push the desk down to the graph, optionally at a time still to come.
   *
   * A source swap crossfades one group into another, and the arriving group
   * cannot start until `lead` seconds from now. Ramping at the current time
   * emptied the outgoing side tens of milliseconds before anything replaced it,
   * which is the hole the swap made; scheduled at the same instant the arriving
   * audio starts, the two are the same recording at the same position and the
   * crossing is inaudible.
   */
  private apply(at?: number) {
    if (!this.ctx) return;
    const s = this.state, now = at ?? this.ctx.currentTime;
    [s.fxA, s.fxB].forEach((id, i) => {
      if (this.effects[i]?.kind !== id) {
        if(this.effects[i])this.retiredEffects.push({effect:this.effects[i],since:now}); const fx = this.effects[i] = new MixerEffect(this.ctx!, id);
        this.masterSends[i].disconnect(); this.masterSends[i].connect(fx.input);
        this.decks.forEach(d => { d.sends[i].disconnect(); d.sends[i].connect(fx.input); }); fx.output.connect(this.master.input);
      }
      const slot = i === 0 ? 'A' : 'B';
      const defaults = Object.fromEntries(EFFECTS.find(e => e.id === id)?.controls?.map(c => [c.id, c.param.defaultValue]) ?? []);
      this.effects[i].setHighPass(highPassHz(s.effectHighPass?.[slot] ?? 0));
      this.effects[i].apply({ ...defaults, ...s.effectValues?.[slot]?.[id] }, s.bpm);
    });
    smooth(this.phones.gain,(s.phonesLevel ?? 100)/100,now);
    smooth(this.phonesCue.gain,1-(s.phonesMix ?? 0)/100,now);
    smooth(this.phonesMaster.gain,(s.phonesMix ?? 0)/100,now);
    const gate=(i:number)=>(s.effectsEnabled===false || s.effectEnabled?.[i?'B':'A']===false)?0:1;
    this.master.apply(s.masterTrim, s.masterEq, s.masterFilter, levelGain(s.master));
    this.masterSends.forEach((send,i) => smooth(send.gain, (i ? s.masterSendB : s.masterSendA) / 100 * gate(i), now));
    this.decks.forEach((d,id) => {
      const m = this.model(id);
      d.channel.apply(m.trim, m.eq, m.filter, levelGain(m.gain) * routeGain(m.route, s.cross));
      d.sends.forEach((send,i) => smooth(send.gain, (i ? m.sendB : m.sendA) / 100 * gate(i), now));
      smooth(d.phones.gain, m.cue ? 1 : 0, now);
      d.slots.forEach((slot,name) => smooth(slot.voice.output.gain, name === 'full' ? (m.full ? 1 : 0) : m.full ? 0 : (m.stems.find(stem => stem.id === name)?.level ?? 0) / 100, now));
    });
  }
  private tempoRequest = 0;
  private async adjustTempo(bpm: number) {
    if (!Number.isFinite(bpm)) return;
    const request=++this.tempoRequest;
    this.refreshLeader();
    const leader=this.leader?.id;
    if (!this.linkAudio.enabled && leader && !this.model(leader).synced) {
      await this.sync(leader,true);
      if(request!==this.tempoRequest || this.leader?.id!==leader || !this.model(leader).synced)return;
    }
    this.tempo(bpm);
  }
  private tempo(bpm: number, announce = true) {
    if (!Number.isFinite(bpm)) return; bpm = Math.max(20, Math.min(999, bpm));
    if (announce && this.linkAudio.enabled) { this.publisher!.setTempo(bpm); return; }
    if (bpm === this.state.bpm) return;
    const when = (this.ctx?.currentTime ?? 0) + this.lead(), positions = [...this.decks].flatMap(([id,d]) => [...d.slots].filter(([,s]) => s.voice.playing).map(([name,s]) => ({id,name,s,at:s.voice.at(when)})));
    this.decks.forEach((d,id)=>d.backgrounds.forEach(bg=>{if(bg.bpm!==null){bg.at=this.backgroundAt(id,bg,when);bg.time=when;bg.bpm=bpm;}}));
    this.anchor = { beat: this.beat(when), time: when }; this.publish({ ...this.state, bpm });
    positions.forEach(({id,name,s,at}) => { if (this.model(id).synced) this.startSlot(id,name,s,at,when); }); this.apply();
  }
  async running(on: boolean, announce = true) {
    const op = ++this.operation;
    if (!on) { this.anchor = { beat: this.beat(), time: this.ctx?.currentTime ?? 0 }; this.decks.forEach((_,id) => { this.run(this.play(id,false),id); }); this.publish({ ...this.state, running: false }); if (announce && this.linkAudio.enabled) this.publisher?.stop(); return; }
    if (!this.decks.size) return;
    await this.resumeAudio();
    // Prepare every synced voice before choosing a shared start sample.
    const ready = [...this.decks].map(([id, d]) => ({ id, d, operation: d.operation }));
    await Promise.all(ready.flatMap(({ id, d }) => this.model(id).synced ? this.chosen(d, this.model(id)).map(([, s]) => s.voice.prepare()) : []));
    if (op !== this.operation || this.disposed) return;
    let when = this.ctx!.currentTime + this.lead() + 0.02;
    if (this.linkAudio.enabled) {
      const timeline = await this.publisher!.plan(this.anchor.beat, when + 0.1, announce);
      if (!timeline) throw new Error('Link is still connecting');
      when = timeline.contextTime + (timeline.startMicros - timeline.micros) / 1e6;
      if (when < this.ctx!.currentTime + this.lead()) throw new Error('Link start arrived late. Press Play to retry.');
    }
    if (op !== this.operation || this.disposed) return;
    await Promise.all(ready.filter(({id,d,operation}) => this.decks.get(id) === d && d.operation === operation).map(({id}) => this.play(id,true,when)));
  }
  stop() {
    this.operation++; this.decks.forEach((d,id) => { d.operation++; d.slots.forEach(s => { s.voice.seek(0); s.enabled = false; s.selected = null; s.pending = undefined; s.span = undefined; }); d.audition = false; d.holds.clear(); d.backgrounds.clear(); d.move=undefined; d.initialized=false; this.clearLoop(id); this.patchDeck(id,{cueHeld:false}); this.selection(id); });
    this.anchor = { beat: 0, time: this.ctx?.currentTime ?? 0 }; this.loopSpans.clear(); this.loopStarts.clear();
    this.publish({ ...this.state, running: false, beat: 0, loop: {start:null,end:null,enabled:false}, canLoopOut:false }); if (this.linkAudio.enabled) this.publisher?.stop();
  }
  private clearLoop(id: string) {
    this.loopScheduled.delete(id);
    for (const map of [this.loopStarts, this.loopSpans]) for (const key of map.keys()) if (key.startsWith(`${id}/`)) map.delete(key);
    this.patchDeck(id, { loop: { start: null, end: null, enabled: false }, canLoopOut: false });
  }
  private backgroundAt(id:string, background:Background, when:number):number {
    const elapsed=Math.max(0,when-background.time),at=background.bpm===null ? background.at+elapsed : this.secondsOf(id,this.beatOf(id,background.at)+elapsed*background.bpm/60);
    return Math.max(0,Math.min(this.decks.get(id)!.audio.duration,at));
  }
  private loopTargets(id:string):[string,Slot][] {
    const d=this.decks.get(id)!;
    return this.model(id).loopFocus ? [this.focused(id)!].filter(Boolean) : this.target(id).filter(([,s])=>s.enabled || !d.initialized);
  }
  private loopState(id: string) {
    if(!this.decks.has(id))return;
    const slots=this.loopTargets(id), active=slots.find(([,s])=>s.span);
    const saved=active?.[1].span ?? slots.map(([name])=>this.loopSpans.get(`${id}/${name}`)).find(Boolean);
    const pending=slots.map(([name])=>this.loopStarts.get(`${id}/${name}`)).find(v=>v!==undefined);
    this.patchDeck(id,{loop:{start:pending ?? saved?.from ?? null,end:pending!==undefined?null:saved?.to ?? null,enabled:!!active},canLoopOut:pending!==undefined});
  }
  deckLoopIn(id: string) {
    const d=this.decks.get(id);if(!d || d.move)return;
    const slots=this.loopTargets(id);if(!slots.length)return;
    const point=this.capture(slots);if(!d.initialized)point.forEach(p=>p.enabled=true);this.snapCheckpoint(id,point);
    // Pressed inside a running loop, In is the head of that loop rather than the
    // start of a new one. It is the fine end of the same gesture halving is the
    // coarse end of, so the loop keeps playing and only its front moves.
    if(slots.some(([,s])=>s.span)) { this.reshape(id,slots,point,'from'); return; }
    // In also replaces the corresponding temporary Cue, preserving the combination.
    const key=this.model(id).loopFocus ? this.focused(id)![0] : this.model(id).full?'full':'deck';
    d.checkpoints.set(key,point);
    const when=this.ctx!.currentTime+this.lead();
    for(const [name,s] of slots){d.backgrounds.delete(name);s.revision++;s.pending=undefined;this.loopSpans.delete(`${id}/${name}`);this.loopStarts.set(`${id}/${name}`,point.get(name)!.at);const at=s.voice.at(when);s.span=undefined;if(s.voice.playing)this.startSlot(id,name,s,at,when);}
    this.loopState(id);this.selection(id);
  }
  deckLoopOut(id: string) {
    const d=this.decks.get(id);if(!d || d.move)return;
    const slots=this.loopTargets(id), ends=this.capture(slots);this.snapCheckpoint(id,ends);
    if(slots.some(([,s])=>s.span)) { this.reshape(id,slots,ends,'to'); return; }
    const spans=slots.map(([name])=>{const from=this.loopStarts.get(`${id}/${name}`);return [name,{from:from ?? NaN,to:ends.get(name)!.at}] as const;});
    if(!spans.length || spans.some(([,s])=>!Number.isFinite(s.from) || s.to-s.from<.02)){this.error('Loop Out must be at least 20 ms after In for every addressed stem.',id);return;}
    this.installLoops(id,new Map(spans),true);
  }
  /**
   * Move one boundary of the loop that is already running, and keep playing.
   *
   * The region is rebuilt rather than the marker nudged, because every
   * addressed stem carries its own span and they have to agree or the deck
   * stops sounding like one record.
   */
  private reshape(id:string, slots:[string,Slot][], point:Checkpoint, edge:'from'|'to') {
    const spans=new Map<string,Span>();
    for(const [name,slot] of slots){
      const span=slot.span, at=point.get(name)?.at; if(!span || at===undefined) continue;
      const next=edge==='from'?{from:at,to:span.to}:{from:span.from,to:at};
      if(next.to-next.from<.02){this.error('A loop cannot be shortened past 20 ms. Halve it instead.',id);return;}
      spans.set(name,next);
    }
    if(spans.size)this.installLoops(id,spans,false);
  }
  private installLoops(id:string, spans:Map<string,Span>, restart:boolean) {
    const d=this.decks.get(id)!,when=this.loopWhen(id);
    if(this.model(id).synced){
      const adjusted=new Map<string,Span>();for(const [name,span] of spans){const from=this.beatOf(id,span.from),to=this.beatOf(id,span.to),length=Math.max(1,Math.round(to-from));
        const next={from:this.secondsOf(id,Math.round(from)),to:this.secondsOf(id,Math.round(from)+length)};
        if(next.from<0 || next.to>d.slots.get(name)!.voice.buffer.duration){this.error('The synced loop does not fit inside the source.',id);return;}adjusted.set(name,next);}
      spans=adjusted;
    }
    const queued=when>this.ctx!.currentTime+this.lead()+.01;if(queued)this.loopScheduled.set(id,when);
    // A loop that waits for the bar enters at its start; one that takes effect now plays on.
    const enter=restart||queued;
    for(const [name,span] of spans){const s=d.slots.get(name)!;s.revision++;s.pending=undefined;this.loopStarts.delete(`${id}/${name}`);this.loopSpans.set(`${id}/${name}`,span);const at=s.voice.at(when);s.span=span;
      if(s.voice.playing)this.startSlot(id,name,s,enter?span.from:at>=span.to||at<span.from?span.from+(Math.max(0,at-span.from)%(span.to-span.from)):at,when);
      else if(restart)s.voice.seek(span.from);
    }
    this.loopState(id);this.selection(id);this.patchDeck(id,{message:this.loopScheduled.has(id)?'Loop queued for next bar.':undefined});
  }
  setDeckLoopEnabled(id:string,on:boolean) {
    const d=this.decks.get(id);if(!d || d.move)return;
    if(on){const spans=new Map(this.loopTargets(id).flatMap(([name])=>{const span=this.loopSpans.get(`${id}/${name}`);return span?[[name,span] as const]:[];}));if(spans.size)this.installLoops(id,spans,true);return;}
    const when=on?this.loopWhen(id):this.ctx!.currentTime+this.lead();
    if(on && when>this.ctx!.currentTime+this.lead()+.01)this.loopScheduled.set(id,when);else this.loopScheduled.delete(id);
    for(const [name,s] of this.loopTargets(id)){
      s.revision++;s.pending=undefined;
      if(!on && s.span)this.loopSpans.set(`${id}/${name}`,s.span);
      const background=d.backgrounds.get(name),at=!on && background?this.backgroundAt(id,background,when):s.voice.at(when);if(!on)d.backgrounds.delete(name);s.span=on?this.loopSpans.get(`${id}/${name}`):undefined;
      if(s.voice.playing)this.startSlot(id,name,s,on?s.span?.from ?? at:at,when);
      else if(on && s.span)s.voice.seek(s.span.from);
    }
    this.loopState(id);this.selection(id);
  }
  /** The shared length, held to whole beats on a deck that is synced. */
  private quickLoopBeats(id:string) { const beats=this.state.loopBeats; return this.model(id).synced ? Math.max(1,beats) : beats; }
  setLoopBeats = (beats:number) => { if(!LOOP_LENGTHS.includes(beats as never))return; this.publish({...this.state,loopBeats:beats}); };
  quickLoop(id:string) {
    const d=this.decks.get(id);if(!d || d.move)return;
    if(this.loopTargets(id).some(([,s])=>s.span)){this.setDeckLoopEnabled(id,false);return;}
    if(!d.audio.map){this.error('Quick loops need a saved beat grid.',id);return;}
    const point=this.capture(this.loopTargets(id));this.snapCheckpoint(id,point,'before');
    const spans=new Map([...point].map(([name,p])=>[name,{from:p.at,to:this.secondsOf(id,this.beatOf(id,p.at)+this.quickLoopBeats(id))}]));
    if([...spans.values()].some(s=>s.to>d.audio.duration || s.to-s.from<.02)){this.error('That loop does not fit inside every addressed stem.',id);return;}
    this.installLoops(id,spans,false);
  }
  editLoops(id:string, operation:'resize'|'move'|'in'|'out', amount:number) {
    const d=this.decks.get(id);if(!d?.audio.map || !Number.isFinite(amount) || d.move)return;
    const spans=new Map<string,Span>();
    for(const [name,s] of this.loopTargets(id)){
      const old=s.span;if(!old)continue;
      let from=this.beatOf(id,old.from),to=this.beatOf(id,old.to);
      if(operation==='resize')to=from+(to-from)*amount;
      else if(operation==='move'){from+=amount;to+=amount;}
      else if(operation==='in')from=this.nudge(id,from,amount);
      else to=this.nudge(id,to,amount);
      const span={from:this.secondsOf(id,from),to:this.secondsOf(id,to)};
      if(span.from<0 || span.to>d.audio.duration || span.to-span.from<.02){this.error('Loop change would cross an audio boundary or make a loop shorter than 20 ms.',id);return;}
      spans.set(name,span);
    }
    if(spans.size)this.installLoops(id,spans,false);
  }
  // Retained for hosts with a global shortcut; the face exposes per-deck controls.
  private loopIn() { this.decks.forEach((_,id) => this.deckLoopIn(id)); }
  private loopOut() { this.decks.forEach((_,id) => this.deckLoopOut(id)); }
  toggleLoop(on: boolean) { this.decks.forEach((_,id) => this.setDeckLoopEnabled(id,on)); }
  setMonitoring = (on: boolean) => { this.monitoring=on; if(this.ctx) smooth(this.local.gain,on?1:0,this.ctx.currentTime); this.publish(); };
  setLinkAudio = (on: boolean) => { if (!on && !this.ctx) return; this.audio(); this.problem=null; this.publisher!.enable(on); };
  private linkClock(timeline: LinkTimeline, changed: boolean) {
    if (!this.linkAudio.enabled) return;
    this.tempo(timeline.tempo,false);
    // The shared clock supplies phase; deck Sync remains an explicit musician choice.
    if (this.state.running) this.anchor={beat:linkBeatAt(timeline,this.ctx!.currentTime),time:this.ctx!.currentTime};
    if (changed) this.run(this.running(timeline.playing,false));
    else if (this.state.running && this.ctx!.currentTime - this.phaseCorrectedAt > 0.25) {
      const when = this.ctx!.currentTime + this.lead();
      const target = linkBeatAt(timeline,when);
      this.decks.forEach((d,id) => {
        if (!this.model(id).synced || !d.audio.map) return;
        const playing=this.target(id).filter(([,s])=>s.voice.playing);
        if(d.move || d.holds.size || d.backgrounds.size || (this.loopScheduled.get(id) ?? 0)>this.ctx!.currentTime || playing.some(([,s])=>s.pending))return;
        const anchor=playing.find(([name])=>name===this.focused(id)?.[0]) ?? playing[0];if(!anchor)return;
        const beat=this.beatOf(id,anchor[1].voice.at(when)),correction=((target-beat+.5)%1+1)%1-.5;
        if(Math.abs(correction)>.08){
          for(const [name,s] of playing)this.startSlot(id,name,s,this.secondsOf(id,this.beatOf(id,s.voice.at(when))+correction),when);
          this.phaseCorrectedAt=this.ctx!.currentTime;
        }
      });
    }
  }
  private frameCache: {time:number;frame:MixerFrame} | null = null;
  readFrame = (): MixerFrame => {
    const time = this.ctx?.currentTime ?? 0;
    if (this.frameCache?.time === time) return this.frameCache.frame;
    const frame = this.sampleFrame(); this.frameCache = {time,frame}; return frame;
  };
  private sampleFrame = (): MixerFrame => ({ decks: Object.fromEntries([...this.decks].map(([id,d]) => {
    const active=this.focused(id)?.[1]; const at=active?.voice.at() ?? 0;
    return [id,{sources:Object.fromEntries(this.target(id).map(([name,s])=>[name,{seconds:s.voice.at(),beat:this.beatOf(id,s.voice.at()),playing:s.voice.playing,enabled:s.enabled,backgroundBeat:d.backgrounds.has(name)?this.beatOf(id,this.backgroundAt(id,d.backgrounds.get(name)!,this.ctx!.currentTime)):undefined}])),seconds:at,duration:d.audio.duration,beat:d.audio.map ? beatAt(d.audio.map,at*d.audio.map.rate) : at*(this.model(id).track?.bpm ?? 120)/60,level:d.channel.level(),stereo:d.channel.stereoLevels()}];
  })),masterLevel:this.ctx ? this.master.level() : 0,masterStereo:this.ctx ? this.master.stereoLevels() : [0,0] });
  /**
   * One lane per source the deck is playing: the original, or every stem.
   *
   * Peaks are rebuilt only when the window or the set of sources moves, so a
   * frame that merely advances hands back the same arrays and the row does not
   * rerender. Each lane carries its own cue and loop, because stems that have
   * been moved apart have their own.
   */
  private waveform(id: string, d: Deck, beat: number): Pick<MixerDeck,'waveform'> {
    const model = this.model(id);
    const fit = model.zoom===0, start = fit ? this.beatOf(id,0) : Math.floor(beat / 32) * 32 - 32;
    const length = fit ? Math.max(.001,this.beatOf(id,this.focused(id)?.[1].voice.buffer.duration ?? d.audio.duration)-start) : 96;
    const sources = this.target(id).map(([name]) => name);
    const drawn = sources.length ? sources : ['full'];
    const previous = model.waveform;
    const cached = previous?.start===start && previous.length===length && previous.lanes.length===drawn.length && previous.lanes.every((lane,i) => lane.id===drawn[i]);
    const toBeat = (seconds: number) => d.audio.map ? beatAt(d.audio.map,seconds*d.audio.map.rate) : seconds*(model.track?.bpm ?? 120)/60;
    const point = this.checkpoint(id);
    const lanes = drawn.map((name,i): MixerWaveLane => {
      const overview = d.audio.sourceOverviews?.[name];
      const columns = overview?.peaks ?? d.audio.overview, bands = overview?.spectrum ?? d.audio.overviewSpectrum;
      const offset = Math.round((start - (overview?.start ?? d.audio.overviewStart ?? 0)) * 8);
      const peaks = cached ? previous.lanes[i].peaks : Array.from({length:Math.ceil(length*8)},(_,k) => columns[offset + k] ?? {min:0,max:0});
      const spectrum = cached ? previous.lanes[i].spectrum : bands && Array.from({length:Math.ceil(length*8)},(_,k) => bands[offset + k] ?? [0,0,0] as const);
      const slot = d.slots.get(name), own = d.checkpoints.get(name)?.get(name)?.at;
      const activeSpan = slot?.span, span = activeSpan ?? this.loopSpans.get(`${id}/${name}`);
      const pending = model.loop?.start != null && model.loop?.end === null ? this.loopStarts.get(`${id}/${name}`) : undefined;
      const cue = point.get(name)?.at;
      return { id: name, name: model.stems.find(s => s.id===name)?.name ?? 'Full track', peaks, spectrum,
        cue: cue===undefined ? undefined : toBeat(cue), stemCue: own===undefined ? undefined : toBeat(own),
        loop: span ? {start:toBeat(span.from),end:toBeat(span.to),enabled:!!activeSpan} : pending !== undefined ? {start:toBeat(pending),end:null,enabled:false} : undefined };
    });
    return { waveform: { start, length, visible: fit?length:model.zoom ?? 32, fixed: fit, lanes } };
  }
  /** Peaks compare by identity: the window rebuilds them only when it moves. */
  private sameWave(a: MixerDeck['waveform'], b: MixerDeck['waveform']) {
    if (!a || !b) return a===b;
    if (a.start!==b.start || a.length!==b.length || a.visible!==b.visible || !!a.fixed!==!!b.fixed || a.lanes.length!==b.lanes.length) return false;
    return a.lanes.every((lane,i) => { const other = b.lanes[i];
      return lane.id===other.id && lane.peaks===other.peaks && lane.spectrum===other.spectrum && lane.cue===other.cue && lane.stemCue===other.stemCue && JSON.stringify(lane.loop)===JSON.stringify(other.loop); });
  }
  private tick() {
    if(this.disposed) return;
    this.maintainSync();
    this.stopIdleClock();
    for(const [id,when] of this.loopScheduled)if(this.ctx!.currentTime>=when){this.loopScheduled.delete(id);if(this.decks.has(id))this.patchDeck(id,{message:undefined});}
    const now=this.ctx?.currentTime ?? 0;
    this.retiredEffects=this.retiredEffects.filter(({effect,since})=>{if(now-since>180 || now-since>.25 && effect.level()<1e-6){effect.dispose();return false;}return true;});
    const effectTailing=this.state.effectsEnabled===false && [...this.effects,...this.retiredEffects.map(e=>e.effect)].some(e=>e.level()>1e-5);
    if(effectTailing!==this.state.effectTailing)this.publish({...this.state,effectTailing});
    this.decks.forEach((d,id)=>{let changed=false;d.slots.forEach(s=>{if(s.pending && this.ctx!.currentTime >= s.pending.at){s.selected=s.pending.selected;s.pending=undefined;changed=true;}});if(changed)this.selection(id);});
    const beat=Math.floor(this.beat()); let changed=beat!==this.state.beat;
    const frames=this.readFrame();
    const decks=this.state.decks.map(m=>{const d=this.decks.get(m.id);if(!d)return m;const canLoopOut=m.loop?.start != null && m.loop.end === null && this.chosen(d,m).some(([name,s])=>this.loopStarts.has(`${m.id}/${name}`) && s.voice.at() > this.loopStarts.get(`${m.id}/${name}`)! + .02);const page=Math.floor((frames.decks[m.id]?.beat ?? 0)/32),playing=this.deckPlaying(m.id);const wave = this.waveform(m.id,d,frames.decks[m.id]?.beat ?? 0); if(canLoopOut===!!m.canLoopOut&&page===d.page&&playing===m.playing&&this.sameWave(m.waveform,wave.waveform))return m;d.page=page;changed=true;return {...m,playing,canLoopOut,...wave};});
    if(changed)this.publish({...this.state,decks,beat,canLoopOut:this.state.loop.start!==null&&this.beat()-this.state.loop.start>0.1});
  }
  commands: MixerCommands = {
    setLoopBeats:this.setLoopBeats,
    setSlip:(id,slip)=>{const d=this.decks.get(id);if(!d)return;if(!slip)d.backgrounds.clear();this.patchDeck(id,{slip});},
    setLoopFocus:(id,loopFocus)=>{if(this.model(id).loop?.start!=null && this.model(id).loop?.end==null)return;this.patchDeck(id,{loopFocus});this.loopState(id);},
    quickLoop:id=>this.quickLoop(id), resizeLoop:(id,factor)=>this.editLoops(id,'resize',factor), moveLoop:(id,beats)=>this.editLoops(id,'move',beats), adjustLoop:(id,boundary,beats)=>this.editLoops(id,boundary,beats),
    setFocus:(id,focus)=>{if(this.decks.get(id)?.move || this.model(id).loopFocus && this.model(id).loop?.start!=null && this.model(id).loop?.end==null)return;if(this.decks.get(id)?.slots.has(focus))this.patchDeck(id,{focus});this.tick();},
    setMoveTogether:(id,moveTogether)=>{if(!this.decks.get(id)?.move && (moveTogether || this.model(id).independentStems))this.patchDeck(id,{moveTogether});},
    moveDeck:(id,phase,delta)=>this.move(id,phase,delta),
    beatJump:(id,delta)=>this.beatJump(id,delta),
    setZoom:(id,zoom)=>{if(this.decks.get(id)?.move)return;this.patchDeck(id,{zoom:zoom===0?0:Math.max(4,Math.min(64,zoom))});this.tick();},
    setStemPlaying:(id,stem,on)=>this.run(this.play(id,on,undefined,false,stem),id),
    cueStem:(id,stem,held)=>this.cue(id,held,stem),
    setDeckPlaying:(id,on)=>this.run(this.play(id,on),id), cueDeck:(id,held)=>this.cue(id,held), setDeckSync:(id,on)=>this.run(this.sync(id,on),id),
    setRunning:on=>this.run(this.running(on)),stopAll:()=>this.stop(),
    setLaunchBeats:beats=>{if([0,1,4].includes(beats))this.publish({...this.state,launchBeats:beats});},
    setQuantize:beats=>{if([0,.125,.25,.5,1,4].includes(beats))this.publish({...this.state,quantize:beats});},
    deckLoopIn:id=>this.deckLoopIn(id),deckLoopOut:id=>this.deckLoopOut(id),setDeckLoopEnabled:(id,on)=>this.setDeckLoopEnabled(id,on),
    loopIn:()=>this.loopIn(),loopOut:()=>this.loopOut(),setLoopEnabled:on=>this.toggleLoop(on),
    setPhones:(control,value)=>{if(!Number.isFinite(value))return;this.publish({...this.state,[control]:Math.max(0,Math.min(100,value))});this.apply();},
    setEffectsEnabled:effectsEnabled=>{this.publish({...this.state,effectsEnabled});this.apply();},
    setEffectHighPass:(slot,position)=>{const effectHighPass={A:this.state.effectHighPass?.A ?? 0,B:this.state.effectHighPass?.B ?? 0,[slot]:highPassPosition(position)};saveEffectHighPass(effectHighPass);this.publish({...this.state,effectHighPass});this.apply();},
    setEffectEnabled:(slot,on)=>{this.publish({...this.state,effectEnabled:{A:this.state.effectEnabled?.A ?? true,B:this.state.effectEnabled?.B ?? true,[slot]:on}});this.apply();},
    clearEffectTails:()=>{if(this.state.effectsEnabled!==false)return;this.effects.forEach(e=>e.dispose());this.retiredEffects.forEach(e=>e.effect.dispose());this.effects=[];this.retiredEffects=[];this.apply();},
    setEffect:(slot,id)=>{this.publish({...this.state,[slot==='A'?'fxA':'fxB']:id});this.apply();},
    setEffectParam:(slot,id,param,value)=>{this.publish({...this.state,effectValues:{...this.state.effectValues,[slot]:{...this.state.effectValues?.[slot],[id]:{...this.state.effectValues?.[slot]?.[id],[param]:value}}}});this.apply();},
    setMaster:(control,value)=>{if(control==='bpm')this.run(this.adjustTempo(value));else {this.publish({...this.state,[control]:value});this.apply();}},
    setMasterEq:(band,value)=>{this.publish({...this.state,masterEq:this.state.masterEq.map((v,i)=>i===band?value:v)});this.apply();},
    setDeck:(id,control,value)=>{if(control==='full'){this.source(id,!!value);return;}if(control==='cue'&&!this.phonesAvailable&&!this.linkAudio.enabled&&value){this.error('Cue needs a second output pair chosen in Settings, or the Phones stream in Link Audio.',id);return;}this.patchDeck(id,{[control]:value});this.apply();},
    setDeckEq:(id,band,value)=>{this.patchDeck(id,{eq:this.model(id).eq.map((v,i)=>i===band?value:v)});this.apply();},
    setStemLevel:(id,stem,value)=>{this.patchDeck(id,{stems:this.model(id).stems.map(s=>s.id===stem?{...s,level:value}:s)});this.apply();},
    launch:(id,section,stem)=>this.run(this.launch(id,section,stem),id),
  };
  cancelLoads() { this.requests.forEach(r => r.abort()); this.requests.clear(); }
  dispose() { this.disposed=true; this.operation++; this.requests.forEach(r=>r.abort()); this.requests.clear(); this.publisher?.dispose(); this.publisher=null; this.decks.forEach(d=>{d.operation++;d.slots.forEach(s=>s.voice.dispose());d.channel.dispose();d.sends.forEach(s=>s.disconnect());d.phones.disconnect();});this.decks.clear();this.retiredEffects.forEach(e=>e.effect.dispose());this.retiredEffects=[];this.effects.forEach(e=>e.dispose());if(this.timer)clearInterval(this.timer);if(this.ctx && 'close' in this.ctx)void this.ctx.close();this.listeners.clear(); }
}
