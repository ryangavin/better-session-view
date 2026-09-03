/** Stem playback with a click on every beat, for auditioning a beat map. */
import { bandOf, type Band } from '../src/transients.ts';

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
/** The least and the most of the song a scrub plays at each move, in seconds. */
const GRAIN = 0.03;
const GRAIN_MOST = 0.15;

export class Audition {
  private ctx: AudioContext | null = null;
  private readonly cache = new Map<string, Promise<AudioBuffer>>();
  private sources: AudioBufferSourceNode[] = [];
  private timer: number | null = null;
  private passAt = 0;
  private passFrom = 0;
  private span: Span = { from: 0, to: 0 };
  private clicks: Click[] = [];
  private buffers: AudioBuffer[] = [];
  private clicked = 0;
  private scrubbing: { buffers: AudioBuffer[]; at: number } | null = null;
  playing = false;
  /** Whether the pass repeats: a loop region rather than the whole song once. */
  looping = false;
  /** Stems already decoded, by URL, for the page to draw from. */
  readonly have = new Map<string, AudioBuffer>();

  context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  /**
   * Decode a stem once and hold it. A URL with `#low`, `#mid` or `#high` on
   * the end is that band of the stem, as the transient finding heard it.
   */
  buffer(url: string): Promise<AudioBuffer> {
    let got = this.cache.get(url);
    if (!got && /#(low|mid|high)$/.test(url)) {
      const [stem, band] = url.split('#') as [string, Band];
      got = this.buffer(stem).then((whole) => {
        const channels = Array.from({ length: whole.numberOfChannels }, (_, c) => whole.getChannelData(c));
        const heard = this.context().createBuffer(1, whole.length, whole.sampleRate);
        heard.getChannelData(0).set(bandOf(channels, whole.sampleRate, band));
        this.have.set(url, heard);
        return heard;
      });
      this.cache.set(url, got);
    } else if (!got) {
      got = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${url}`);
          return r.arrayBuffer();
        })
        .then((bytes) => this.context().decodeAudioData(bytes))
        .then((buffer) => {
          this.have.set(url, buffer);
          return buffer;
        });
      this.cache.set(url, got);
    }
    return got;
  }

  async start(urls: string[], clicks: Click[], span: Span, from: number): Promise<void> {
    const ctx = this.context();
    await ctx.resume();
    this.buffers = await Promise.all(urls.map((u) => this.buffer(u)));
    this.stop();
    this.clicks = clicks;
    this.span = span;
    this.playing = true;
    this.pass(Math.max(span.from, Math.min(from, span.to - 0.05)), ctx.currentTime + 0.08);
    this.timer = window.setInterval(() => this.tick(), 100);
  }

  /** One run through `[from, span.to]`, sources and clicks scheduled together. */
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

  /**
   * Scrubbing, as an editor does it: a grain of the stems at each position
   * the pointer passes through, and silence when it stops moving. Stops the
   * pass, if one was playing. Starts at once with whatever is decoded; a
   * stem still decoding joins the grains when it is.
   */
  scrubStart(urls: string[], at: number): void {
    void this.context().resume();
    this.stop();
    const scrubbing = { buffers: urls.map((u) => this.have.get(u)).filter((b): b is AudioBuffer => b !== undefined), at };
    this.scrubbing = scrubbing;
    if (scrubbing.buffers.length < urls.length) {
      void Promise.all(urls.map((u) => this.buffer(u))).then((buffers) => {
        if (this.scrubbing === scrubbing) scrubbing.buffers = buffers;
      });
    }
  }

  /**
   * The playhead moved: play what it moved across, so the sound ends where
   * it now stands going forward and starts there going back. A move
   * smaller than a grain plays a grain; a leap plays no more than the most.
   */
  scrubTo(at: number): void {
    if (!this.scrubbing) return;
    const was = this.scrubbing.at;
    const moved = at - was;
    if (Math.abs(moved) < 0.002) return;
    this.scrubbing.at = at;
    const length = Math.min(GRAIN_MOST, Math.max(GRAIN, Math.abs(moved)));
    this.grain(moved > 0 ? at - length : at, length);
  }

  scrubEnd(): void {
    this.scrubbing = null;
  }

  private grain(from: number, length: number): void {
    if (!this.scrubbing) return;
    const ctx = this.context();
    const now = ctx.currentTime;
    for (const buffer of this.scrubbing.buffers) {
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + 0.003);
      gain.gain.setValueAtTime(1, now + length - 0.006);
      gain.gain.linearRampToValueAtTime(0, now + length);
      node.connect(gain).connect(ctx.destination);
      node.start(now, Math.max(0, from), length);
    }
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

  /** Where the playhead is, in seconds from the top of the file, or null when stopped. */
  position(): number | null {
    if (!this.playing || !this.ctx) return null;
    return this.passFrom + (this.ctx.currentTime - this.passAt);
  }
}
