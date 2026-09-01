import { energyOf } from './audio.ts';
import type { Peak } from './audio.ts';

/**
 * Where the bars fall on a file, and how they are fitted to it.
 *
 * Two things that have to live together. A grid is a *tempo and a downbeat* —
 * one number says how long a bar is and the other says where the first one
 * starts — and until this file existed the window only had the first of them.
 * Bar 1 was the top of the file by construction, so a song with a quarter of a
 * second of air in front of it could not be gridded at all: every line was that
 * quarter second late, for the whole song, and no tempo would fix it.
 *
 * **The bar count is not the map.** It used to be: the lanes drew `bars` bars
 * across the width of the file and that was the grid. That silently rounded the
 * tempo, because the count is a `ceil` — a two-hundred-second track at 128
 * holds 106.67 bars, was drawn as 107, and so was ruled at 128.4 BPM. Half a
 * bar of drift by the end of the song, from the ruler rather than from the
 * audio, on the one strip whose whole job is to show drift. `Bars` is the map
 * instead: a linear one, and the count is derived from it rather than the other
 * way round.
 */

/** Where the bars of a grid fall on a file. */
export interface Bars {
  /** The bar the file starts on. Negative when bar 1 begins after the top of it. */
  origin: number;
  /** How many bars the whole file spans, unrounded. */
  across: number;
}

/** The grid a tempo and a downbeat make, over a file of a given length. */
export const barsOf = (seconds: number, bpm: number, offset: number): Bars => ({
  origin: (-offset * bpm) / 240,
  across: (seconds * bpm) / 240,
});

/** The bar at a fraction of the file. */
export const barAt = (bars: Bars, place: number): number => bars.origin + place * bars.across;

/** Where a bar falls, as a fraction of the file. */
export const placeOf = (bars: Bars, bar: number): number =>
  bars.across > 0 ? (bar - bars.origin) / bars.across : 0;

/**
 * How many bars the song holds, counting bar 1 as the first.
 *
 * A count rather than a measurement — what the slices are spread over and what
 * the export writes down. Nothing draws with it.
 */
export const countOf = (bars: Bars): number => Math.max(1, Math.ceil(bars.origin + bars.across));

/** A tempo, as a number somebody reads. Integers stay integers. */
export const bpmText = (bpm: number): string =>
  Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);

/** The slowest and fastest tempo a fit will claim. */
export const SLOWEST = 70;
export const FASTEST = 190;

/**
 * Where the fit leans when two tempos an octave apart explain the audio equally
 * well, and how far it leans.
 *
 * Autocorrelation cannot tell a beat from a half-note: a pulse every 0.47s
 * correlates with itself at 0.94s just as strongly. Nothing in the *kick* alone
 * settles that, so two things outside it do — the rest of the kit, below, and
 * failing that a preference for the tempo a person would have counted.
 * Eight-tenths of an octave is wide enough that 174 and 90 both survive it.
 */
const PREFERRED = 125;
const OCTAVE = 0.8;

/**
 * Under this, a tempo is suspected of being half of the real one, and the rest
 * of the kit is asked.
 *
 * Ninety-five, because that is where the two readings stop overlapping: a song
 * genuinely at 90 and a song at 180 heard half-speed both land here, and the
 * question *is the midpoint as busy as the beat* separates them. Above it there
 * is nothing to ask — doubling would leave the range.
 */
const HALVED = 95;

/**
 * Below this share of the hits landing on the grid there is nothing to lock to.
 *
 * A quarter is what luck alone scores: the window a hit counts as *on the grid*
 * in is a quarter of a beat wide, so a track of pure noise sits at 0.25 and any
 * floor under that refuses nothing. Four-tenths is clear of chance and still
 * well under what loose, hand-played drums manage.
 */
const HOPELESS = 0.4;

/** Samples to a column of an envelope. About twelve milliseconds at 44.1k. */
const HOP = 512;

/**
 * Where the kick is and the snare, mostly, is not.
 *
 * A kick's fundamental is forty to eighty hertz and its body is under a
 * hundred and fifty; a snare's is two hundred up, over a crack an octave above
 * that. One hundred and twenty with three poles under it — eighteen decibels an
 * octave — leaves the kick alone and takes twenty off the snare sharing the
 * lane with it.
 */
const KICK = 120;

/** An envelope to fit a grid to: how loud per column, and how long a column is. */
export interface Pulse {
  level: Float32Array;
  /** Seconds per column. */
  per: number;
}

/**
 * What a fit listens to.
 *
 * Two envelopes of one stem, because the two questions want different bands.
 * **The tempo comes off the kick**, which is the most regular thing in almost
 * any produced track — it is a short, loud, low event that repeats, which is
 * exactly what a period is easiest to measure from, and taking the snare and
 * the hats off it removes most of what a fit can trip over. **Whether that
 * tempo is the whole of the tempo comes off the rest of the kit**, because a
 * kick on one and three is the same evidence as a kick on every beat at half
 * the speed, and only the snare between them says which.
 */
export interface Heard {
  low: Pulse;
  wide: Pulse;
}

/** A tempo and a downbeat, fitted to what the audio did. */
export interface Fit {
  bpm: number;
  /** Seconds from the top of the file to the downbeat of bar 1. */
  offset: number;
  /**
   * The share of the onset strength that lands within an eighth of a beat of a
   * grid line, 0 to 1.
   *
   * Reported rather than a confidence score, because it is a thing that can be
   * checked: it is exactly what the warp lane draws, counted. A number nobody
   * can verify against the picture would be worse than none.
   */
  agreement: number;
}

/** One rise in the audio: where it was, in columns, and how big against the biggest. */
interface Hit {
  at: number;
  weight: number;
}

/** A beat of the grid that found a hit under it. */
interface Beat {
  k: number;
  at: number;
  weight: number;
}

/** Where a beat grid sits, in columns. */
interface Line {
  first: number;
  period: number;
}

/**
 * The kick band and the whole kit, from one walk of the samples.
 *
 * One walk because a stem is tens of millions of samples and two passes over it
 * is two passes over it. The filter is three one-poles in series rather than a
 * biquad: it is a slope, not a shape, and a slope wants no resonance and no
 * coefficients to get wrong.
 *
 * The envelope is the loudest sample in each column, not the mean of them. A
 * kick's attack is a couple of milliseconds inside a twelve-millisecond column,
 * and a mean is a picture of how long a hit rang for rather than of when it
 * started.
 */
export function bandsOf(channels: readonly Float32Array[], rate: number): Heard | null {
  if (channels.length === 0) return null;
  const columns = Math.floor(channels[0].length / HOP);
  if (columns < 64) return null;

  const low = new Float32Array(columns);
  const wide = new Float32Array(columns);
  const a = 1 - Math.exp((-2 * Math.PI * KICK) / rate);
  let p1 = 0;
  let p2 = 0;
  let p3 = 0;

  for (let i = 0; i < columns; i++) {
    const from = i * HOP;
    let loud = 0;
    let band = 0;
    for (let s = from; s < from + HOP; s++) {
      let x = 0;
      for (let c = 0; c < channels.length; c++) x += channels[c][s];
      p1 += a * (x - p1);
      p2 += a * (p1 - p2);
      p3 += a * (p2 - p3);
      const size = x < 0 ? -x : x;
      if (size > loud) loud = size;
      const under = p3 < 0 ? -p3 : p3;
      if (under > band) band = under;
    }
    low[i] = band;
    wide[i] = loud;
  }

  const per = HOP / rate;
  return { low: { level: low, per }, wide: { level: wide, per } };
}

/**
 * The fallback: the peak columns the lanes were drawn from.
 *
 * Coarser by a factor of two, and one band rather than two — which is to say
 * the kick is in there with everything else. It is what there is before the
 * stems have been decoded, and it is what a browser session with no app around
 * it has at all.
 */
export function columnsOf(peaks: Record<string, readonly Peak[]>, seconds: number): Heard | null {
  const energy = energyOf(peaks);
  if (energy.length < 64 || !(seconds > 0)) return null;
  const pulse: Pulse = { level: energy, per: seconds / energy.length };
  return { low: pulse, wide: pulse };
}

/**
 * What to fit to: the drums if they have been decoded, the bass if there are no
 * drums, and the drawn peaks if neither is to hand.
 *
 * The order is the order of how much a grid can be read off a thing. A bass
 * line is on the beat far more often than it is not, and it is the only other
 * stem where that is true.
 */
export function hearing(
  peaks: Record<string, readonly Peak[]>,
  seconds: number,
  stem?: (id: string) => AudioBuffer | null,
): Heard | null {
  const buffer = stem?.('drums') ?? stem?.('bass') ?? null;
  if (buffer) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
      buffer.getChannelData(c),
    );
    const heard = bandsOf(channels, buffer.sampleRate);
    if (heard) return heard;
  }
  return columnsOf(peaks, seconds);
}

/**
 * Onset strength per column: the rise in energy, less the rise around it.
 *
 * The subtraction is what makes the rest of this work. A raw difference is
 * dominated by whatever the loudest section of the song is doing, so a chorus
 * out-votes a whole verse and the fit is really a fit to thirty seconds. Taking
 * off a local mean leaves *how much this moment stood out from its neighbours*,
 * which is the same everywhere in the song.
 */
function riseOf(level: Float32Array, per: number): Float32Array {
  const n = level.length;
  const raw = new Float64Array(n);
  for (let i = 1; i < n; i++) raw[i] = Math.max(0, level[i] - level[i - 1]);

  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + raw[i];

  const half = Math.max(1, Math.round(0.2 / per));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(n, i + half + 1);
    out[i] = Math.max(0, raw[i] - (cum[to] - cum[from]) / (to - from));
  }
  return out;
}

/**
 * The rises worth aligning to: local maxima, placed between columns.
 *
 * The parabola through a peak and its two neighbours is where the hit actually
 * was — a column is twelve milliseconds and a grid is judged in single ones, so
 * rounding every hit to a column would put a floor under the accuracy of
 * everything downstream.
 */
function hitsOf(rise: Float32Array): Hit[] {
  let loudest = 0;
  for (let i = 0; i < rise.length; i++) if (rise[i] > loudest) loudest = rise[i];
  if (loudest <= 0) return [];

  const least = loudest * 0.06;
  const out: Hit[] = [];
  for (let i = 1; i < rise.length - 1; i++) {
    const b = rise[i];
    if (b < least || b <= rise[i - 1] || b < rise[i + 1]) continue;
    const a = rise[i - 1];
    const c = rise[i + 1];
    const bend = a - 2 * b + c;
    const shift = bend < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / bend)) : 0;
    out.push({ at: i + shift, weight: b / loudest });
  }
  return out;
}

/**
 * The beat period, in columns, from how the onsets line up with themselves.
 *
 * Scanned against a signal smeared by a column either side, and at a step fine
 * enough that the peak is sampled rather than jumped over. Both matter at any
 * resolution: a spike correlated against a spike gives one lag a huge score and
 * its neighbours nothing to interpolate from, and whole-column lags at the
 * coarse end are a tempo every seven BPM.
 *
 * Folded down first where the envelope is fine, because this is the one step
 * whose cost is lags times columns and the coarse answer is all it owes: a
 * period good to a fraction of a per cent, which is what the alignment below
 * needs to get started.
 *
 * **It looks for a pulse an octave slower than the slowest tempo**, and that is
 * not the same thing as claiming a tempo down there. A kick on one and three is
 * a pulse at half the tempo of the song it is in, and refusing to see it at all
 * is how a fit ends up locked to nothing. What is found here is *a* period; the
 * octave is settled afterwards, against the rest of the kit.
 */
function periodOf(rise: Float32Array, per: number): number | null {
  const fold = Math.max(1, Math.round(0.024 / per));
  const n = Math.floor(rise.length / fold);
  if (n < 64) return null;
  const step = per * fold;

  const soft = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let s = i * fold; s < (i + 1) * fold; s++) sum += rise[s];
    soft[i] = sum;
  }
  const smeared = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    smeared[i] =
      0.5 * soft[i] + 0.25 * ((i > 0 ? soft[i - 1] : 0) + (i < n - 1 ? soft[i + 1] : 0));
  }

  const lo = Math.max(2, 60 / (FASTEST * step));
  const hi = Math.min(n / 4, 120 / (SLOWEST * step));
  if (hi <= lo + 1) return null;

  let best = 0;
  let at = 0;
  for (let lag = lo; lag <= hi; lag += 0.125) {
    const whole = Math.floor(lag);
    const part = lag - whole;
    const reach = n - whole - 1;
    if (reach < 8) break;
    let sum = 0;
    for (let i = 0; i < reach; i++) {
      const j = i + whole;
      sum += smeared[i] * (smeared[j] * (1 - part) + smeared[j + 1] * part);
    }
    const bpm = 60 / (lag * step);
    const lean = Math.exp(-0.5 * (Math.log2(bpm / PREFERRED) / OCTAVE) ** 2);
    const score = (sum / reach) * lean;
    if (score > best) {
      best = score;
      at = lag;
    }
  }
  return at > 0 ? at * fold : null;
}

/** The hits sitting under a grid's beats, one per beat, strongest wins. */
function under(hits: Hit[], line: Line, columns: number, reach: number): Beat[] {
  const out: Beat[] = [];
  const window = line.period * 0.3;
  const last = Math.min(reach, Math.floor((columns - 1 - line.first) / line.period));
  let h = 0;
  for (let k = 0; k <= last; k++) {
    const want = line.first + k * line.period;
    while (h < hits.length && hits[h].at < want - window) h++;
    let at = 0;
    let weight = 0;
    for (let j = h; j < hits.length && hits[j].at <= want + window; j++) {
      if (hits[j].weight > weight) {
        weight = hits[j].weight;
        at = hits[j].at;
      }
    }
    if (weight > 0) out.push({ k, at, weight });
  }
  return out;
}

/** How much a grid's beats found under them, over the whole of a track. */
const carried = (hits: Hit[], line: Line, columns: number): number =>
  under(hits, line, columns, Number.MAX_SAFE_INTEGER).reduce((sum, one) => sum + one.weight, 0);

/** The straight line through the hits: where beat zero is, and how far apart they are. */
function through(beats: Beat[]): Line | null {
  let w = 0;
  let k = 0;
  let kk = 0;
  let at = 0;
  let kat = 0;
  for (const beat of beats) {
    w += beat.weight;
    k += beat.weight * beat.k;
    kk += beat.weight * beat.k * beat.k;
    at += beat.weight * beat.at;
    kat += beat.weight * beat.k * beat.at;
  }
  const det = w * kk - k * k;
  if (!(Math.abs(det) > 1e-9)) return null;
  const period = (w * kat - k * at) / det;
  if (!(period > 0)) return null;
  return { first: (at - period * k) / w, period };
}

/** The phase to start from: the strongest hit in the first couple of beats. */
function anchorOf(hits: Hit[], period: number): number {
  let at = hits.length > 0 ? hits[0].at : 0;
  let weight = 0;
  for (const hit of hits) {
    if (hit.at > period * 2) break;
    if (hit.weight > weight) {
      weight = hit.weight;
      at = hit.at;
    }
  }
  return at;
}

/**
 * The beat grid, refined against the hits until it spans the song.
 *
 * A least-squares line through the hits the grid found, re-fitted over twice as
 * much of the song each time. It has to grow rather than start wide: the period
 * out of the autocorrelation is right to a fraction of a per cent, which is
 * exact enough to match sixteen beats and nowhere near exact enough to match
 * five hundred — a tenth of a per cent is a beat and a half of drift by the end
 * of a four-minute track. Sixteen beats fixes the period to something an order
 * better, which reaches thirty-two, and six rounds of that reach the end.
 *
 * The last two rounds are over the whole song, which is what makes the answer
 * worth having: a tempo fitted to every kick in four minutes is good to about a
 * hundredth of a BPM, and that is the difference between a grid that holds at
 * bar 200 and one that is visibly wrong by bar 60.
 */
function alignOf(hits: Hit[], guess: number, columns: number, phase?: number): Line | null {
  let line: Line = { first: phase ?? anchorOf(hits, guess), period: guess };
  let reach = 16;
  let full = 0;

  for (let round = 0; round < 24; round++) {
    const total = Math.floor((columns - 1 - line.first) / line.period);
    const beats = under(hits, line, columns, reach);
    if (beats.length < 4) {
      if (reach >= total) return null;
      reach = Math.min(total, reach * 2);
      continue;
    }
    const next = through(beats);
    if (!next) return null;
    // A line that has wandered into a different tempo is not a refinement of
    // this one; the octave is decided outside this loop and is not its to
    // change.
    if (next.period < guess * 0.7 || next.period > guess * 1.4) return null;
    line = next;

    const span = Math.floor((columns - 1 - line.first) / line.period);
    if (reach >= span) full++;
    else reach = Math.min(span, reach * 2);
    if (full >= 2) break;
  }
  return line;
}

/**
 * A whole number where the fit is close enough to one to mean it.
 *
 * Produced music is written at a whole number and the fit is good to about a
 * hundredth of one, so landing within half a tenth of an integer means the
 * integer *is* the tempo. Wider than that and the rounding would be the biggest
 * error in the grid rather than the smallest.
 */
export const snapped = (bpm: number, reach = 0.05): number =>
  Math.abs(bpm - Math.round(bpm)) < reach ? Math.round(bpm) : Number(bpm.toFixed(2));

/** The share of the hits landing within an eighth of a beat of a grid line. */
function agreementOf(hits: Hit[], line: Line): number {
  let all = 0;
  let on = 0;
  for (const hit of hits) {
    all += hit.weight;
    const k = Math.round((hit.at - line.first) / line.period);
    if (Math.abs(hit.at - (line.first + k * line.period)) <= line.period / 8) on += hit.weight;
  }
  return all > 0 ? on / all : 0;
}

/**
 * A tempo and a downbeat for a separated track, or nothing.
 *
 * Fitted to the **kick** where the model made a drums stem, which is most of
 * the argument for gridding a song after separating it rather than before: the
 * one event a grid is easiest to read off arrives on its own track, and a
 * hundred and twenty hertz of low-pass takes the rest of the kit off it.
 *
 * Nothing here is smoothed over a tempo change — the line is straight by
 * construction. That is the right shape for what this app is pointed at and the
 * wrong one for a band playing to no click, and the warp lane is where you find
 * out which you have: a fit that cannot hold walks off the bar lines, visibly,
 * and the hand path is two clicks away.
 */
export function fitOf(heard: Heard): Fit | null {
  const { low, wide } = heard;
  const columns = low.level.length;
  const rise = riseOf(low.level, low.per);
  const hits = hitsOf(rise);
  if (hits.length < 16) return null;

  const guess = periodOf(rise, low.per);
  if (!guess) return null;

  let line = alignOf(hits, guess, columns);
  if (!line) return null;

  // Alternate beats carrying almost nothing are not beats: what was found was a
  // subdivision, and the beat is twice as long.
  for (let again = 0; again < 2; again++) {
    let even = 0;
    let odd = 0;
    for (const one of under(hits, line, columns, Number.MAX_SAFE_INTEGER)) {
      if (one.k % 2 === 0) even += one.weight;
      else odd += one.weight;
    }
    if (Math.min(even, odd) >= Math.max(even, odd) * 0.35) break;
    if (60 / (line.period * 2 * low.per) < SLOWEST) break;
    const slower = alignOf(hits, line.period * 2, columns, line.first + (odd > even ? line.period : 0));
    if (!slower) break;
    line = slower;
  }

  // And a kick on one and three is the whole of the low band's evidence for a
  // tempo half of what anybody would count. The rest of the kit is what settles
  // it: if the midpoints between those kicks carry as much as the kicks — the
  // snare, on two and four — then the beat is twice as fast. This is the one
  // octave question the audio can answer, and it is why there are two bands.
  if (60 / (line.period * low.per) < HALVED) {
    const others = hitsOf(riseOf(wide.level, wide.per));
    const half = line.period / 2;
    const onBeat = carried(others, line, columns);
    const between = carried(others, { first: line.first + half, period: line.period }, columns);
    if (between >= onBeat * 0.5) {
      const faster = alignOf(hits, half, columns, line.first);
      if (faster) line = faster;
    }
  }

  // Which of the four beats starts the bar. The kick is the heaviest thing in
  // most bars of most music this will meet, and it is on the downbeat.
  //
  // Four on the floor is the case where it says nothing at all — four identical
  // kicks, and any of them would do. So the tie is broken by the beat the song
  // *starts* on, which is what songs do, and a vote only moves the downbeat off
  // it by carrying five per cent more than it. Getting this wrong is a grid
  // whose lines are right and whose bar numbers are three beats out; the first
  // click of the hand path is what fixes it, and it is one click.
  const votes = [0, 0, 0, 0];
  for (const one of under(hits, line, columns, Number.MAX_SAFE_INTEGER)) {
    votes[((one.k % 4) + 4) % 4] += one.weight;
  }
  let downbeat = 0;
  for (let r = 1; r < 4; r++) if (votes[r] > votes[downbeat] * 1.05) downbeat = r;

  const bpm = snapped(60 / (line.period * low.per));
  // The pulse was allowed to be an octave slower than any tempo this will
  // claim, so that a kick on one and three could be found at all. Nothing
  // promoted it, so nothing here knows what it is.
  if (bpm < SLOWEST || bpm > FASTEST) return null;

  const agreement = agreementOf(hits, line);
  if (agreement < HOPELESS) return null;

  // Bar 1 is the first downbeat of the file rather than the anchor's own bar,
  // so the count of bars means what it says and the grid does not open on bar
  // −3. Everything before it is still ruled and still numbered.
  const bar = line.period * 4;
  const at = (((line.first + downbeat * line.period) % bar) + bar) % bar;

  return { bpm, offset: at * low.per, agreement };
}

/**
 * The same fit, seeded with a tempo and a downbeat somebody measured by hand.
 *
 * This is what makes counting out four bars enough. Two clicks over four bars
 * is fifteen seconds of evidence and a click twenty milliseconds out is a third
 * of a BPM — a bar and a half of drift by the end of a song. But it is *exactly*
 * enough to say which beat and which downbeat are meant, and once that is
 * settled the same least-squares line over every kick in the track is what
 * actually sets the tempo. The hand supplies the octave and the phase; the audio
 * supplies the precision.
 *
 * It refuses rather than wanders. A refinement that ends up three per cent from
 * what was measured has locked onto something else, and what somebody clicked is
 * a better answer than that.
 */
export function refitOf(heard: Heard, bpm: number, offset: number): Fit | null {
  const { low } = heard;
  const columns = low.level.length;
  const hits = hitsOf(riseOf(low.level, low.per));
  if (hits.length < 8) return null;

  const line = alignOf(hits, 60 / (bpm * low.per), columns, offset / low.per);
  if (!line) return null;

  const found = 60 / (line.period * low.per);
  if (Math.abs(found - bpm) > bpm * 0.03) return null;

  const agreement = agreementOf(hits, line);
  if (agreement < HOPELESS) return null;
  return { bpm: snapped(found), offset: line.first * low.per, agreement };
}
