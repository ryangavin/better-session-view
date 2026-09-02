import { passOf, sourceAt, straight, type Pass } from './schedule.ts';
import { channelsOf, stretchOf, type Stretch } from './stretch.ts';
import type { Bars } from './warp.ts';

/**
 * The transport and the mixer, which are one thing: a Web Audio graph with one
 * gain per stem.
 *
 * ```
 *   AudioBufferSourceNode ─┐
 *   (one per stem, started ├─ GainNode (per stem) ─┬─ master ─ destination
 *    together, sample-locked)                      │
 *                                                  │
 *   Stretch ─ splitter ─ merger (per stem) ────────┘
 *   (one worklet node for every stem, when warp is on)
 * ```
 *
 * **Every stem is a source started in the same call, at the same time, from the
 * same offset.** That is what makes the mixer a mixer rather than four players
 * that drift: the clock underneath them is the audio device's, not the wall
 * clock, so muting a stem and unmuting it half a minute later drops it back in
 * exactly where it should be. A fader that had to resynchronise would be a
 * fader you could hear.
 *
 * Which is also why mute is a *gain* and not a stopped source. Stopping one is
 * unrecoverable in Web Audio — a source node cannot be restarted — so it would
 * mean rebuilding the graph mid-playback, and the rebuild is audible.
 *
 * **With warp on, the stems play through one stretcher instead.** The map says
 * where the bars fall on the record and the header says what tempo to play
 * them at; `schedule.ts` turns that into a list of boundaries — read the file
 * from here, this fast, from this moment — and the node is handed them one
 * ahead as the clock reaches each. One node for every stem, twelve channels
 * wide, because one time map cannot come apart from itself; the stems are
 * split back out to their own gains, so mute and solo know nothing about it.
 * The playhead is worked out from the same map on the audio clock, not asked
 * of the node: what was scheduled is what is playing, to the sample.
 *
 * A straight map at its own tempo goes through the plain sources even with
 * warp on. Every rate is one, and a stretcher at a rate of one is not the
 * samples.
 *
 * Nothing in here reads React state. It is a plain object the hook drives,
 * because the audio clock runs whether or not anything re-rendered, and a graph
 * rebuilt on every render is a click every render.
 */

/** How long a level change takes. Short enough to feel instant, long enough not to click. */
const RAMP = 0.015;

/** Beyond the stretcher's own latency, how far ahead a change is scheduled. */
const LEAD = 0.05;

/** How often the stretcher reports in, and so how often the next boundary can go over. */
const TICK = 0.05;

/** A stem's place in the mix. */
export interface Level {
  volume: number;
  muted: boolean;
  soloed: boolean;
}

export const REST: Level = { volume: 0.8, muted: false, soloed: false };

/**
 * What a stem's fader and buttons come to, as one number.
 *
 * Solo is exclusive of mute, not of the other solos: any soloed stem plays, and
 * when none is soloed everything unmuted does. That is Live's rule and the only
 * one that behaves when you hold two of them down.
 *
 * Unity is 0.8 on the fader so there is trim either side of where it rests, and
 * the curve is the fader's position cubed — a linear fader spends most of its
 * travel in the top few decibels and feels dead at the bottom.
 */
export function gainOf(id: string, levels: Record<string, Level>, sources: readonly string[]): number {
  const own = levels[id];
  if (!own) return 0;
  const soloing = sources.some((s) => levels[s]?.soloed);
  const audible = soloing ? own.soloed : !own.muted;
  if (!audible) return 0;
  // 0.8 → 1.0, so the resting position is unity rather than −2 dB.
  return (own.volume / REST.volume) ** 3;
}

/** Everything the window needs to know about where playback is. */
export interface Where {
  /** Seconds from the top of the track. */
  at: number;
  playing: boolean;
}

/**
 * Whether there is a stretcher to play through.
 *
 * `idle` before warp has ever been asked for, `loading` while the worklet is
 * being built and the samples copied over, `failed` where there is none to be
 * had — and then the window plays straight and says why.
 */
export type Stretching = 'idle' | 'loading' | 'ready' | 'failed';

/** Which graph the sound is coming through. */
type Via = 'straight' | 'stretch';

export class Transport {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private gains = new Map<string, GainNode>();
  private playingSources: AudioBufferSourceNode[] = [];
  private buffers = new Map<string, AudioBuffer>();
  /** Where the head was when playback last started, and the clock reading then. */
  private from = 0;
  private since = 0;
  private going = false;
  private looping = true;
  private via: Via = 'straight';

  /** The map, the tempo to play it at, and whether to. */
  private map: Bars | null = null;
  private tempo = 120;
  private warping = false;

  private stretch: Stretch | null = null;
  /** The splitter and mergers between the stretcher and the gains, to take down with it. */
  private wiring: AudioNode[] = [];
  private state: Stretching = 'idle';
  /** Bumped whenever the stems change, so a stretcher built for the last set is dropped on arrival. */
  private generation = 0;
  /** The pass being handed to the stretcher, when it began, and the next boundary to send. */
  private pass: Pass | null = null;
  private passAt = 0;
  private next = 0;
  private done = false;
  private watchers = new Set<() => void>();

  /** Seconds. The longest stem, since they are all the same length by construction. */
  duration = 0;

  /**
   * The graph's context, created on first use rather than at construction.
   *
   * A browser starts an `AudioContext` suspended until a gesture, and building
   * one at module load means a context that has already been refused before
   * anybody pressed anything. Public because decoding happens against it: a
   * buffer decoded in one context and played in another is a resample at best.
   */
  audio(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Whether anything has been loaded to play. */
  get loaded(): boolean {
    return this.buffers.size > 0;
  }

  /**
   * The samples of one stem, for whoever is drawing it.
   *
   * The graph is the holder, and this is how a lane reaches what is in it
   * rather than a second copy being kept beside it. Zoomed far enough in, a
   * waveform is not peaks any more — it is the samples themselves, and the
   * only ones worth drawing are the ones that are going to come out of the
   * speakers.
   */
  stem(id: string): AudioBuffer | null {
    return this.buffers.get(id) ?? null;
  }

  /**
   * The rate everything is at, which is the *context's* and not the file's.
   *
   * `decodeAudioData` resamples to it, so a 44.1 kHz stem in a 48 kHz context
   * is 48 kHz by the time anything can draw it. Zero before the graph has been
   * built, which is also before there is anything to draw.
   */
  get rate(): number {
    return this.ctx?.sampleRate ?? 0;
  }

  /**
   * Hand it a decoded set of stems. Replaces whatever was there.
   *
   * Playback stops rather than continuing into a different track's audio, which
   * is what carrying the head across would sound like. The stretcher goes with
   * the old stems: it holds copies of them, and a node is built for a number
   * of channels.
   */
  load(stems: Record<string, AudioBuffer>): void {
    this.stop();
    this.drop();
    const ctx = this.audio();
    for (const gain of this.gains.values()) gain.disconnect();
    this.gains.clear();
    this.buffers.clear();
    this.duration = 0;
    for (const [id, buffer] of Object.entries(stems)) {
      this.buffers.set(id, buffer);
      this.duration = Math.max(this.duration, buffer.duration);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master!);
      this.gains.set(id, gain);
    }
    this.from = 0;
    if (this.warping) this.prepare();
  }

  /** Forget everything, and release the buffers. */
  clear(): void {
    this.stop();
    this.drop();
    for (const gain of this.gains.values()) gain.disconnect();
    this.gains.clear();
    this.buffers.clear();
    this.duration = 0;
    this.from = 0;
  }

  /** Apply the mix. Cheap enough to call on every fader frame, and ramped so it does not click. */
  apply(levels: Record<string, Level>, sources: readonly string[]): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [id, gain] of this.gains) {
      const want = gainOf(id, levels, sources);
      if (Math.abs(gain.gain.value - want) < 0.0005) continue;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(want, now + RAMP);
    }
  }

  setLoop(on: boolean): void {
    this.looping = on;
    for (const source of this.playingSources) source.loop = on;
    // The stretcher's loop is a boundary at the end of the pass, so what has
    // been sent ahead is re-planned from where the sound will be.
    if (this.going && this.via === 'stretch') this.replan();
  }

  /**
   * What to play the map at, and whether to.
   *
   * Called on every change to the grid or the tempo, playing or not. Playing,
   * the sound is re-planned from where it will be when the change lands —
   * seamlessly through the stretcher, since a change is a schedule and not a
   * rebuild; with a short gap where the sound has to move between graphs.
   * Nothing happens at all while the plain sources are playing and would go
   * on playing, which is the common case and the one that must not click.
   */
  warp(map: Bars | null, tempo: number, on: boolean): void {
    const before = this.desired();
    const at = this.going && this.ctx ? this.positionAt(this.ctx.currentTime + this.lead()) : 0;
    this.map = map;
    this.tempo = tempo;
    this.warping = on;
    if (on) this.prepare();
    if (!this.going || !this.ctx) return;
    const after = this.desired();
    if (after === 'stretch') this.playStretched(at, this.ctx.currentTime + this.lead());
    else if (before !== after) this.playStraight(this.at());
  }

  /** Whether there is a stretcher, and if not, why not yet. */
  get stretching(): Stretching {
    return this.state;
  }

  /** Whether what is playing is coming through the stretcher. */
  get stretched(): boolean {
    return this.going && this.via === 'stretch';
  }

  /** Hear about the stretcher arriving or failing. Returns the way to stop hearing. */
  watch(hear: () => void): () => void {
    this.watchers.add(hear);
    return () => void this.watchers.delete(hear);
  }

  /**
   * Start every stem at once, from `at` seconds.
   *
   * One `start` call per source with the same `when`, so the device schedules
   * them on the same sample. Starting them in a loop with no `when` would put
   * each one wherever the main thread happened to be, which is a few
   * milliseconds of flam between the kick and the bass.
   */
  play(at = this.at()): void {
    const ctx = this.audio();
    void ctx.resume();
    if (this.desired() === 'stretch') this.playStretched(at, ctx.currentTime + this.lead());
    else this.playStraight(at);
  }

  /** Stop where you are. */
  pause(): void {
    if (!this.going) return;
    this.from = this.at();
    this.halt();
    this.going = false;
  }

  /** Stop and go back to the top. */
  stop(): void {
    this.halt();
    this.going = false;
    this.from = 0;
  }

  /**
   * Move the head. Playing carries on from there rather than stopping, which is
   * what makes clicking in a lane a scrub rather than a stop-and-restart.
   */
  seek(at: number): void {
    const to = Math.max(0, Math.min(at, this.duration));
    if (this.going) this.play(to);
    else this.from = to;
  }

  /**
   * Where the head is, in seconds — read off the audio clock rather than
   * counted on the wall clock.
   *
   * `requestAnimationFrame` misses frames and a tab in the background stops
   * getting them entirely, so a playhead that accumulated deltas would drift
   * away from the sound. This is the sound's own position, so the line cannot
   * be wrong however badly the page is being scheduled — through the
   * stretcher as much as through the sources, because what it is playing is
   * what was scheduled, and the schedule is a function of the clock.
   */
  at(): number {
    if (!this.going || !this.ctx) return this.from;
    return this.positionAt(this.ctx.currentTime);
  }

  /** Whether the head has run off the end of a track that is not looping. */
  get ended(): boolean {
    return this.going && !this.looping && this.duration > 0 && this.at() >= this.duration;
  }

  get playing(): boolean {
    return this.going;
  }

  /** Where the sound will be at a moment on the clock, on whichever graph it is on. */
  private positionAt(when: number): number {
    if (this.via === 'stretch' && this.map) {
      return sourceAt(this.map, this.tempo, this.from, when - this.since, this.looping);
    }
    const gone = this.from + Math.max(0, when - this.since);
    if (!this.duration) return gone;
    if (this.looping) return gone % this.duration;
    return Math.min(gone, this.duration);
  }

  /** Which graph the sound should be on, given what has been asked for and what there is. */
  private desired(): Via {
    return this.warping && this.map && this.stretch && !straight(this.map, this.tempo)
      ? 'stretch'
      : 'straight';
  }

  /** How far ahead the stretcher needs a change to be. */
  private lead(): number {
    return (this.stretch?.latency ?? 0) + LEAD;
  }

  private playStraight(at: number): void {
    const ctx = this.audio();
    this.halt();
    const when = ctx.currentTime + 0.02;
    const offset = Math.max(0, Math.min(at, Math.max(0, this.duration - 0.01)));
    for (const [id, buffer] of this.buffers) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = this.looping;
      source.loopStart = 0;
      source.loopEnd = this.duration;
      source.connect(this.gains.get(id)!);
      source.start(when, offset);
      this.playingSources.push(source);
    }
    this.from = offset;
    this.since = when;
    this.going = true;
    this.via = 'straight';
  }

  /**
   * Play from `at` seconds through the stretcher, starting at `when` on the
   * clock.
   *
   * One change goes over now — filed at the present, so anything queued for
   * the future is dropped — and the rest of the pass follows one boundary at
   * a time as each is reached. `from` and `since` are the origin the playhead
   * is worked out from, and stay put across a loop: the maths wraps.
   */
  private playStretched(at: number, when: number): void {
    const ctx = this.audio();
    const stretch = this.stretch!;
    const map = this.map!;
    this.halt();
    const offset = Math.max(0, Math.min(at, this.duration));
    this.pass = passOf(map, this.tempo, offset);
    this.passAt = when;
    this.next = 1;
    this.done = false;
    const first = this.pass.boundaries[0];
    void stretch.node.schedule({
      outputTime: ctx.currentTime,
      output: when,
      active: true,
      input: first.input,
      rate: first.rate,
      loopStart: 0,
      loopEnd: 0,
    });
    this.from = offset;
    this.since = when;
    this.going = true;
    this.via = 'stretch';
    this.tick();
  }

  /** Re-plan the stretched sound from where it will be when the new plan lands. */
  private replan(): void {
    if (!this.ctx) return;
    const when = this.ctx.currentTime + this.lead();
    this.playStretched(this.positionAt(when), when);
  }

  /**
   * Send the next boundary once the last has begun.
   *
   * One ahead, never more: the node keeps what it is given and drops what is
   * filed after a new change, so a boundary goes over only once the one
   * before it is playing, filed at its own time so it queues behind rather
   * than replaces. Driven by the node's own update messages rather than a
   * timer, because a hidden window's timers are throttled and a boundary
   * that lands late is a jump in the sound.
   */
  private tick(): void {
    if (!this.going || this.via !== 'stretch' || !this.ctx || !this.stretch || !this.pass || !this.map) {
      return;
    }
    const now = this.ctx.currentTime;
    const node = this.stretch.node;
    for (let guard = 0; guard < 64; guard++) {
      const { boundaries, length } = this.pass;
      const begun = (i: number) => now >= this.passAt + boundaries[i].output;
      if (this.next < boundaries.length) {
        if (!begun(this.next - 1)) return;
        const boundary = boundaries[this.next];
        const at = this.passAt + boundary.output;
        void node.schedule({ outputTime: at, output: at, input: boundary.input, rate: boundary.rate, active: true });
        this.next++;
        continue;
      }
      if (this.done || !begun(boundaries.length - 1)) return;
      const end = this.passAt + length;
      if (this.looping) {
        const pass = passOf(this.map, this.tempo, 0);
        const first = pass.boundaries[0];
        void node.schedule({ outputTime: end, output: end, input: first.input, rate: first.rate, active: true });
        this.pass = pass;
        this.passAt = end;
        this.next = 1;
        continue;
      }
      void node.schedule({ outputTime: end, output: end, active: false });
      this.done = true;
      return;
    }
  }

  /**
   * Build the stretcher for the stems there are, once.
   *
   * Asynchronous, and long enough to matter: the samples are copied — a
   * four-minute stem is ninety megabytes — and resampled where the graph's
   * rate is not the file's. If the stems change underneath it, what it built
   * is dropped rather than wired to gains that no longer exist; if it fails,
   * the window plays straight and says so.
   */
  private prepare(): void {
    if (this.stretch || this.state === 'loading' || this.state === 'failed') return;
    if (!this.ctx || this.buffers.size === 0) return;
    const ctx = this.ctx;
    const generation = this.generation;
    const ids = [...this.buffers.keys()];
    this.state = 'loading';
    this.notify();
    void (async () => {
      let got: Stretch | null = null;
      try {
        const channels = await channelsOf(ctx, ids.map((id) => this.buffers.get(id)!));
        got = await stretchOf(ctx, channels.length);
        if (!got) throw new Error('no stretcher');
        if (generation !== this.generation) return;
        await got.node.addBuffers(channels, channels.map((c) => c.buffer));
        if (generation !== this.generation) return;
        const splitter = ctx.createChannelSplitter(channels.length);
        got.node.connect(splitter);
        this.wiring = [splitter];
        ids.forEach((id, i) => {
          const merger = ctx.createChannelMerger(2);
          splitter.connect(merger, 2 * i, 0);
          splitter.connect(merger, 2 * i + 1, 1);
          merger.connect(this.gains.get(id)!);
          this.wiring.push(merger);
        });
        void got.node.setUpdateInterval(TICK, () => this.tick());
        this.stretch = got;
        this.state = 'ready';
        got = null;
        if (this.going && this.warping) this.warp(this.map, this.tempo, this.warping);
      } catch {
        if (generation === this.generation) this.state = 'failed';
      } finally {
        if (got) got.node.disconnect();
        if (generation === this.generation && this.state === 'loading') this.state = 'idle';
        this.notify();
      }
    })();
  }

  /** Take the stretcher down, and let go of its copies of the stems. */
  private drop(): void {
    this.generation++;
    if (this.stretch) {
      void this.stretch.node.schedule({ active: false });
      void this.stretch.node.dropBuffers();
      this.stretch.node.disconnect();
      this.stretch = null;
    }
    for (const node of this.wiring) node.disconnect();
    this.wiring = [];
    this.pass = null;
    this.state = 'idle';
    this.notify();
  }

  private notify(): void {
    for (const hear of this.watchers) hear();
  }

  /**
   * Drop the sources, and quiet the stretcher.
   *
   * `onended` is cleared first: a stopped source fires it, and a handler that
   * meant "the track finished" would hear every pause and every seek as one.
   */
  private halt(): void {
    for (const source of this.playingSources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped. Nothing to do, and nothing worth saying.
      }
      source.disconnect();
    }
    this.playingSources = [];
    if (this.via === 'stretch' && this.stretch && this.ctx) {
      const now = this.ctx.currentTime;
      void this.stretch.node.schedule({ outputTime: now, output: now, active: false });
    }
    this.pass = null;
  }
}
