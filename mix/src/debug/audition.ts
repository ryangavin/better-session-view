/**
 * Stem playback with a click on every beat, for auditioning a beat map.
 *
 * The harness's own deck rather than the app's transport, because a transport
 * plays a mix and this plays a *question*: these stems, this band of the
 * drums, a click on this map, from here, looping this stretch, scrubbed
 * under the hand. Buffers arrive already decoded — the app decoded them for
 * its lanes — and are held by name: `drums`, or `drums#low` for the kick as
 * the transient finding heard it.
 */
import { bandOf, type Band } from '../transients.ts';

export interface Click {
  /** Seconds from the top of the file. */
  at: number;
  down: boolean;
}

export interface Span {
  from: number;
  to: number;
}

const LOOKAHEAD = 2;
/**
 * Scrubbing: how long the voice is given to reach the playhead, in seconds,
 * the fastest it will run to get there, and the leap beyond which it does
 * not chase but jumps.
 */
const HORIZON = 0.02;
const FASTEST = 4;
const LEAP = 0.4;

interface Voice {
  dir: 1 | -1;
  nodes: AudioBufferSourceNode[];
  rates: AudioParam[];
  gain: GainNode;
  pos: number;
  rate: number;
  setAt: number;
  haltAt: number;
}

interface Scrub {
  buffers: AudioBuffer[];
  at: number;
  wall: number;
  voice: Voice | null;
}

export class Audition {
  private ctx: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private timer: number | null = null;
  private passAt = 0;
  private passFrom = 0;
  private span: Span = { from: 0, to: 0 };
  private clicks: Click[] = [];
  private buffers: AudioBuffer[] = [];
  private clicked = 0;
  private scrubbing: Scrub | null = null;
  private readonly reversed = new Map<AudioBuffer, AudioBuffer>();
  /** Decoded stems and bands, by name. */
  readonly have = new Map<string, AudioBuffer>();
  playing = false;
  looping = false;

  context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'interactive' });
    return this.ctx;
  }

  /** How long after a sample is scheduled it reaches the ear, in seconds; zero until running. */
  latency(): number {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return 0;
    return ctx.baseLatency + (ctx.outputLatency ?? 0);
  }

  /** A decoded stem, by name. Anything already held under that name is replaced. */
  adopt(name: string, buffer: AudioBuffer): void {
    if (this.have.get(name) === buffer) return;
    this.have.set(name, buffer);
    for (const key of [...this.have.keys()]) if (key.startsWith(`${name}#`)) this.have.delete(key);
  }

  forget(): void {
    this.stop();
    this.scrubEnd();
    this.have.clear();
    this.reversed.clear();
  }

  /** A stem or a band of it, made on first ask. */
  buffer(name: string): AudioBuffer | null {
    const held = this.have.get(name);
    if (held) return held;
    const m = /^(.+)#(low|mid|high)$/.exec(name);
    if (!m) return null;
    const whole = this.have.get(m[1]);
    if (!whole) return null;
    const channels = Array.from({ length: whole.numberOfChannels }, (_, c) => whole.getChannelData(c));
    const heard = this.context().createBuffer(1, whole.length, whole.sampleRate);
    heard.getChannelData(0).set(bandOf(channels, whole.sampleRate, m[2] as Band));
    this.have.set(name, heard);
    return heard;
  }

  async start(names: string[], clicks: Click[], span: Span, from: number): Promise<void> {
    const ctx = this.context();
    await ctx.resume();
    this.buffers = names.map((n) => this.buffer(n)).filter((b): b is AudioBuffer => b !== null);
    this.stop();
    this.clicks = clicks;
    this.span = span;
    this.playing = true;
    this.pass(Math.max(span.from, Math.min(from, span.to - 0.05)), ctx.currentTime + 0.02);
    this.timer = window.setInterval(() => this.tick(), 100);
  }

  private pass(from: number, at: number): void {
    const ctx = this.context();
    const length = Math.max(0.05, this.span.to - from);
    for (const buffer of this.buffers) {
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.destination);
      node.start(at, from, length);
      this.sources.push(node);
    }
    this.passAt = at;
    this.passFrom = from;
    this.clicked = 0;
  }

  private tick(): void {
    const ctx = this.context();
    const now = ctx.currentTime;
    const end = this.passAt + (this.span.to - this.passFrom);
    while (this.clicked < this.clicks.length) {
      const click = this.clicks[this.clicked];
      const when = this.passAt + (click.at - this.passFrom);
      if (when > now + LOOKAHEAD) break;
      this.clicked++;
      if (when < now || when > end) continue;
      this.tap(when, click.down);
    }
    if (now > end - 0.25) {
      if (this.span.to >= this.span.from && this.looping) this.pass(this.span.from, end);
      else if (now > end) this.stop();
    }
  }

  private tap(when: number, down: boolean): void {
    const ctx = this.context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = down ? 1600 : 1000;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(down ? 0.5 : 0.22, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
  }

  /** Scrubbing as tape does it: one voice whose speed follows the hand. */
  scrubStart(names: string[], at: number): void {
    void this.context().resume();
    this.stop();
    this.scrubbing = {
      buffers: names.map((n) => this.buffer(n)).filter((b): b is AudioBuffer => b !== null),
      at,
      wall: performance.now() / 1000,
      voice: null,
    };
  }

  scrubTo(at: number): void {
    const scrub = this.scrubbing;
    if (!scrub) return;
    const ctx = this.context();
    const now = ctx.currentTime;
    const wall = performance.now() / 1000;
    const speed = Math.abs(at - scrub.at) / Math.max(0.004, wall - scrub.wall);
    scrub.at = at;
    scrub.wall = wall;

    let voice = scrub.voice;
    let pos = voice ? this.positionOf(voice, now) : at;
    const dir: 1 | -1 = at >= pos ? 1 : -1;
    at += dir * speed * this.latency();
    if (!voice || voice.dir !== dir || Math.abs(at - pos) > LEAP) {
      if (Math.abs(at - pos) > LEAP) pos = at - dir * HORIZON;
      voice = this.turn(scrub, dir, pos, now);
      if (!voice) return;
    }
    const gap = dir * (at - pos);
    const rate = Math.min(FASTEST, speed + gap / HORIZON);
    const halt = now + (rate > 0 ? gap / rate : 0);
    for (const param of voice.rates) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(rate, now);
      param.setValueAtTime(0, halt);
    }
    voice.pos = pos;
    voice.rate = rate;
    voice.setAt = now;
    voice.haltAt = halt;
  }

  scrubEnd(): void {
    if (this.scrubbing?.voice) this.silence(this.scrubbing.voice);
    this.scrubbing = null;
  }

  private positionOf(voice: Voice, now: number): number {
    const ran = Math.max(0, Math.min(now, voice.haltAt) - voice.setAt);
    return voice.pos + voice.dir * voice.rate * ran;
  }

  private silence(voice: Voice): void {
    const now = this.context().currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.002);
    for (const node of voice.nodes) node.stop(now + 0.003);
  }

  private turn(scrub: Scrub, dir: 1 | -1, pos: number, now: number): Voice | null {
    if (scrub.voice) this.silence(scrub.voice);
    scrub.voice = null;
    if (scrub.buffers.length === 0) return null;
    const ctx = this.context();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.002);
    gain.connect(ctx.destination);
    const nodes: AudioBufferSourceNode[] = [];
    const rates: AudioParam[] = [];
    for (const forward of scrub.buffers) {
      const node = ctx.createBufferSource();
      node.buffer = dir > 0 ? forward : this.backwards(forward);
      node.playbackRate.setValueAtTime(0, now);
      node.connect(gain);
      const offset = dir > 0 ? pos : forward.duration - pos;
      node.start(now, Math.max(0, Math.min(forward.duration, offset)));
      nodes.push(node);
      rates.push(node.playbackRate);
    }
    const voice: Voice = { dir, nodes, rates, gain, pos, rate: 0, setAt: now, haltAt: now };
    scrub.voice = voice;
    return voice;
  }

  private backwards(forward: AudioBuffer): AudioBuffer {
    let back = this.reversed.get(forward);
    if (!back) {
      back = this.context().createBuffer(forward.numberOfChannels, forward.length, forward.sampleRate);
      for (let c = 0; c < forward.numberOfChannels; c++) {
        const from = forward.getChannelData(c);
        const to = back.getChannelData(c);
        for (let i = 0, j = from.length - 1; i < from.length; i++, j--) to[i] = from[j];
      }
      this.reversed.set(forward, back);
    }
    return back;
  }

  stop(): void {
    for (const node of this.sources) {
      try {
        node.stop();
      } catch {
        // already ended
      }
    }
    this.sources = [];
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
  }

  /** Where the ear is, in seconds from the top of the file, or null when stopped. */
  position(): number | null {
    if (!this.playing || !this.ctx) return null;
    return this.passFrom + (this.ctx.currentTime - this.passAt) - this.latency();
  }
}
