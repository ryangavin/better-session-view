/**
 * The transport and the mixer, which are one thing: a Web Audio graph with one
 * gain per stem.
 *
 * ```
 *   AudioBufferSourceNode ─┐
 *   (one per stem, started ├─ GainNode (per stem) ─┬─ master ─ destination
 *    together, sample-locked)                      │
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
 * Nothing in here reads React state. It is a plain object the hook drives,
 * because the audio clock runs whether or not anything re-rendered, and a graph
 * rebuilt on every render is a click every render.
 */

/** How long a level change takes. Short enough to feel instant, long enough not to click. */
const RAMP = 0.015;

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
   * Hand it a decoded set of stems. Replaces whatever was there.
   *
   * Playback stops rather than continuing into a different track's audio, which
   * is what carrying the head across would sound like.
   */
  load(stems: Record<string, AudioBuffer>): void {
    this.stop();
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
  }

  /** Forget everything, and release the buffers. */
  clear(): void {
    this.stop();
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
   * be wrong however badly the page is being scheduled.
   */
  at(): number {
    if (!this.going || !this.ctx) return this.from;
    const gone = this.from + Math.max(0, this.ctx.currentTime - this.since);
    if (!this.duration) return gone;
    if (this.looping) return gone % this.duration;
    return Math.min(gone, this.duration);
  }

  /** Whether the head has run off the end of a track that is not looping. */
  get ended(): boolean {
    return this.going && !this.looping && this.duration > 0 && this.at() >= this.duration;
  }

  get playing(): boolean {
    return this.going;
  }

  /**
   * Drop the sources.
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
  }
}
