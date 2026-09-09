import type { TranscribedNote } from '../../tab.ts';
import type { Span } from '../audition.ts';

export interface AudibleNote { start: number; end: number; pitch: number; velocity: number }

/** Clip sustaining notes at a seek/loop boundary; muted/unknown events never sound. */
export function notesIn(notes: readonly TranscribedNote[], span: Span, transpose: number): AudibleNote[] {
  const result = notes.flatMap(n => {
    const pitch = n.pitch === null ? -1 : n.pitch + transpose;
    const start = Math.max(span.from, n.start), end = Math.min(span.to, n.end);
    return !n.muted && Number.isInteger(pitch) && pitch >= 0 && pitch <= 127 && end > start && Number.isFinite(start + end)
      ? [{ start, end, pitch, velocity: Math.max(1, Math.min(127, Math.round(n.velocity))) }] : [];
  }).sort((a, b) => a.start - b.start);
  // MIDI 1.0 cannot distinguish overlapping voices of the same pitch/channel.
  // End the older note at the new attack so its later note-off cannot kill it.
  const last = new Map<number, AudibleNote>();
  for (const note of result) {
    const previous = last.get(note.pitch);
    if (previous && previous.end > note.start) previous.end = note.start;
    last.set(note.pitch, note);
  }
  return result.filter(n => n.end > n.start);
}

export interface MidiPort { send(data: number[], timestamp?: number): void; clear(): void }

/** Keep future events here: some Chromium Web MIDI outputs lack clear().
 * Only due messages reach the OS, so Stop can cancel every future note. */
export class BrowserMidiPort implements MidiPort {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(private port: Pick<MIDIOutput, 'send'>, private failed: (e: unknown) => void = () => {}) {}
  send(data: number[], timestamp = performance.now()) {
    const delay = timestamp - performance.now();
    if (delay <= 0) { this.port.send(data); return; }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      try { this.port.send(data); } catch (e) { this.clear(); this.failed(e); }
    }, delay);
    this.timers.add(timer);
  }
  clear() { for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); }
}

/** Only notes this player scheduled, on the explicitly selected channel. No SysEx,
 * program changes, clock, transport, or broad all-channel reset messages. */
export class MidiNotes {
  private pending = new Map<string, { pitch: number; channel: number; end: number }>();
  constructor(readonly output: MidiPort) {}
  note(note: AudibleNote, channel: number, at: number, end: number, level = 1) {
    if (!Number.isInteger(channel) || channel < 1 || channel > 16 || level <= 0) return;
    const velocity = Math.max(1, Math.min(127, Math.round(note.velocity * level)));
    // Register before sending: if a disconnect interrupts the pair, cleanup
    // still knows which note may have reached the device.
    this.pending.set(`${channel}:${note.pitch}`, { pitch: note.pitch, channel, end });
    this.output.send([0x90 + channel - 1, note.pitch, velocity], at);
    // A small release margin keeps a previous same-pitch off ahead of the
    // next attack across OS/IPC timestamp rounding.
    this.output.send([0x80 + channel - 1, note.pitch, 0], Math.max(at, end - 2));
  }
  prune(now: number) { for (const [key, n] of this.pending) if (n.end < now) this.pending.delete(key); }
  stop() {
    try { this.output.clear(); } catch { /* disconnected ports may refuse cleanup */ }
    for (const n of this.pending.values()) {
      try { this.output.send([0x80 + n.channel - 1, n.pitch, 0]); } catch { /* unplugged */ }
    }
    this.pending.clear();
  }
}

interface Pass { at: number; from: number; end: number; notes: AudibleNote[]; next: number }
export interface PitchPlayback { source: AudioBuffer; notes: readonly TranscribedNote[]; transpose: number; span: Span; loop: boolean }

/** The debug audition's source-time model, with audio and synthesized MIDI on one
 * Web Audio clock. Only a short scheduling horizon exists; Stop cancels all of it. */
export class PitchPlayer {
  private ctx: AudioContext | null = null;
  private sourceGain: GainNode | null = null;
  private midiGain: GainNode | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private timer: number | null = null;
  private passes: Pass[] = [];
  private held: PitchPlayback | null = null;
  private generation = 0;
  private disposed = false;
  private sourceLevel = .7;
  private midiLevel = .35;
  private internal = true;
  private midi: MidiNotes | null = null;
  private channel = 1;
  private offset = 0;
  playing = false;
  constructor(private failed: (says: string) => void = () => {}) {}

  context(): AudioContext {
    if (this.disposed) throw new Error('Pitch audition is closed');
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.sourceGain = this.ctx.createGain(); this.midiGain = this.ctx.createGain();
      this.sourceGain.connect(this.ctx.destination); this.midiGain.connect(this.ctx.destination);
      this.sourceGain.gain.value = this.sourceLevel; this.midiGain.gain.value = this.internal ? this.midiLevel : 0;
    }
    return this.ctx;
  }
  levels(source: number, midi: number, internal = true) {
    this.internal = internal;
    this.sourceLevel = Math.max(0, Math.min(1, source)); this.midiLevel = Math.max(0, Math.min(1, midi));
    if (this.ctx) {
      this.sourceGain!.gain.setTargetAtTime(this.sourceLevel, this.ctx.currentTime, .008);
      this.midiGain!.gain.setTargetAtTime(internal ? this.midiLevel : 0, this.ctx.currentTime, .008);
    }
    if (this.midiLevel === 0) this.midi?.stop();
  }
  output(port: MidiPort | null, channel = 1, offsetMs = 0) {
    this.stop(); this.midi = port ? new MidiNotes(port) : null;
    this.channel = channel; this.offset = offsetMs;
  }
  setLoop(loop: boolean) {
    if (!this.held) return;
    const at = this.position(); this.held = { ...this.held, loop };
    if (at !== null) void this.start(this.held, at).catch(e => this.failed(String(e)));
  }
  async start(settings: PitchPlayback, from = settings.span.from): Promise<void> {
    this.stop();
    if (!(settings.span.to > settings.span.from) || settings.span.from < 0) throw new Error('Choose a nonempty passage');
    const token = this.generation, ctx = this.context();
    await ctx.resume();
    if (token !== this.generation || this.disposed) return;
    this.held = settings; this.playing = true;
    this.pass(ctx.currentTime + .04, Math.max(settings.span.from, Math.min(settings.span.to - .001, from)));
    this.tick();
    if (this.playing) this.timer = window.setInterval(() => this.tick(), 25);
  }
  private pass(at: number, from: number) {
    const held = this.held!, ctx = this.context();
    const source = ctx.createBufferSource(); source.buffer = held.source;
    source.connect(this.sourceGain!);
    const duration = Math.min(held.span.to, held.source.duration) - from;
    if (duration > 0) { this.keep(source); source.start(at, from, duration); }
    this.passes.push({ at, from, end: at + held.span.to - from,
      notes: notesIn(held.notes, { from, to: held.span.to }, held.transpose), next: 0 });
  }
  private keep(node: AudioScheduledSourceNode) {
    this.sources.add(node); node.onended = () => { this.sources.delete(node); node.disconnect(); };
  }
  private midiTime(audioTime: number): number {
    const ctx = this.context(), stamp = ctx.getOutputTimestamp?.();
    return stamp && typeof stamp.performanceTime === 'number' && stamp.performanceTime > 0 && typeof stamp.contextTime === 'number'
      ? stamp.performanceTime + (audioTime - stamp.contextTime) * 1000 + this.offset
      : performance.now() + (audioTime - ctx.currentTime + ctx.baseLatency + (ctx.outputLatency ?? 0)) * 1000 + this.offset;
  }
  private tick() {
    if (!this.playing || !this.ctx || !this.held) return;
    try {
      const now = this.ctx.currentTime, horizon = now + .15;
      while (this.held.loop && this.passes.at(-1)!.end < horizon) this.pass(this.passes.at(-1)!.end, this.held.span.from);
      for (const pass of this.passes) {
        while (pass.next < pass.notes.length) {
          const n = pass.notes[pass.next], at = pass.at + n.start - pass.from, end = pass.at + n.end - pass.from;
          if (at > horizon) break;
          pass.next++;
          if (end <= now) continue;
          const begins = Math.max(at, now), osc = this.ctx.createOscillator(), env = this.ctx.createGain();
          osc.type = 'triangle'; osc.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
          osc.connect(env).connect(this.midiGain!);
          const peak = .35 * n.velocity / 127, attackEnd = Math.min(begins + .005, end);
          env.gain.setValueAtTime(0, begins); env.gain.linearRampToValueAtTime(peak, attackEnd);
          env.gain.setValueAtTime(peak, Math.max(attackEnd, end - .008)); env.gain.linearRampToValueAtTime(0, end);
          this.keep(osc); osc.onended = () => { this.sources.delete(osc); osc.disconnect(); env.disconnect(); };
          osc.start(begins); osc.stop(end);
          if (this.midiLevel > 0) this.midi?.note(n, this.channel, this.midiTime(begins), this.midiTime(end), this.midiLevel);
        }
      }
      this.midi?.prune(performance.now());
      if (!this.held.loop && now > this.passes.at(-1)!.end + (this.ctx.outputLatency ?? 0)) this.stop();
      else this.passes = this.passes.filter(p => p.end >= now - 1);
    } catch (e) { this.stop(); this.failed(String(e)); }
  }
  position(): number | null {
    if (!this.playing || !this.ctx || !this.passes.length) return null;
    const audible = this.ctx.currentTime - this.ctx.baseLatency - (this.ctx.outputLatency ?? 0);
    const pass = this.passes.find(p => p.at <= audible && p.end > audible) ?? this.passes[0];
    return Math.max(pass.from, Math.min(this.held!.span.to, pass.from + audible - pass.at));
  }
  seek(at: number) {
    if (this.playing && this.held) void this.start(this.held, at).catch(e => this.failed(String(e)));
  }
  stop() {
    this.generation++; this.playing = false;
    if (this.timer !== null) window.clearInterval(this.timer); this.timer = null;
    for (const node of this.sources) { try { node.stop(); } catch { /* ended */ } node.disconnect(); }
    this.sources.clear(); this.passes = []; this.midi?.stop();
  }
  dispose() { this.stop(); this.disposed = true; if (this.ctx) void this.ctx.close(); }
}
