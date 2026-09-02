import type { Peak } from './audio.ts';

/**
 * Where the drums hit, to the millisecond.
 *
 * A grid is judged in single milliseconds, and the envelope the fit used to
 * listen to was made of twelve-millisecond columns: the loudest sample in
 * each, and a hit placed wherever its attack happened to fall inside one. On
 * a record made to a click that put the kicks a whole column either side of
 * the line. Splitting the columns finer did not help — a finer envelope of
 * the same kind is more wobbles, and every wobble a local maximum — because
 * what was missing was not resolution but a detector.
 *
 * This is one: a **rolling window**, not a column. Every sample goes through
 * three band filters, each band is rectified and followed by an envelope with
 * a one-millisecond attack and a thirty-millisecond release, and that envelope
 * is read every sixty-four samples — a millisecond and a half. A transient
 * is where the envelope *climbs*: the rise in decibels over the last five
 * milliseconds, peak-picked against a threshold that follows the local level,
 * with no two closer than forty milliseconds in one band. The moment reported
 * is where the envelope had climbed a fifth of the way — the *start* of the
 * attack, not its peak — and it is then found again to the exact sample
 * against the raw audio, by running the band's filter and follower over the
 * few milliseconds around it. A fifth of the way is a ratio, so a quiet hit
 * and a loud one are timed the same.
 *
 * **Bleed is dropped; a kick under a hat is not.** A kick has a click and a
 * hat has a thump, so a single stroke shows up faintly in bands it does not
 * belong to. A snare or a hat within a few milliseconds of another drum twice
 * as loud in its own band is that drum leaking, and goes; a kick only if it
 * is four times outdone, because a quiet kick under a loud hat is the
 * commonest thing in music. So a hat is a hat and not also a faint snare — which is
 * what lets the tempo ask what the *snare* did without the hats answering
 * for it — and a kick with a hat on it is still a kick.
 *
 * **Three bands, because the beat is not in the kick alone.** The kick band
 * is a hundred and twenty hertz of low-pass, as before; the snare is what is
 * left between two hundred and two and a half thousand; the hats are what is
 * above four. What the kick does at the beat, the snare on two and four and
 * the hats between them is the whole of the evidence for which pulse is the
 * beat, and it is all here for `tempo.ts` to ask.
 */

export type Band = 'low' | 'mid' | 'high';

/** One hit: when, how sharply and how loud against the band's loudest, and in which band. */
export interface Transient {
  /** Seconds from the top of the file. */
  at: number;
  /** The exact sample, at the rate the file was heard at. */
  sample: number;
  /** 0 to 1, against the strongest rise in the same band: how sharply it stood up. */
  strength: number;
  /** 0 to 1, against the band's loudest: how loud it got. */
  level: number;
  band: Band;
}

/** What the fit listens to: every hit in the file, in order, and how long the file is. */
export interface Heard {
  seconds: number;
  /** Samples per second, which is what a transient's sample counts in. */
  rate: number;
  transients: readonly Transient[];
}

/** Samples between readings of the envelope. About a millisecond and a half at 44.1k. */
const HOP = 64;

/** Where the kick is and the snare, mostly, is not. */
const KICK = 120;
/** The snare's body and crack, between the kick and the hats. */
const SNARE_FROM = 200;
const SNARE_TO = 2500;
/** Above which is hats and cymbals. */
const HATS = 4000;

/** How fast the follower rises, and how fast it falls, in seconds. */
const ATTACK = 0.001;
const RELEASE = 0.03;

/** Over how long a rise is measured. A drum's attack is a couple of milliseconds. */
const CLIMB = 0.005;
/** No two transients closer than this in one band: a flam is one hit, and a roll is one hit per stroke. */
const APART = 0.04;
/** The threshold follows the local level over this much either side. */
const AROUND = 0.1;
/** The least a rise may be, in nepers over the climb, and how far over the local median it must stand. */
const LEAST = 0.4;
const OVER = 1.5;
/** Under this share of the band's loudest, a rise is bleed or noise, however sharp. */
const FAINT = 0.03;
/** How far up its climb a hit is timed at: the start of the attack. */
const ONSET = 0.2;
/**
 * How long each band's filter holds a hit back, in seconds, taken off again.
 * Three one-poles delay by three time constants: four milliseconds at a
 * hundred and twenty hertz, next to nothing at two and a half thousand, and
 * the high band is what a filter *leaves*, so it is not delayed at all.
 */
const LAG: Record<Band, number> = {
  low: 3 / (2 * Math.PI * KICK),
  mid: 3 / (2 * Math.PI * SNARE_TO),
  high: 0,
};
/** Hits within this of each other across bands are one stroke. */
const TOGETHER = 0.006;
/** A snare or hat coinciding with a hit twice as loud in another band is that hit's bleed; a kick has to be four times outdone. */
const BLEED = 0.5;
const BLEED_LOW = 0.25;

/** The three band envelopes, sampled at a hop. */
export interface Envelopes {
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  /** Seconds per frame. */
  per: number;
}

/** The coefficient of a one-pole low-pass at a frequency. */
const poleOf = (hz: number, rate: number): number => 1 - Math.exp((-2 * Math.PI * hz) / rate);

/**
 * One band's filter and follower, a sample at a time.
 *
 * One-poles rather than biquads, three in series where a slope is wanted: a
 * slope has no resonance and no coefficients to get wrong. The mid band is
 * the difference of two low-passes; the high band is what a low-pass leaves.
 * The follower rises in a millisecond and falls in thirty, which is the shape
 * a drum has.
 */
class Follower {
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  env = 0;
  private readonly band: Band;
  private readonly lo: number;
  private readonly hi: number;
  private readonly up: number;
  private readonly down: number;

  constructor(band: Band, rate: number) {
    this.band = band;
    this.lo = poleOf(band === 'low' ? KICK : band === 'mid' ? SNARE_FROM : HATS, rate);
    this.hi = poleOf(band === 'mid' ? SNARE_TO : 0, rate);
    this.up = 1 - Math.exp(-1 / (ATTACK * rate));
    this.down = 1 - Math.exp(-1 / (RELEASE * rate));
  }

  /** The follower after this sample. */
  step(x: number): number {
    this.a1 += this.lo * (x - this.a1);
    this.a2 += this.lo * (this.a1 - this.a2);
    this.a3 += this.lo * (this.a2 - this.a3);
    let y: number;
    if (this.band === 'low') y = this.a3;
    else if (this.band === 'high') y = x - this.a1;
    else {
      this.b1 += this.hi * (x - this.b1);
      this.b2 += this.hi * (this.b1 - this.b2);
      this.b3 += this.hi * (this.b2 - this.b3);
      y = this.b3 - this.a3;
    }
    const size = y < 0 ? -y : y;
    this.env += (size > this.env ? this.up : this.down) * (size - this.env);
    return this.env;
  }
}

/** The channels summed at one sample: a hit is a hit whichever side it is panned. */
const mixed = (channels: readonly Float32Array[], s: number): number => {
  let x = 0;
  for (let c = 0; c < channels.length; c++) x += channels[c][s];
  return x;
};

/** The three bands of a stem, followed, from one walk of the samples. */
export function envelopesOf(channels: readonly Float32Array[], rate: number): Envelopes | null {
  if (channels.length === 0) return null;
  const frames = Math.floor(channels[0].length / HOP);
  if (frames < 64) return null;

  const low = new Float32Array(frames);
  const mid = new Float32Array(frames);
  const high = new Float32Array(frames);
  const followers = [new Follower('low', rate), new Follower('mid', rate), new Follower('high', rate)];
  const out = [low, mid, high];

  for (let i = 0; i < frames; i++) {
    const start = i * HOP;
    let peakLow = 0;
    let peakMid = 0;
    let peakHigh = 0;
    for (let s = start; s < start + HOP; s++) {
      const x = mixed(channels, s);
      const eLow = followers[0].step(x);
      const eMid = followers[1].step(x);
      const eHigh = followers[2].step(x);
      if (eLow > peakLow) peakLow = eLow;
      if (eMid > peakMid) peakMid = eMid;
      if (eHigh > peakHigh) peakHigh = eHigh;
    }
    out[0][i] = peakLow;
    out[1][i] = peakMid;
    out[2][i] = peakHigh;
  }
  return { low, mid, high, per: HOP / rate };
}

/** How far back the refinement starts the filter before a hit, so it has settled by the time it gets there. */
const WARM = 0.05;
/** How far before a hit the quiet is looked for, and how far after it the peak. */
const BEFORE = 0.02;
const AFTER = 0.015;

/**
 * A hit found again to the exact sample.
 *
 * The frames placed it to a millisecond and a half; this runs the band's own
 * filter and follower over the audio around it and reads off the first
 * sample at which the follower had climbed a fifth of the way from the
 * quietest it was in the twenty milliseconds before the hit to the loudest
 * it got in the fifteen after. Fixed windows, so two strokes of one drum are
 * timed by the same rule whatever frame each fell in. The filter starts fifty
 * milliseconds early so its state has settled, which is the whole cost.
 */
export function exactly(channels: readonly Float32Array[], rate: number, hit: Transient): number {
  const length = channels[0].length;
  // The hit's time already has the filter's lag taken off; the filter's own
  // trace has not, so the windows sit a lag later than the hit does.
  const lag = LAG[hit.band];
  const start = Math.max(0, Math.floor((hit.at + lag - BEFORE) * rate));
  const from = Math.max(0, Math.floor((hit.at + lag - BEFORE - WARM) * rate));
  const to = Math.min(length - 1, Math.ceil((hit.at + lag + AFTER) * rate));
  if (to <= start) return hit.sample;
  const follower = new Follower(hit.band, rate);
  const trace = new Float32Array(to - start + 1);
  let quiet = Infinity;
  let loud = 0;
  for (let s = from; s <= to; s++) {
    const env = follower.step(mixed(channels, s));
    if (s >= start) {
      trace[s - start] = env;
      if (env < quiet) quiet = env;
      if (env > loud) loud = env;
    }
  }
  if (!(loud > quiet)) return hit.sample;
  const want = quiet + ONSET * (loud - quiet);
  // From the quietest sample forward, so a tail still falling from the last
  // hit is not read as this one climbing.
  let lowest = 0;
  for (let i = 1; i < trace.length; i++) if (trace[i] < trace[lowest]) lowest = i;
  for (let i = lowest; i < trace.length; i++) {
    if (trace[i] >= want) return Math.max(0, start + i - Math.round(lag * rate));
  }
  return hit.sample;
}

/**
 * The transients in one band's envelope.
 *
 * The rise is measured in nepers — the log of the envelope now over the log
 * of it a climb ago — so a quiet verse and a loud chorus are judged by the
 * same yardstick, and a hit is a hit for how sharply it stood up rather than
 * for how loud the record was. The floor under the log is a hundredth of the
 * band's loudest, so silence does not climb by rounding.
 */
export function transientsIn(level: Float32Array, per: number, band: Band, rate = 1 / per): Transient[] {
  const n = level.length;
  let loudest = 0;
  for (let i = 0; i < n; i++) if (level[i] > loudest) loudest = level[i];
  if (loudest <= 0) return [];
  const floor = loudest * 0.01;

  const climb = Math.max(1, Math.round(CLIMB / per));
  const rise = new Float32Array(n);
  for (let i = climb; i < n; i++) {
    const now = Math.log(level[i] + floor);
    const then = Math.log(level[i - climb] + floor);
    rise[i] = now > then ? now - then : 0;
  }

  // The threshold: a fixed least, plus a multiple of the local median of the
  // rise, taken over a window either side. A median rather than a mean
  // because the hits themselves must not lift the bar they are judged
  // against.
  const half = Math.max(1, Math.round(AROUND / per));
  const median = new Float32Array(n);
  const window: number[] = [];
  const sorted: number[] = [];
  const insert = (v: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sorted[m] < v) lo = m + 1;
      else hi = m;
    }
    sorted.splice(lo, 0, v);
  };
  const remove = (v: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sorted[m] < v) lo = m + 1;
      else hi = m;
    }
    if (sorted[lo] === v) sorted.splice(lo, 1);
  };
  let right = 0;
  for (let i = 0; i < n; i++) {
    while (right < n && right <= i + half) {
      window.push(rise[right]);
      insert(rise[right]);
      right++;
    }
    while (window.length > 0 && right - window.length < i - half) {
      remove(window.shift()!);
    }
    median[i] = sorted[sorted.length >> 1] ?? 0;
  }

  const near = Math.max(1, Math.round(0.01 / per));
  const apart = Math.max(1, Math.round(APART / per));
  const out: Transient[] = [];
  let lastFrame = -Infinity;
  let lastIndex = -1;
  for (let i = climb; i < n - 1; i++) {
    const r = rise[i];
    if (r < LEAST + OVER * median[i]) continue;
    let peak = true;
    for (let j = Math.max(0, i - near); j <= Math.min(n - 1, i + near); j++) {
      if (j !== i && (rise[j] > r || (rise[j] === r && j < i))) {
        peak = false;
        break;
      }
    }
    if (!peak) continue;
    // Where the climb crossed half way: from the quietest frame in the climb
    // behind the peak to the loudest just after it, the first frame at or
    // over the midpoint, placed between it and the one before by the line
    // through them. The peak of the rise is a plateau as wide as the climb,
    // and a plateau's middle is a frame boundary; a crossing is a moment.
    let quiet = i - climb;
    for (let j = i - climb; j <= i; j++) if (level[j] < level[quiet]) quiet = j;
    let loud = quiet;
    for (let j = quiet; j <= Math.min(n - 1, i + climb); j++) if (level[j] > level[loud]) loud = j;
    if (level[loud] < loudest * FAINT) continue;
    const want = level[quiet] + ONSET * (level[loud] - level[quiet]);
    let cross = loud;
    for (let j = quiet + 1; j <= loud; j++) {
      if (level[j] >= want) {
        cross = j;
        break;
      }
    }
    const below = level[cross - 1];
    const above = level[cross];
    const part = above > below ? (want - below) / (above - below) : 0;
    const frame = cross - 1 + Math.max(0, Math.min(1, part));
    const at = Math.max(0, frame * per - LAG[band]);
    const found: Transient = {
      at,
      sample: Math.round(at * rate),
      strength: r,
      level: level[loud] / loudest,
      band,
    };
    if (frame - lastFrame < apart) {
      if (lastIndex >= 0 && r > out[lastIndex].strength) {
        out[lastIndex] = found;
        lastFrame = frame;
      }
      continue;
    }
    out.push(found);
    lastIndex = out.length - 1;
    lastFrame = frame;
  }

  // Against the band's strongest rises rather than its single strongest, so
  // one freak hit does not make every other one faint. Rounded up, so a band
  // with a handful of hits is scaled by its loudest and not its middle one.
  const rises = out.map((t) => t.strength).sort((x, y) => x - y);
  const scale = rises[Math.ceil(0.95 * (rises.length - 1))] || 1;
  for (const t of out) t.strength = Math.min(1, t.strength / scale);
  return out;
}

/**
 * Every stroke of every band, in order, with the bleed between bands taken
 * out: within a few milliseconds of a hit, anything under half its level is
 * the same stroke leaking into a band it does not belong to.
 */
export function transientsOf(envelopes: Envelopes, rate: number): Transient[] {
  const all = [
    ...transientsIn(envelopes.low, envelopes.per, 'low', rate),
    ...transientsIn(envelopes.mid, envelopes.per, 'mid', rate),
    ...transientsIn(envelopes.high, envelopes.per, 'high', rate),
  ];
  all.sort((a, b) => a.at - b.at);
  const out: Transient[] = [];
  let i = 0;
  while (i < all.length) {
    let j = i + 1;
    while (j < all.length && all[j].at - all[i].at < TOGETHER) j++;
    const cluster = all.slice(i, j);
    for (const hit of cluster) {
      // A snare or a hat goes if another drum struck at the same moment stood
      // twice as high in its own band; a kick only if four times, because a
      // quiet kick under a loud hat is the commonest thing in music and a
      // hat's thump in the kick band is faint.
      const factor = hit.band === 'low' ? BLEED_LOW : BLEED;
      const bleed = cluster.some((other) => other.band !== hit.band && other.level * factor >= hit.level);
      if (!bleed) out.push(hit);
    }
    i = j;
  }
  return out;
}

/**
 * What to listen to: the drums if they have been decoded, the bass if there
 * are no drums, and the drawn peaks if neither is to hand.
 *
 * The peaks are the fallback and a poor one — twenty-seven milliseconds a
 * column and no bands — but it is what there is before the audio has
 * arrived, and all a browser session with no app around it has.
 */
export function hearing(
  peaks: Record<string, readonly Peak[]>,
  seconds: number,
  rate: number,
  stem?: (id: string) => AudioBuffer | null,
): Heard | null {
  const buffer = stem?.('drums') ?? stem?.('bass') ?? null;
  if (buffer) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
      buffer.getChannelData(c),
    );
    const heard = heardIn(channels, buffer.sampleRate);
    if (heard) return heard;
  }
  return fromPeaks(peaks, seconds, rate);
}

/** Every stroke in a set of channels, each to the exact sample. */
export function heardIn(channels: readonly Float32Array[], rate: number): Heard | null {
  const envelopes = envelopesOf(channels, rate);
  if (!envelopes) return null;
  const transients = transientsOf(envelopes, rate).map((hit) => {
    const sample = exactly(channels, rate, hit);
    return { ...hit, at: sample / rate, sample };
  });
  transients.sort((a, b) => a.at - b.at);
  return { seconds: channels[0].length / rate, rate, transients };
}

/** The fallback: one band, read off the drawn peaks. */
export function fromPeaks(peaks: Record<string, readonly Peak[]>, seconds: number, rate: number): Heard | null {
  const source = peaks.drums ?? peaks.bass ?? null;
  const columns = source ? source.length : 0;
  if (columns < 64 || !(seconds > 0)) return null;
  const level = new Float32Array(columns);
  for (let i = 0; i < columns; i++) {
    const peak = source![i];
    level[i] = Math.max(Math.abs(peak.max), Math.abs(peak.min));
  }
  return { seconds, rate, transients: transientsIn(level, seconds / columns, 'mid', rate) };
}
