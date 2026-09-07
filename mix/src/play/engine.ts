import type { MixerCommands, MixerDeck, MixerFrame, MixerState } from '@openflow/widgets/mixer/model.ts';
import type { Track } from '../openflow.ts';
import { beatAt, sampleOf } from '../warp.ts';
import type { Span } from '../schedule.ts';
import { LinkAudioSender, LINK_AUDIO_OFF } from '../linkAudio.ts';
import { linkBeatAt, type LinkTimeline } from '../linkTiming.ts';
import { DECK_IDS, emptyDeck, initialMixer, loadedDeck, loadDeckAsset, type DeckAudio } from './decks.ts';
import { DeckVoice } from './voice.ts';
import { MixerChannel, MixerEffect, levelGain, routeGain, smooth } from './graph.ts';
import { EFFECTS } from './effects.ts';

type Slot = { pending?: {selected:string;at:number}; revision: number; voice: DeckVoice; selected: string | null; span?: Span; enabled: boolean };
type Deck = { audio: DeckAudio; slots: Map<string, Slot>; channel: MixerChannel; sends: GainNode[]; phones: GainNode; cue: number; audition: boolean; page: number; operation: number };
type Loader = typeof loadDeckAsset;

/** One playback owner for all decks, sends, master, output routing and Link. No React. */
export class MixerEngine {
  private state = initialMixer();
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private decks = new Map<string, Deck>();
  private requests = new Map<string, AbortController>();
  private master!: MixerChannel; private dry!: GainNode; private local!: GainNode; private phones!: GainNode;
  private masterSends: GainNode[] = []; private effects: MixerEffect[] = [];
  private publisher: LinkAudioSender | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private anchor = { beat: 0, time: 0 };
  private disposed = false; private operation = 0;
  private loopStarts = new Map<string, number>(); private loopSpans = new Map<string, Span>();
  monitoring = true; phonesAvailable = false; problem: string | null = null;
  private wasLinked = false;
  private phaseCorrectedAt = -Infinity;
  constructor(private contextFactory = () => new AudioContext({ latencyHint: 'interactive' })) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private publish(next: MixerState = this.state) { this.frameCache = null; if (this.disposed) return; this.state = next === this.state ? { ...next } : next; this.listeners.forEach(fn => fn()); }
  private patchDeck(id: string, patch: Partial<MixerDeck>) { this.publish({ ...this.state, decks: this.state.decks.map(d => d.id === id ? { ...d, ...patch } : d) }); }
  private model(id: string) { return this.state.decks.find(d => d.id === id)!; }
  get linkAudio() { return this.publisher?.state ?? LINK_AUDIO_OFF; }
  get position() { return this.beat() * 60 / this.state.bpm; }
  private audio(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = this.ctx = this.contextFactory();
    this.master = new MixerChannel(ctx); this.dry = ctx.createGain(); this.dry.connect(this.master.input);
    this.local = ctx.createGain(); this.local.gain.value = this.monitoring ? 1 : 0; this.phones = ctx.createGain(); this.master.output.connect(this.local);
    // Conventional stereo master on 1/2; pre-fader headphone cue on 3/4 when available.
    this.phonesAvailable = ctx.destination.maxChannelCount >= 4;
    if (this.phonesAvailable) {
      ctx.destination.channelCount = 4;
      const merge = ctx.createChannelMerger(4), main = ctx.createChannelSplitter(2), cue = ctx.createChannelSplitter(2);
      this.local.connect(main); this.phones.connect(cue); main.connect(merge, 0, 0); main.connect(merge, 1, 1); cue.connect(merge, 0, 2); cue.connect(merge, 1, 3); merge.connect(ctx.destination);
    } else this.local.connect(ctx.destination);
    this.masterSends = [ctx.createGain(), ctx.createGain()]; this.masterSends.forEach(send => this.dry.connect(send));
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
    channel.output.connect(this.dry); sends.forEach(send => channel.output.connect(send)); channel.pre.connect(phones); phones.connect(this.phones);
    const slots = new Map<string, Slot>();
    for (const [name, buffer] of Object.entries(audio.buffers)) { const voice = new DeckVoice(ctx, buffer, audio.map); voice.output.connect(channel.input); slots.set(name, { revision: 0, voice, enabled: false, selected: null }); }
    this.decks.set(id, { audio, slots, channel, sends, phones, cue: 0, audition: false, page: 0, operation: 0 });
    this.effects.forEach((fx, i) => sends[i].connect(fx.input)); this.publishOutputs();
  }
  private remove(id: string) {
    const deck = this.decks.get(id); if (!deck) return;
    deck.operation++; deck.slots.forEach(slot => slot.voice.dispose()); deck.channel.dispose(); deck.sends.forEach(s => s.disconnect()); deck.phones.disconnect(); this.decks.delete(id);
    for (const key of this.loopSpans.keys()) if (key.startsWith(`${id}/`)) this.loopSpans.delete(key);
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
    const d = this.decks.get(id)!, model = this.model(id), span = this.state.loop.enabled ? this.loopSpans.get(`${id}/${name}`) ?? slot.span : slot.span;
    slot.voice.start(at, when, model.synced ? this.state.bpm : null, span, !!span); slot.enabled = true;
  }
  async play(id: string, on: boolean, when?: number, audition = false): Promise<void> {
    const d = this.decks.get(id); if (!d) return;
    if (on && d.audition && !audition) { d.audition = false; this.patchDeck(id, { playing: true, cueHeld: false }); return; }
    const operation = ++d.operation;
    const revisions = new Map([...d.slots.values()].map(s => [s,s.revision]));
    if (!on) { if (this.model(id).message === 'Preparing Sync…') this.patchDeck(id,{message:undefined}); d.slots.forEach(s => s.voice.pause()); d.audition = false; this.patchDeck(id, { playing: false, cueHeld: false }); return; }
    await this.audio().resume();
    if (this.model(id).synced) await Promise.all(this.chosen(d, this.model(id)).map(([,s]) => s.voice.prepare()));
    if (this.disposed || d.operation !== operation || this.decks.get(id) !== d) return;
    const start = Math.max(when ?? 0, this.ctx!.currentTime + this.lead());
    this.startClock(start);
    const chosen = this.chosen(d, this.model(id)), any = chosen.some(([,s]) => s.enabled);
    for (const [name, slot] of chosen) if ((!any || slot.enabled) && slot.revision === revisions.get(slot)) {
      let at = slot.voice.at();
      if (this.model(id).synced && d.audio.map && !audition) {
        const phase = ((this.beat(start) % 1) + 1) % 1;
        const sourceBeat = beatAt(d.audio.map,at*d.audio.map.rate);
        at = sampleOf(d.audio.map,Math.max(0,Math.round(sourceBeat-phase)+phase))/d.audio.map.rate;
      }
      this.startSlot(id, name, slot, at, start);
    }
    d.audition = audition; this.patchDeck(id, { playing: true, cueHeld: audition }); this.apply();
  }
  cue(id: string, held: boolean) {
    const d = this.decks.get(id); if (!d) return;
    const model = this.model(id);
    if (held) {
      if (model.playing && !d.audition) {
        d.operation++; d.slots.forEach(s => { s.voice.seek(d.cue); s.span = undefined; });
        this.patchDeck(id, { playing: false, cueHeld: true });
      } else {
        const at = this.chosen(d, model).find(([,s]) => s.enabled)?.[1].voice.at() ?? d.cue;
        if (Math.abs(at - d.cue) > 0.01) { d.cue = at; this.patchDeck(id, { cueHeld: true }); return; }
        this.run(this.play(id, true, undefined, true), id);
        this.patchDeck(id, { cueHeld: true });
      }
    } else if (d.audition || model.cueHeld && !model.playing) {
      d.operation++; d.slots.forEach(s => s.voice.seek(d.cue)); d.audition = false; this.patchDeck(id, { playing: false, cueHeld: false });
    } else this.patchDeck(id, { cueHeld: false });
  }
  async sync(id: string, on: boolean) {
    const d = this.decks.get(id); if (!d) return;
    const op = ++d.operation;
    if (on) { this.patchDeck(id, { message: 'Preparing Sync…' }); await Promise.all([...d.slots.values()].map(s => s.voice.prepare())); }
    if (this.disposed || this.decks.get(id) !== d || op !== d.operation) return;
    this.patchDeck(id, { synced: on, message: undefined });
    const when = this.ctx!.currentTime + this.lead();
    for (const [name,s] of this.chosen(d, this.model(id))) if (s.voice.playing) {
      let at = s.voice.at(when);
      if (on && d.audio.map) { const beat = beatAt(d.audio.map, at * d.audio.map.rate); const phase = ((this.beat(when) % 1) + 1) % 1; at = sampleOf(d.audio.map, Math.floor(beat) + phase) / d.audio.map.rate; }
      this.startSlot(id, name, s, at, when);
    }
  }
  async launch(id: string, section: string | null, stemId?: string) {
    const d = this.decks.get(id), model = this.model(id); if (!d || section !== null && !model.sections.some(s => s.id === section)) return;
    const chosen = this.chosen(d, model).filter(([name]) => !stemId || name === stemId);
    if (section === null) {
      if (!stemId) d.operation++;
      for (const [,s] of chosen) { s.revision++; s.pending = undefined; s.voice.pause(); s.enabled = false; s.selected = null; }
      this.selection(id); return;
    }
    const op = d.operation;
    const revisions = new Map(chosen.map(([,s]) => [s, ++s.revision]));
    await this.audio().resume();
    if (model.synced) await Promise.all(chosen.map(([,s]) => s.voice.prepare()));
    if (d.operation !== op || this.disposed || this.decks.get(id) !== d) return;
    let when = this.ctx!.currentTime + this.lead();
    if (model.synced && this.state.running) { const beat = this.beat(when); when += (Math.ceil(beat / 4) * 4 - beat) * 60 / this.state.bpm; }
    this.startClock(when);
    for (const [name,s] of chosen) { if (s.revision !== revisions.get(s)) continue; s.span = this.span(d, model, section); if (when > this.ctx!.currentTime + 0.08) s.pending = {selected:section,at:when}; else {s.selected = section;s.pending=undefined;} this.startSlot(id, name, s, s.span?.from ?? 0, when); }
    this.selection(id); this.apply();
  }
  private selection(id: string) {
    const d = this.decks.get(id)!;
    this.patchDeck(id, { fullSection: d.slots.get('full')?.selected ?? null, fullQueued:d.slots.get('full')?.pending?.selected, stems: this.model(id).stems.map(s => ({ ...s, selected: d.slots.get(s.id)?.selected ?? null, queued: d.slots.get(s.id)?.pending?.selected })), playing: [...d.slots.values()].some(s => s.enabled && s.voice.playing) });
  }
  private source(id: string, full: boolean) {
    const d = this.decks.get(id); if (!d) return;
    const was = this.model(id), playing = was.playing, at = this.chosen(d, was).find(([,s]) => s.enabled)?.[1].voice.at() ?? 0;
    d.operation++; d.slots.forEach(s => { s.voice.seek(at); s.enabled = false; s.selected = null; s.pending = undefined; s.span = undefined; });
    this.patchDeck(id, { full, playing: false }); this.selection(id);
    if (playing) this.run(this.play(id, true), id); this.apply();
  }
  private apply() {
    if (!this.ctx) return;
    const s = this.state, now = this.ctx.currentTime;
    [s.fxA, s.fxB].forEach((id, i) => {
      if (this.effects[i]?.kind !== id) {
        this.effects[i]?.dispose(); const fx = this.effects[i] = new MixerEffect(this.ctx!, id);
        this.masterSends[i].disconnect(); this.masterSends[i].connect(fx.input);
        this.decks.forEach(d => { d.sends[i].disconnect(); d.sends[i].connect(fx.input); }); fx.output.connect(this.master.input);
      }
      const slot = i === 0 ? 'A' : 'B';
      const defaults = Object.fromEntries(EFFECTS.find(e => e.id === id)?.controls?.map(c => [c.id, c.param.defaultValue]) ?? []);
      this.effects[i].apply({ ...defaults, ...s.effectValues?.[slot]?.[id] }, s.bpm);
    });
    this.master.apply(s.masterTrim, s.masterEq, s.masterFilter, levelGain(s.master));
    this.masterSends.forEach((send,i) => smooth(send.gain, (i ? s.masterSendB : s.masterSendA) / 100, now));
    this.decks.forEach((d,id) => {
      const m = this.model(id);
      d.channel.apply(m.trim, m.eq, m.filter, levelGain(m.gain) * routeGain(m.route, s.cross));
      d.sends.forEach((send,i) => smooth(send.gain, (i ? m.sendB : m.sendA) / 100, now));
      smooth(d.phones.gain, m.cue ? 1 : 0, now);
      d.slots.forEach((slot,name) => smooth(slot.voice.output.gain, name === 'full' ? (m.full ? 1 : 0) : m.full ? 0 : (m.stems.find(stem => stem.id === name)?.level ?? 0) / 100, now));
    });
  }
  private tempo(bpm: number, announce = true) {
    if (!Number.isFinite(bpm)) return; bpm = Math.max(20, Math.min(999, bpm));
    if (announce && this.linkAudio.enabled) { this.publisher!.setTempo(bpm); return; }
    if (bpm === this.state.bpm) return;
    const when = (this.ctx?.currentTime ?? 0) + this.lead(), positions = [...this.decks].flatMap(([id,d]) => [...d.slots].filter(([,s]) => s.voice.playing).map(([name,s]) => ({id,name,s,at:s.voice.at(when)})));
    this.anchor = { beat: this.beat(when), time: when }; this.publish({ ...this.state, bpm });
    positions.forEach(({id,name,s,at}) => { if (this.model(id).synced) this.startSlot(id,name,s,at,when); }); this.apply();
  }
  async running(on: boolean, announce = true) {
    const op = ++this.operation;
    if (!on) { this.anchor = { beat: this.beat(), time: this.ctx?.currentTime ?? 0 }; this.decks.forEach((_,id) => { this.run(this.play(id,false),id); }); this.publish({ ...this.state, running: false }); if (announce && this.linkAudio.enabled) this.publisher?.stop(); return; }
    if (!this.decks.size) return;
    await this.audio().resume();
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
    this.operation++; this.decks.forEach((d,id) => { d.operation++; d.slots.forEach(s => { s.voice.seek(0); s.enabled = false; s.selected = null; s.pending = undefined; s.span = undefined; }); d.audition = false; this.patchDeck(id,{cueHeld:false}); this.selection(id); });
    this.anchor = { beat: 0, time: this.ctx?.currentTime ?? 0 }; this.loopSpans.clear(); this.loopStarts.clear();
    this.publish({ ...this.state, running: false, beat: 0, loop: {start:null,end:null,enabled:false}, canLoopOut:false }); if (this.linkAudio.enabled) this.publisher?.stop();
  }
  private loopIn() {
    if (!this.state.running) return;
    this.loopStarts.clear(); this.decks.forEach((d,id) => d.slots.forEach((s,name) => { if (s.voice.playing) this.loopStarts.set(`${id}/${name}`,s.voice.at()); }));
    this.publish({ ...this.state, loop: {start:this.beat(),end:null,enabled:false} });
  }
  private loopOut() {
    if (this.state.loop.start === null || this.beat() - this.state.loop.start < 0.1) return;
    this.loopSpans.clear(); this.decks.forEach((d,id) => d.slots.forEach((s,name) => { const from=this.loopStarts.get(`${id}/${name}`),to=s.voice.at(); if(from!==undefined && to>from+0.02) this.loopSpans.set(`${id}/${name}`,{from,to}); }));
    if (!this.loopSpans.size) { this.error('Set Loop Out before the playing section wraps back to its start.'); return; }
    this.publish({ ...this.state, loop: {...this.state.loop,end:this.beat(),enabled:true} }); this.reloop(true);
  }
  toggleLoop(on: boolean) {
    if (on && !this.loopSpans.size) {
      this.decks.forEach((d,id) => this.chosen(d,this.model(id)).forEach(([name,s]) => this.loopSpans.set(`${id}/${name}`,s.span ?? {from:0,to:d.audio.duration})));
    }
    this.reloop(on);
  }
  private reloop(on: boolean) {
    this.publish({ ...this.state, loop: {...this.state.loop,enabled:on} });
    const when=(this.ctx?.currentTime ?? 0)+this.lead();
    this.decks.forEach((d,id)=>d.slots.forEach((s,name)=>{if(s.voice.playing) this.startSlot(id,name,s,on ? this.loopSpans.get(`${id}/${name}`)?.from ?? s.voice.at(when) : s.voice.at(when),when);}));
  }
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
        this.chosen(d,this.model(id)).forEach(([name,s]) => {
          if (!s.voice.playing) return;
          const at = s.voice.at(when), beat = beatAt(d.audio.map!,at*d.audio.map!.rate);
          const correction = ((target-beat+0.5)%1+1)%1-0.5;
          if (Math.abs(correction) > 0.08) {
            this.startSlot(id,name,s,sampleOf(d.audio.map!,beat+correction)/d.audio.map!.rate,when);
            this.phaseCorrectedAt = this.ctx!.currentTime;
          }
        });
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
    const active=this.chosen(d,this.model(id)).find(([,s])=>s.enabled)?.[1]; const at=active?.voice.at() ?? 0;
    return [id,{seconds:at,duration:d.audio.duration,beat:d.audio.map ? beatAt(d.audio.map,at*d.audio.map.rate) : at*(this.model(id).track?.bpm ?? 120)/60,level:d.channel.level()}];
  })),masterLevel:this.ctx ? this.master.level() : 0 });
  private waveform(id: string, d: Deck, beat: number): Pick<MixerDeck,'waveform'|'peaks'> {
    const start = Math.floor(beat / 32) * 32 - 32;
    const peaks = this.model(id).waveform?.start === start ? this.model(id).peaks : Array.from({length:768},(_,i) => d.audio.overview[start * 8 + i] ?? {min:0,max:0});
    const slot = this.chosen(d,this.model(id)).find(([,s])=>s.enabled);
    const span = slot && (this.state.loop.enabled ? this.loopSpans.get(`${id}/${slot[0]}`) ?? slot[1].span : slot[1].span);
    const toBeat = (seconds: number) => d.audio.map ? beatAt(d.audio.map,seconds*d.audio.map.rate) : seconds*(this.model(id).track?.bpm ?? 120)/60;
    const pending = slot && this.state.loop.start !== null && this.state.loop.end === null ? this.loopStarts.get(`${id}/${slot[0]}`) : undefined;
    return { peaks, waveform: {start,length:96,visible:32,loop:span ? {start:toBeat(span.from),end:toBeat(span.to),enabled:true} : pending !== undefined ? {start:toBeat(pending),end:null,enabled:false} : undefined} };
  }
  private tick() {
    if(this.disposed) return;
    this.decks.forEach((d,id)=>{let changed=false;d.slots.forEach(s=>{if(s.pending && this.ctx!.currentTime >= s.pending.at){s.selected=s.pending.selected;s.pending=undefined;changed=true;}});if(changed)this.selection(id);});
    const beat=Math.floor(this.beat()); let changed=beat!==this.state.beat;
    const frames=this.readFrame();
    const decks=this.state.decks.map(m=>{const d=this.decks.get(m.id);if(!d)return m;const page=Math.floor((frames.decks[m.id]?.beat ?? 0)/32),playing=[...d.slots.values()].some(s=>s.enabled&&s.voice.playing);const wave = this.waveform(m.id,d,frames.decks[m.id]?.beat ?? 0); if(page===d.page&&playing===m.playing&&m.waveform&&JSON.stringify(m.waveform.loop)===JSON.stringify(wave.waveform?.loop))return m;d.page=page;changed=true;return {...m,playing,...wave};});
    if(changed)this.publish({...this.state,decks,beat,canLoopOut:this.state.loop.start!==null&&this.beat()-this.state.loop.start>0.1});
  }
  commands: MixerCommands = {
    setDeckPlaying:(id,on)=>this.run(this.play(id,on),id), cueDeck:(id,held)=>this.cue(id,held), setDeckSync:(id,on)=>this.run(this.sync(id,on),id),
    setRunning:on=>this.run(this.running(on)),stopAll:()=>this.stop(),setQuantized:on=>this.publish({...this.state,quantized:on}),
    loopIn:()=>this.loopIn(),loopOut:()=>this.loopOut(),setLoopEnabled:on=>this.toggleLoop(on),
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
  dispose() { this.disposed=true; this.operation++; this.requests.forEach(r=>r.abort()); this.requests.clear(); this.publisher?.dispose(); this.publisher=null; this.decks.forEach(d=>{d.operation++;d.slots.forEach(s=>s.voice.dispose());d.channel.dispose();d.sends.forEach(s=>s.disconnect());d.phones.disconnect();});this.decks.clear();this.effects.forEach(e=>e.dispose());if(this.timer)clearInterval(this.timer);if(this.ctx)void this.ctx.close();this.listeners.clear(); }
}
