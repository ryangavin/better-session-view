import { createAudioContext } from '../audioSettings.ts';
import type { MixerCommands, MixerDeck, MixerFrame, MixerState } from '@openflow/widgets/mixer/model.ts';
import type { Track } from '../openflow.ts';
import { beatAt, sampleOf } from '../warp.ts';
import type { Span } from '../schedule.ts';
import { LinkAudioSender, LINK_AUDIO_OFF } from '../linkAudio.ts';
import { linkBeatAt, type LinkTimeline } from '../linkTiming.ts';
import { DECK_IDS, emptyDeck, initialMixer, loadedDeck, loadDeckAsset, type DeckAudio } from './decks.ts';
import { DeckVoice } from './voice.ts';
import { MixerChannel, MixerEffect, levelGain, routeGain, smooth } from './graph.ts';
import { snapBeat, launchWait, LOOP_LENGTHS } from './timing.ts';
import { EFFECTS } from './effects.ts';

type Slot = { pending?: {selected:string;at:number}; revision: number; voice: DeckVoice; selected: string | null; span?: Span; enabled: boolean };
type Position = { at: number; enabled: boolean; selected: string | null; span?: Span };
type Checkpoint = Map<string, Position>;
type CueHold = { phase: 'set' | 'return' | 'audition'; latched: boolean };
type Background = {at:number;time:number;bpm:number|null};
type Move = { before: Checkpoint; delta: number };
type Deck = { audio: DeckAudio; slots: Map<string, Slot>; channel: MixerChannel; sends: GainNode[]; phones: GainNode; cue: number; audition: boolean; backgrounds:Map<string,Background>;checkpoints: Map<string, Checkpoint>; holds: Map<string, CueHold>; move?: Move; initialized: boolean; page: number; operation: number };
type Loader = typeof loadDeckAsset;

/** One playback owner for all decks, sends, master, output routing and Link. No React. */
export class MixerEngine {
  private state = initialMixer();
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
  private wasLinked = false;
  private phaseCorrectedAt = -Infinity;
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
    this.master = new MixerChannel(ctx); this.dry = ctx.createGain(); this.dry.connect(this.master.input);
    this.local = ctx.createGain(); this.local.gain.value = this.monitoring ? 1 : 0; this.phones = ctx.createGain(); this.phonesCue=ctx.createGain();this.phonesMaster=ctx.createGain();this.phonesMaster.gain.value=0;this.phonesCue.connect(this.phones);this.master.output.connect(this.phonesMaster);this.phonesMaster.connect(this.phones);this.master.output.connect(this.local);
    // Conventional stereo master on 1/2; pre-fader headphone cue on 3/4 when available.
    this.phonesAvailable = ctx.destination.maxChannelCount >= 4;
    if (this.phonesAvailable) {
      ctx.destination.channelCount = 4;
      const merge = ctx.createChannelMerger(4), main = ctx.createChannelSplitter(2), cue = ctx.createChannelSplitter(2);
      this.local.connect(main); this.phones.connect(cue); main.connect(merge, 0, 0); main.connect(merge, 1, 1); cue.connect(merge, 0, 2); cue.connect(merge, 1, 3); merge.connect(ctx.destination);
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
  private lead() { return Math.max(0.03, ...[...this.decks.values()].flatMap(d => [...d.slots.values()].map(s => s.voice.lead))); }
  private error(error: unknown, id?: string) { const message = error instanceof Error ? error.message : String(error); if (id) this.patchDeck(id, { message }); else { this.problem = message; this.publish(); } }
  private run(task: Promise<unknown>, id?: string) { void task.catch(error => this.error(error, id)); }

  async load(id: string, track: Track, loader: Loader = loadDeckAsset): Promise<void> {
    if (!DECK_IDS.includes(id) || this.disposed) return;
    this.requests.get(id)?.abort(); this.remove(id);
    const request = new AbortController(); this.requests.set(id, request);
    const fresh = emptyDeck(id, DECK_IDS.indexOf(id));
    this.patchDeck(id, { ...fresh, track: { id: track.id, title: track.title, artist: track.artist ?? '', bpm: track.bpm, key: track.key ?? '—' }, status: 'loading', message: 'Loading audio…' });
    try {
      const asset = await (loader === loadDeckAsset ? loader(track, request.signal, this.audio()) : loader(track, request.signal));
      if (request.signal.aborted || this.disposed) return;
      if (asset.audio) this.adopt(id, asset.audio);
      this.patchDeck(id, { ...loadedDeck(fresh, track, asset), playing: false, synced: false, cueHeld: false });
      if (this.decks.size === 1 && !this.state.running && !this.linkAudio.enabled && this.model(id).track?.bpm) this.tempo(this.model(id).track!.bpm!, false);
      this.apply();
    } catch (error) { if (!request.signal.aborted) this.patchDeck(id, { status: 'unavailable', message: error instanceof Error ? error.message : 'Could not load audio' }); }
    finally { if (this.requests.get(id) === request) this.requests.delete(id); }
  }
  private adopt(id: string, audio: DeckAudio) {
    const ctx = this.audio(), channel = new MixerChannel(ctx), sends = [ctx.createGain(), ctx.createGain()], phones = ctx.createGain();
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
    if (on && hold?.phase==='audition' && !audition) { hold.latched=true; this.selection(id); return; }
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
    this.startClock(start);
    // Resume preserves the combination's source positions. Sync changes rate, not its phrase offsets.
    for(const [name,s] of eligible) this.startSlot(id,name,s,s.voice.at(),start);
    d.initialized=true; this.selection(id); this.apply();
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
  private snapCheckpoint(id:string, point:Checkpoint) {
    const q=this.model(id).quantize ?? 0;if(!q)return;
    const focused=point.get(this.focused(id)?.[0] ?? '');const anchor=focused?.enabled?focused:[...point.values()].find(p=>p.enabled) ?? focused ?? [...point.values()][0];
    if(!anchor)return;
    const beat=this.beatOf(id,anchor.at);let delta=snapBeat(beat,q)-beat;
    let low=-Infinity,high=Infinity;for(const p of point.values())if(p.enabled){low=Math.max(low,this.beatOf(id,0)-this.beatOf(id,p.at));high=Math.min(high,this.beatOf(id,this.decks.get(id)!.audio.duration)-this.beatOf(id,p.at));}
    delta=Math.max(low,Math.min(high,delta));point.forEach(p=>{if(p.enabled)p.at=this.secondsOf(id,this.beatOf(id,p.at)+delta);});
  }
  private beatOf(id: string, seconds: number) { const d=this.decks.get(id)!; return d.audio.map ? beatAt(d.audio.map,seconds*d.audio.map.rate) : seconds*(this.model(id).track?.bpm ?? 120)/60; }
  private secondsOf(id: string, beat: number) { const d=this.decks.get(id)!; return d.audio.map ? sampleOf(d.audio.map,beat)/d.audio.map.rate : beat*60/(this.model(id).track?.bpm ?? 120); }
  private focused(id: string): [string, Slot] | undefined { const m=this.model(id); return this.target(id).find(([name])=>name===(m.full?'full':m.focus)) ?? this.target(id).find(([,s])=>s.enabled) ?? this.target(id)[0]; }
  move(id: string, phase: 'begin'|'move'|'commit'|'cancel', delta=0) {
    const d=this.decks.get(id); if(!d) return;
    if(phase==='begin') {
      const slots=this.model(id).moveTogether ? this.target(id).filter(([,s])=>s.enabled || !d.initialized) : [this.focused(id)!].filter(Boolean);
      if(!slots.length || slots.some(([,s])=>s.voice.playing)) {this.error('Pause the addressed stems before positioning.',id);return;}
      if(d.holds.size) return;
      d.move={before:this.capture(slots),delta:0};
      slots.forEach(([,s])=>{s.revision++;s.pending=undefined;});
    } else if(d.move) {
      const {before}=d.move;
      if(phase==='cancel') {this.restore(id,before);d.move=undefined;}
      else if(phase==='commit') { d.move=undefined; }
      else if(Number.isFinite(delta)) {
        let low=-Infinity,high=Infinity;
        before.forEach(p=>{const at=this.beatOf(id,p.at);low=Math.max(low,this.beatOf(id,0)-at);high=Math.min(high,this.beatOf(id,d.audio.duration)-at);});
        delta=Math.max(low,Math.min(high,delta));d.move.delta=delta;
        before.forEach((p,name)=>{const s=d.slots.get(name)!;s.voice.seek(this.secondsOf(id,this.beatOf(id,p.at)+delta)); if(delta!==0){if(s.span)this.loopSpans.set(`${id}/${name}`,s.span);s.span=undefined;s.selected=null;} });
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
    if(on && d.audio.map && anchor){const beat=this.beatOf(id,anchor[1].voice.at(when)),target=this.beat(when);delta=((target-beat+.5)%1+1)%1-.5;}
    for(const [name,s] of playing){const bg=d.backgrounds.get(name);if(bg){bg.at=this.backgroundAt(id,bg,when);bg.time=when;bg.bpm=on?this.state.bpm:null;}
      this.startSlot(id,name,s,this.secondsOf(id,this.beatOf(id,s.voice.at(when))+delta),when);
    }
  }
  async launch(id: string, section: string | null, stemId?: string) {
    const d = this.decks.get(id), model = this.model(id); if (!d || section !== null && !model.sections.some(s => s.id === section)) return;
    if(d.move)return;
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
    if (this.state.running) when += launchWait(this.beat(when), model.launchBeats ?? 0) * 60 / this.state.bpm;
    this.startClock(when);
    const bounds = this.span(d, model, section);
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
  private selection(id: string) {
    const d = this.decks.get(id)!;
    this.patchDeck(id, { fullSection: d.slots.get('full')?.selected ?? null, fullQueued:d.slots.get('full')?.pending?.selected, cueHeld: d.holds.has(this.model(id).full ? 'full' : 'deck'), stems: this.model(id).stems.map(s => ({ ...s, playing: d.slots.get(s.id)?.voice.playing ?? false, cueHeld: d.holds.has(s.id), selected: d.slots.get(s.id)?.selected ?? null, queued: d.slots.get(s.id)?.pending?.selected })), playing: [...d.slots.values()].some(s => s.enabled && s.voice.playing) });
  }
  private source(id: string, full: boolean) {
    const d=this.decks.get(id);if(!d)return;
    const previous=this.model(id), playing=!!previous.playing;
    d.operation++;d.holds.clear();d.move=undefined;d.backgrounds.clear();
    d.slots.forEach(s=>{s.revision++;s.voice.pause();s.pending=undefined;});
    if(full && !d.slots.get('full')!.enabled) {const at=this.focused(id)?.[1].voice.at() ?? 0;d.slots.get('full')!.voice.seek(at);d.slots.get('full')!.enabled=true;}
    this.patchDeck(id,{full,playing:false});this.loopState(id);this.selection(id);
    if(playing)this.run(this.play(id,true),id);this.apply();
  }
  private apply() {
    if (!this.ctx) return;
    const s = this.state, now = this.ctx.currentTime;
    [s.fxA, s.fxB].forEach((id, i) => {
      if (this.effects[i]?.kind !== id) {
        if(this.effects[i])this.retiredEffects.push({effect:this.effects[i],since:now}); const fx = this.effects[i] = new MixerEffect(this.ctx!, id);
        this.masterSends[i].disconnect(); this.masterSends[i].connect(fx.input);
        this.decks.forEach(d => { d.sends[i].disconnect(); d.sends[i].connect(fx.input); }); fx.output.connect(this.master.input);
      }
      const slot = i === 0 ? 'A' : 'B';
      const defaults = Object.fromEntries(EFFECTS.find(e => e.id === id)?.controls?.map(c => [c.id, c.param.defaultValue]) ?? []);
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
    const spans=slots.map(([name])=>{const from=this.loopStarts.get(`${id}/${name}`);return [name,{from:from ?? NaN,to:ends.get(name)!.at}] as const;});
    if(!spans.length || spans.some(([,s])=>!Number.isFinite(s.from) || s.to-s.from<.02)){this.error('Loop Out must be at least 20 ms after In for every addressed stem.',id);return;}
    this.installLoops(id,new Map(spans),true);
  }
  private installLoops(id:string, spans:Map<string,Span>, restart:boolean) {
    const d=this.decks.get(id)!,when=this.ctx!.currentTime+this.lead();
    for(const [name,span] of spans){const s=d.slots.get(name)!;s.revision++;s.pending=undefined;this.loopStarts.delete(`${id}/${name}`);this.loopSpans.set(`${id}/${name}`,span);const at=s.voice.at(when);s.span=span;
      if(s.voice.playing)this.startSlot(id,name,s,restart?span.from:at>=span.to||at<span.from?span.from+(Math.max(0,at-span.from)%(span.to-span.from)):at,when);
      else if(restart)s.voice.seek(span.from);
    }
    this.loopState(id);this.selection(id);this.patchDeck(id,{message:undefined});
  }
  setDeckLoopEnabled(id:string,on:boolean) {
    const d=this.decks.get(id);if(!d || d.move)return;
    const when=this.ctx!.currentTime+this.lead();
    for(const [name,s] of this.loopTargets(id)){
      s.revision++;s.pending=undefined;
      if(!on && s.span)this.loopSpans.set(`${id}/${name}`,s.span);
      const background=d.backgrounds.get(name),at=!on && background?this.backgroundAt(id,background,when):s.voice.at(when);if(!on)d.backgrounds.delete(name);s.span=on?this.loopSpans.get(`${id}/${name}`):undefined;
      if(s.voice.playing)this.startSlot(id,name,s,on?s.span?.from ?? at:at,when);
      else if(on && s.span)s.voice.seek(s.span.from);
    }
    this.loopState(id);this.selection(id);
  }
  quickLoop(id:string) {
    const d=this.decks.get(id);if(!d || d.move)return;
    if(this.loopTargets(id).some(([,s])=>s.span)){this.setDeckLoopEnabled(id,false);return;}
    if(!d.audio.map){this.error('Quick loops need a saved beat grid.',id);return;}
    const point=this.capture(this.loopTargets(id));this.snapCheckpoint(id,point);
    const spans=new Map([...point].map(([name,p])=>[name,{from:p.at,to:this.secondsOf(id,this.beatOf(id,p.at)+(this.model(id).loopBeats ?? 16))}]));
    if([...spans.values()].some(s=>s.to>d.audio.duration || s.to-s.from<.02)){this.error('That loop does not fit inside every addressed stem.',id);return;}
    this.installLoops(id,spans,true);
  }
  editLoops(id:string, operation:'resize'|'move'|'in'|'out', amount:number) {
    const d=this.decks.get(id);if(!d?.audio.map || !Number.isFinite(amount) || d.move)return;
    const spans=new Map<string,Span>();
    for(const [name,s] of this.loopTargets(id)){
      const old=s.span;if(!old)continue;
      let from=this.beatOf(id,old.from),to=this.beatOf(id,old.to);
      if(operation==='resize')to=from+(to-from)*amount;
      else if(operation==='move'){from+=amount;to+=amount;}
      else if(operation==='in')from=snapBeat(from+amount,this.model(id).quantize ?? 0);
      else to=snapBeat(to+amount,this.model(id).quantize ?? 0);
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
        if(d.move || d.holds.size || d.backgrounds.size || playing.some(([,s])=>s.pending))return;
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
    return [id,{sources:Object.fromEntries(this.target(id).map(([name,s])=>[name,{seconds:s.voice.at(),beat:this.beatOf(id,s.voice.at()),playing:s.voice.playing,enabled:s.enabled,backgroundBeat:d.backgrounds.has(name)?this.beatOf(id,this.backgroundAt(id,d.backgrounds.get(name)!,this.ctx!.currentTime)):undefined}])),seconds:at,duration:d.audio.duration,beat:d.audio.map ? beatAt(d.audio.map,at*d.audio.map.rate) : at*(this.model(id).track?.bpm ?? 120)/60,level:d.channel.level()}];
  })),masterLevel:this.ctx ? this.master.level() : 0 });
  private waveform(id: string, d: Deck, beat: number): Pick<MixerDeck,'waveform'|'peaks'|'waveformSpectrum'> {
    const start = Math.floor(beat / 32) * 32 - 32;
    const focus=this.focused(id)?.[0] ?? 'full', overview=d.audio.sourceOverviews?.[focus];
    const cached = this.model(id).waveform?.start === start && this.model(id).waveform?.focus === focus;
    const offset = Math.round((start - (overview?.start ?? d.audio.overviewStart ?? 0)) * 8);
    const peaks = cached ? this.model(id).peaks : Array.from({length:768},(_,i) => (overview?.peaks ?? d.audio.overview)[offset + i] ?? {min:0,max:0});
    const waveformSpectrum = cached ? this.model(id).waveformSpectrum : (overview?.spectrum ?? d.audio.overviewSpectrum) && Array.from({length:768},(_,i) => (overview?.spectrum ?? d.audio.overviewSpectrum)![offset + i] ?? [0,0,0] as const);
    const slot = this.focused(id);
    const activeSpan=slot?.[1].span, span = activeSpan ?? (slot && this.loopSpans.get(`${id}/${slot[0]}`));
    const toBeat = (seconds: number) => d.audio.map ? beatAt(d.audio.map,seconds*d.audio.map.rate) : seconds*(this.model(id).track?.bpm ?? 120)/60;
    const pending = slot && this.model(id).loop?.start != null && this.model(id).loop?.end === null ? this.loopStarts.get(`${id}/${slot[0]}`) : undefined;
    return { peaks, waveformSpectrum, waveform: {start,length:96,visible:this.model(id).zoom ?? 32,focus,deckCue:toBeat(this.checkpoint(id).get(focus)?.at ?? 0),cue:this.checkpoint(id,focus).get(focus) ? toBeat(this.checkpoint(id,focus).get(focus)!.at) : undefined,loop:span ? {start:toBeat(span.from),end:toBeat(span.to),enabled:!!activeSpan} : pending !== undefined ? {start:toBeat(pending),end:null,enabled:false} : undefined} };
  }
  private tick() {
    if(this.disposed) return;
    const now=this.ctx?.currentTime ?? 0;
    this.retiredEffects=this.retiredEffects.filter(({effect,since})=>{if(now-since>180 || now-since>.25 && effect.level()<1e-6){effect.dispose();return false;}return true;});
    const effectTailing=this.state.effectsEnabled===false && [...this.effects,...this.retiredEffects.map(e=>e.effect)].some(e=>e.level()>1e-5);
    if(effectTailing!==this.state.effectTailing)this.publish({...this.state,effectTailing});
    this.decks.forEach((d,id)=>{let changed=false;d.slots.forEach(s=>{if(s.pending && this.ctx!.currentTime >= s.pending.at){s.selected=s.pending.selected;s.pending=undefined;changed=true;}});if(changed)this.selection(id);});
    const beat=Math.floor(this.beat()); let changed=beat!==this.state.beat;
    const frames=this.readFrame();
    const decks=this.state.decks.map(m=>{const d=this.decks.get(m.id);if(!d)return m;const canLoopOut=m.loop?.start != null && m.loop.end === null && this.chosen(d,m).some(([name,s])=>this.loopStarts.has(`${m.id}/${name}`) && s.voice.at() > this.loopStarts.get(`${m.id}/${name}`)! + .02);const page=Math.floor((frames.decks[m.id]?.beat ?? 0)/32),playing=[...d.slots.values()].some(s=>s.enabled&&s.voice.playing);const wave = this.waveform(m.id,d,frames.decks[m.id]?.beat ?? 0); if(canLoopOut===!!m.canLoopOut&&page===d.page&&playing===m.playing&&m.waveform&&JSON.stringify(m.waveform)===JSON.stringify(wave.waveform))return m;d.page=page;changed=true;return {...m,playing,canLoopOut,...wave};});
    if(changed)this.publish({...this.state,decks,beat,canLoopOut:this.state.loop.start!==null&&this.beat()-this.state.loop.start>0.1});
  }
  commands: MixerCommands = {
    setDeckTiming:(id,control,value)=>{
      const d=this.decks.get(id);if(!d || !Number.isFinite(value))return;
      const allowed=control==='loopBeats'?LOOP_LENGTHS:control==='launchBeats'?[0,1,4]:[0,.125,.25,.5,1,4];
      if(!allowed.includes(value as never))return;
      if(value && !d.audio.map){this.error('Musical timing needs a saved beat grid.',id);return;}
      this.patchDeck(id,{[control]:value,message:undefined});
    },
    setSlip:(id,slip)=>{const d=this.decks.get(id);if(!d)return;if(!slip)d.backgrounds.clear();this.patchDeck(id,{slip});},
    setLoopFocus:(id,loopFocus)=>{if(this.model(id).loop?.start!=null && this.model(id).loop?.end==null)return;this.patchDeck(id,{loopFocus});this.loopState(id);},
    quickLoop:id=>this.quickLoop(id), resizeLoop:(id,factor)=>this.editLoops(id,'resize',factor), moveLoop:(id,beats)=>this.editLoops(id,'move',beats), adjustLoop:(id,boundary,beats)=>this.editLoops(id,boundary,beats),
    setFocus:(id,focus)=>{if(this.decks.get(id)?.move || this.model(id).loopFocus && this.model(id).loop?.start!=null && this.model(id).loop?.end==null)return;this.patchDeck(id,{focus});this.tick();},
    setMoveTogether:(id,moveTogether)=>{if(!this.decks.get(id)?.move)this.patchDeck(id,{moveTogether});},
    moveDeck:(id,phase,delta)=>this.move(id,phase,delta),
    beatJump:(id,delta)=>this.beatJump(id,delta),
    setZoom:(id,zoom)=>{if(this.decks.get(id)?.move)return;this.patchDeck(id,{zoom:Math.max(4,Math.min(64,zoom))});this.tick();},
    setStemPlaying:(id,stem,on)=>this.run(this.play(id,on,undefined,false,stem),id),
    cueStem:(id,stem,held)=>this.cue(id,held,stem),
    setDeckPlaying:(id,on)=>this.run(this.play(id,on),id), cueDeck:(id,held)=>this.cue(id,held), setDeckSync:(id,on)=>this.run(this.sync(id,on),id),
    setRunning:on=>this.run(this.running(on)),stopAll:()=>this.stop(),setQuantized:on=>this.publish({...this.state,quantized:on}),
    deckLoopIn:id=>this.deckLoopIn(id),deckLoopOut:id=>this.deckLoopOut(id),setDeckLoopEnabled:(id,on)=>this.setDeckLoopEnabled(id,on),
    loopIn:()=>this.loopIn(),loopOut:()=>this.loopOut(),setLoopEnabled:on=>this.toggleLoop(on),
    setPhones:(control,value)=>{if(!Number.isFinite(value))return;this.publish({...this.state,[control]:Math.max(0,Math.min(100,value))});this.apply();},
    setEffectsEnabled:effectsEnabled=>{this.publish({...this.state,effectsEnabled});this.apply();},
    setEffectEnabled:(slot,on)=>{this.publish({...this.state,effectEnabled:{A:this.state.effectEnabled?.A ?? true,B:this.state.effectEnabled?.B ?? true,[slot]:on}});this.apply();},
    clearEffectTails:()=>{if(this.state.effectsEnabled!==false)return;this.effects.forEach(e=>e.dispose());this.retiredEffects.forEach(e=>e.effect.dispose());this.effects=[];this.retiredEffects=[];this.apply();},
    setEffect:(slot,id)=>{this.publish({...this.state,[slot==='A'?'fxA':'fxB']:id});this.apply();},
    setEffectParam:(slot,id,param,value)=>{this.publish({...this.state,effectValues:{...this.state.effectValues,[slot]:{...this.state.effectValues?.[slot],[id]:{...this.state.effectValues?.[slot]?.[id],[param]:value}}}});this.apply();},
    setMaster:(control,value)=>{if(control==='bpm')this.tempo(value);else {this.publish({...this.state,[control]:value});this.apply();}},
    setMasterEq:(band,value)=>{this.publish({...this.state,masterEq:this.state.masterEq.map((v,i)=>i===band?value:v)});this.apply();},
    setDeck:(id,control,value)=>{if(control==='full'){this.source(id,!!value);return;}if(control==='cue'&&!this.phonesAvailable&&!this.linkAudio.enabled&&value){this.error('Phones needs outputs 3/4 on a multichannel audio interface, or the Phones stream in Link Audio.',id);return;}this.patchDeck(id,{[control]:value});this.apply();},
    setDeckEq:(id,band,value)=>{this.patchDeck(id,{eq:this.model(id).eq.map((v,i)=>i===band?value:v)});this.apply();},
    setStemLevel:(id,stem,value)=>{this.patchDeck(id,{stems:this.model(id).stems.map(s=>s.id===stem?{...s,level:value}:s)});this.apply();},
    launch:(id,section,stem)=>this.run(this.launch(id,section,stem),id),
  };
  cancelLoads() { this.requests.forEach(r => r.abort()); this.requests.clear(); }
  dispose() { this.disposed=true; this.operation++; this.requests.forEach(r=>r.abort()); this.requests.clear(); this.publisher?.dispose(); this.publisher=null; this.decks.forEach(d=>{d.operation++;d.slots.forEach(s=>s.voice.dispose());d.channel.dispose();d.sends.forEach(s=>s.disconnect());d.phones.disconnect();});this.decks.clear();this.retiredEffects.forEach(e=>e.effect.dispose());this.retiredEffects=[];this.effects.forEach(e=>e.dispose());if(this.timer)clearInterval(this.timer);if(this.ctx && 'close' in this.ctx)void this.ctx.close();this.listeners.clear(); }
}
