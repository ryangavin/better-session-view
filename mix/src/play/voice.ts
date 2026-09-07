import { channelsOf, stretchOf, type Stretch } from '../stretch.ts';
import { pinnedOf, type Pinned } from '../pinned.ts';
import { passOf, sourceAt, type Pass, type Span } from '../schedule.ts';
import type { Beats } from '../warp.ts';

/** One independently launchable source, sharing the mixer's context and sample clock. */
export class DeckVoice {
  readonly output: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private sourceFade: GainNode | null = null;
  private stretch: Stretch | null = null;
  private stretchFade: GainNode;
  private preparing: Promise<void> | null = null;
  private disposed = false;
  private pinned: Pinned | null = null;
  private pass: Pass | null = null;
  private passAt = 0;
  private next = 1;
  private beforeStart: ((when:number)=>number) | null = null;
  private from = 0;
  private since = 0;
  private active = false;
  private span?: Span;
  private loop = false;
  private scheduledEnd = false;
  constructor(readonly context: AudioContext, readonly buffer: AudioBuffer, readonly map: Beats | null) {
    this.output = context.createGain();
    this.stretchFade=context.createGain();this.stretchFade.gain.value=0;this.stretchFade.connect(this.output);
  }
  get playing(): boolean { return this.active && (this.loop || this.at() < (this.span?.to ?? this.buffer.duration) - 0.001); }
  get lead(): number { return Math.max(0.03, (this.stretch?.latency ?? 0) + 0.02); }
  async prepare(): Promise<void> {
    if (!this.map) throw new Error('Sync needs a saved beat grid. Prepare this track first.');
    if (this.stretch) return;
    this.preparing ??= (async () => {
      const channels = await channelsOf(this.context, [this.buffer]);
      const made = await stretchOf(this.context, 2);
      if (!made) throw new Error('Pitch-preserving playback could not start');
      if (this.disposed) { made.node.disconnect(); return; }
      await made.node.addBuffers(channels, channels.map(c => c.buffer));
      if (this.disposed) { void made.node.dropBuffers(); made.node.disconnect(); return; }
      this.stretch = made;
      made.node.connect(this.stretchFade);
      void made.node.setUpdateInterval(0.03, () => this.tick());
    })().catch(error => { this.preparing = null; throw error; });
    return this.preparing;
  }
  at(when = this.context.currentTime): number {
    if (!this.active) return this.from;
    if (when < this.since && this.beforeStart) return this.beforeStart(when);
    const elapsed = Math.max(0, when - this.since);
    if (this.pinned) return sourceAt(this.pinned, this.from, elapsed, this.loop, this.span);
    const end = this.span?.to ?? this.buffer.duration, start = this.span?.from ?? 0;
    const pos = this.from + elapsed;
    return this.loop && end > start ? start + ((pos - start) % (end - start) + end - start) % (end - start) : Math.min(end, pos);
  }
  start(at: number, when: number, tempo: number | null, span?: Span, loop = false): void {
    if (this.disposed) return;
    if (tempo !== null && !this.stretch) throw new Error('Sync is still preparing');
    const previous = { active:this.active, from:this.from, since:this.since, pinned:this.pinned, loop:this.loop, span:this.span, before:this.context.currentTime < this.since ? this.beforeStart : null };
    this.beforeStart = time => {
      if (!previous.active) return previous.from;
      if (time < previous.since && previous.before) return previous.before(time);
      const elapsed = Math.max(0,time-previous.since);
      if (previous.pinned) return sourceAt(previous.pinned,previous.from,elapsed,previous.loop,previous.span);
      const start = previous.span?.from ?? 0, end = previous.span?.to ?? this.buffer.duration;
      return previous.loop ? start + ((previous.from+elapsed-start)%(end-start)+(end-start))%(end-start) : Math.min(end,previous.from+elapsed);
    };
    const wasStretched=this.active && !!this.pinned;
    this.halt(when,tempo!==null);
    this.span = span; this.loop = loop; this.from = Math.max(span?.from ?? 0, Math.min(at, span?.to ?? this.buffer.duration));
    if (this.from >= (span?.to ?? this.buffer.duration) - 0.001) this.from = span?.from ?? 0;
    this.since = when; this.active = true;
    this.pinned = tempo !== null && this.map ? pinnedOf(this.map, tempo, [], 'beat') : null;
    if (this.pinned && this.stretch) {
      if(!wasStretched){const gain=this.stretchFade.gain;gain.cancelScheduledValues(when);gain.setValueAtTime(0,when);gain.linearRampToValueAtTime(1,when+.008);}
      this.pass = passOf(this.pinned, this.from, span); this.passAt = when; this.next = 1; this.scheduledEnd = false;
      const first = this.pass.boundaries[0];
      void this.stretch.node.schedule({ outputTime: this.context.currentTime, output: when, active: true, input: first.input, rate: first.rate, loopStart: 0, loopEnd: 0 });
      this.tick();
    } else {
      const source = this.context.createBufferSource(); source.buffer = this.buffer;
      source.loop = loop; source.loopStart = span?.from ?? 0; source.loopEnd = span?.to ?? this.buffer.duration;
      const fade = this.context.createGain(); fade.gain.setValueAtTime(0, when); fade.gain.linearRampToValueAtTime(1, when + (wasStretched ? 0.008 : 0.004));
      source.connect(fade); fade.connect(this.output);
      source.onended = () => { source.disconnect(); fade.disconnect(); };
      this.source = source; this.sourceFade=fade;
      source.start(when, this.from);
      if (!loop) source.stop(when + (span?.to ?? this.buffer.duration) - this.from);
    }
  }
  private tick(): void {
    if (!this.active || !this.pinned || !this.pass || !this.stretch || this.disposed) return;
    for (let guard = 0; guard < 128; guard++) {
      const pass = this.pass;
      if (this.next < pass.boundaries.length) {
        if (this.context.currentTime < this.passAt + pass.boundaries[this.next - 1].output) return;
        const boundary = pass.boundaries[this.next++], at = this.passAt + boundary.output;
        void this.stretch.node.schedule({ outputTime: at, output: at, input: boundary.input, rate: boundary.rate, active: true });
      } else {
        if (this.scheduledEnd || this.context.currentTime < this.passAt + pass.boundaries.at(-1)!.output) return;
        const end = this.passAt + pass.length;
        if (!this.loop) { void this.stretch.node.schedule({ outputTime: end, output: end, active: false }); this.scheduledEnd = true; return; }
        this.pass = passOf(this.pinned, this.span?.from ?? 0, this.span); this.passAt = end; this.next = 1;
        const first = this.pass.boundaries[0];
        void this.stretch.node.schedule({ outputTime: end, output: end, input: first.input, rate: first.rate, active: true });
      }
    }
  }
  pause(): void { const at = this.at(); this.halt(); this.from = at; }
  seek(at: number): void { this.halt(); this.from = Math.max(0, Math.min(at, this.buffer.duration)); }
  private halt(when = this.context.currentTime, keepStretch=false): void {
    this.active = false; this.pass = null;
    if (this.source) {
      const gain=this.sourceFade?.gain;
      if(gain){if(typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(when);else {gain.cancelScheduledValues(when);gain.setValueAtTime(1,when);}gain.linearRampToValueAtTime(0,when+(keepStretch?.008:.004));}
      try { this.source.stop(when+(keepStretch?.008:.004)); } catch {} this.source = null; this.sourceFade=null;
    }
    if (this.stretch && !keepStretch) {
      const gain=this.stretchFade.gain;
      if(typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(when);else {gain.cancelScheduledValues(when);gain.setValueAtTime(1,when);}
      gain.linearRampToValueAtTime(0,when+.008);
      void this.stretch.node.schedule({ outputTime: this.context.currentTime, output: when+.008, active: false });
    }
  }
  dispose(): void { this.disposed = true; this.halt(); if (this.stretch) { void this.stretch.node.dropBuffers(); this.stretch.node.disconnect(); } this.stretchFade.disconnect(); this.output.disconnect(); }
}
