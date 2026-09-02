import type { CandidateTrace, TempoTrace } from './trace.ts';
import type { Heard, Transient } from './transients.ts';

/**
 * The tempo and the downbeat, read off every transient in the file.
 *
 * Three questions, answered in order, and the order is what makes each one
 * answerable. **How fast** is the period the hits repeat at, which is where
 * the onset strength correlates with itself. **Which pulse is the beat** is
 * the one question correlation cannot answer — a kick every beat lines up
 * with itself at twice the period exactly as well — and it used to be settled
 * by leaning toward the tempos people dance at. It is settled now by what the
 * kit *does*: at the beat, a kick or a snare sits on nearly every pulse and
 * the hats fall between them; at half the tempo every other pulse is
 * missed, and at double, every other pulse is empty. That is evidence, and
 * the lean was a guess. **Where the beat falls** is a search over every phase
 * of one beat, scored by the whole song, so an intro whose first hits are not
 * the beat cannot lead the line astray; the old fit grew a line from the
 * first strong hit, and on two records out of five that was the wrong hit.
 *
 * Then least squares through the hits under the beats, over the whole song,
 * which is what makes a tempo good to a hundredth of a BPM; a tenth of a per
 * cent is a beat and a half of drift by the end of four minutes.
 */

/** A tempo and a downbeat, fitted to what the audio did. */
export interface Fit {
  bpm: number;
  /** Seconds from the top of the file to the downbeat of bar 1. */
  offset: number;
  /**
   * The share of the kick and snare strength landing within an eighth of a
   * beat of a grid line, 0 to 1. Reported rather than a confidence score,
   * because it is a thing that can be checked against the warp lane.
   */
  agreement: number;
}

/** The slowest and fastest tempo a fit will claim. A range, and the only prior there is. */
export const SLOWEST = 70;
export const FASTEST = 190;

/**
 * Below this share of the hits landing on the grid there is nothing to lock
 * to. A quarter is what luck alone scores, since the window a hit counts in
 * is a quarter of a beat wide; four-tenths is clear of chance and still well
 * under what loose, hand-played drums manage.
 */
const HOPELESS = 0.4;

/** Seconds per frame of the onset strength. Four milliseconds: fine enough for a period, cheap enough to correlate. */
const FRAME = 0.004;

/** How much each band counts for. The kick and the snare are the beat; the hats are its subdivision. */
const WEIGHT: Record<Transient['band'], number> = { low: 1, mid: 0.8, high: 0.35 };

/** How far from a grid line a hit still counts as on it, in beats: an eighth for agreement, a sixteenth for the pattern. */
const ON = 1 / 8;
const TIGHT = 1 / 16;

/** A beat of the grid that found a hit under it. */
export interface Beat {
  k: number;
  at: number;
  weight: number;
}

/** Where a beat grid sits: the first beat, and the period, in seconds. */
export interface Line {
  first: number;
  period: number;
}

/** The straight line through the hits: where beat zero is, and how far apart they are. */
export function through(beats: readonly Beat[]): Line | null {
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
  if (!(Math.abs(det) > 1e-12)) return null;
  const period = (w * kat - k * at) / det;
  if (!(period > 0)) return null;
  return { first: (at - period * k) / w, period };
}

/**
 * The onset strength: every hit, weighted by its band, smeared a little so a
 * period a few milliseconds off still correlates.
 */
function pulseOf(heard: Heard): Float32Array {
  const frames = Math.max(1, Math.ceil(heard.seconds / FRAME));
  const out = new Float32Array(frames);
  const reach = 2;
  for (const hit of heard.transients) {
    const centre = hit.at / FRAME;
    const weight = hit.strength * WEIGHT[hit.band];
    for (let i = Math.max(0, Math.floor(centre) - reach); i <= Math.min(frames - 1, Math.ceil(centre) + reach); i++) {
      const d = i - centre;
      out[i] += weight * Math.exp(-0.5 * d * d);
    }
  }
  return out;
}

/** A candidate period, and how strongly the song repeats at it. */
interface Candidate {
  period: number;
  score: number;
}

/**
 * The periods the song repeats at, strongest first, within the range.
 *
 * Every local maximum of the autocorrelation that is at least a third of the
 * strongest, each placed between frames by the parabola through it. No lean
 * toward any tempo: which of these is the beat is the pattern's to say.
 */
function candidatesOf(pulse: Float32Array, trace?: TempoTrace): Candidate[] {
  const n = pulse.length;
  const lo = Math.max(2, Math.floor(60 / (FASTEST * FRAME)));
  const hi = Math.min(n >> 2, Math.ceil(60 / (SLOWEST * FRAME)));
  if (hi <= lo + 2) return [];
  const acf = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    let sum = 0;
    const reach = n - lag;
    for (let i = 0; i < reach; i++) sum += pulse[i] * pulse[i + lag];
    acf[lag] = sum / reach;
  }
  if (trace) trace.acf = { lo, values: Array.from(acf.subarray(lo, hi + 1)) };
  let best = 0;
  for (let lag = lo; lag <= hi; lag++) if (acf[lag] > best) best = acf[lag];
  if (!(best > 0)) return [];
  const out: Candidate[] = [];
  for (let lag = lo; lag <= hi; lag++) {
    const a = acf[lag - 1];
    const b = acf[lag];
    const c = acf[lag + 1];
    if (b < a || b < c || b < best / 3) continue;
    const bend = a - 2 * b + c;
    const shift = bend < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / bend)) : 0;
    out.push({ period: (lag + shift) * FRAME, score: b / best });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Hits of the beat: the kick and the snare. The hats are the subdivision, and are asked separately. */
const beatBands = (heard: Heard): Transient[] => heard.transients.filter((t) => t.band !== 'high');

/** How much of the song a phase is searched over, in seconds. */
const STRETCH = 30;

/**
 * The busiest stretch of the song: where the kit is playing most, which is
 * where the beat is easiest to see. Not the opening — a record can take a
 * minute and a half to bring the drums in.
 */
function busiest(hits: readonly Transient[], seconds: number): [number, number] {
  const span = Math.min(STRETCH, seconds);
  let best = -1;
  let from = 0;
  for (let start = 0; start + span <= seconds + 1e-9; start += span / 4) {
    let weight = 0;
    for (const hit of hits) if (hit.at >= start && hit.at < start + span) weight += hit.strength * WEIGHT[hit.band];
    if (weight > best) {
      best = weight;
      from = start;
    }
  }
  return [from, from + span];
}

/**
 * The phase at which a period catches the most of the beat, by a search over
 * every millisecond of one period.
 *
 * Over the busiest half-minute rather than the whole song: the period is known
 * to a frame here, and a frame's error is a third of a second by the end of
 * four minutes — wider than the window a hit counts in. Thirty seconds holds
 * that error under ten milliseconds, and the least squares below is what
 * carries the phase to the end of the song.
 */
export function phaseOf(hits: readonly Transient[], period: number, seconds: number, sweep?: CandidateTrace): Line {
  const [from, to] = busiest(hits, seconds);
  const within = hits.filter((hit) => hit.at >= from && hit.at < to);
  const step = 0.001;
  const window = period * TIGHT;
  let best = -1;
  let phase = from;
  const scores: number[] = [];
  for (let phi = from; phi < from + period; phi += step) {
    let score = 0;
    for (const hit of within) {
      const off = hit.at - phi;
      const away = Math.abs(off - Math.round(off / period) * period);
      if (away <= window) score += hit.strength * WEIGHT[hit.band] * (1 - away / window);
    }
    if (sweep) scores.push(score);
    if (score > best) {
      best = score;
      phase = phi;
    }
  }
  if (sweep) sweep.sweep = { from, step, scores };
  return { first: phase, period };
}

/**
 * How much a period looks like the beat, at its best phase, from what the
 * kit does around it.
 *
 * Two shares. *On*: how much of the kick and snare strength sits on the
 * pulses — at half the true tempo every other hit is between them, and this
 * halves. *Filled*: how many of the pulses have a kick or a snare on them,
 * counted only where the kit is playing at all — at double the true tempo
 * every other pulse is empty, and this halves. The product is the score, and
 * neither half needs to know what tempo anybody expected.
 */
export function beatnessOf(heard: Heard, period: number, phase: number): number {
  const hits = beatBands(heard);
  const window = period * TIGHT;
  let all = 0;
  let on = 0;
  const start = (((phase % period) + period) % period);
  const pulses = Math.floor((heard.seconds - start) / period);
  const filled = new Uint8Array(Math.max(0, pulses + 1));
  const near = new Uint8Array(Math.max(0, pulses + 1));
  for (const hit of hits) {
    const weight = hit.strength * WEIGHT[hit.band];
    all += weight;
    const k = Math.round((hit.at - start) / period);
    const away = Math.abs(hit.at - (start + k * period));
    if (k >= 0 && k <= pulses) {
      near[k] = 1;
      if (k > 0) near[k - 1] = 1;
      if (k < pulses) near[k + 1] = 1;
      if (away <= window) {
        on += weight;
        filled[k] = 1;
      }
    }
  }
  let playing = 0;
  let hitOn = 0;
  for (let k = 0; k <= pulses; k++) {
    if (!near[k]) continue;
    playing++;
    if (filled[k]) hitOn++;
  }
  if (all <= 0 || playing === 0) return 0;
  return (on / all) * (hitOn / playing);
}

/**
 * The hits sitting under a grid's beats, one per beat, strongest wins —
 * over the whole file, or within `reach` beats either side of beat zero.
 */
function under(
  hits: readonly Transient[],
  line: Line,
  seconds: number,
  window = line.period * ON,
  reach = Infinity,
): Beat[] {
  const out: Beat[] = [];
  const last = Math.min(Math.floor((seconds - line.first) / line.period), reach);
  let h = 0;
  for (let k = Math.max(Math.ceil(-line.first / line.period), -reach); k <= last; k++) {
    const want = line.first + k * line.period;
    while (h < hits.length && hits[h].at < want - window) h++;
    let at = 0;
    let weight = 0;
    for (let j = h; j < hits.length && hits[j].at <= want + window; j++) {
      const w = hits[j].strength * WEIGHT[hits[j].band];
      if (w > weight) {
        weight = w;
        at = hits[j].at;
      }
    }
    if (weight > 0) out.push({ k, at, weight });
  }
  return out;
}

/** The share of the hits, by weight, within a window of a grid line. */
function agreementOf(hits: readonly Transient[], line: Line, window = line.period * ON): number {
  let all = 0;
  let on = 0;
  for (const hit of hits) {
    const w = hit.strength * WEIGHT[hit.band];
    all += w;
    const k = Math.round((hit.at - line.first) / line.period);
    if (Math.abs(hit.at - (line.first + k * line.period)) <= window) on += w;
  }
  return all > 0 ? on / all : 0;
}

/**
 * The line refined through the hits under it, over twice as much of the song
 * each round until it spans the whole of it.
 *
 * It has to grow rather than start wide. A period known to a frame is exact
 * enough to find the hits under sixteen beats and nowhere near exact enough
 * to find them under five hundred — a tenth of a per cent is a beat and a
 * half of drift by the end of four minutes, and a hit that far from its beat
 * is not under it. Sixteen beats fix the period an order better, which
 * reaches thirty-two, and six rounds reach the end. The last two rounds are
 * over the whole song, which is what makes the answer good to a hundredth
 * of a BPM.
 */
function refined(hits: readonly Transient[], line: Line, seconds: number): Line | null {
  let current = line;
  let reach = 16;
  let full = 0;
  for (let round = 0; round < 24; round++) {
    const beats = under(hits, current, seconds, current.period * ON, reach);
    const total = Math.ceil(seconds / current.period);
    if (beats.length < 4) {
      if (reach >= total) return null;
      reach *= 2;
      continue;
    }
    const next = through(beats);
    if (!next) return null;
    if (next.period < line.period * 0.9 || next.period > line.period * 1.1) return null;
    current = next;
    if (reach >= total) full++;
    else reach = Math.min(total, reach * 2);
    if (full >= 2) break;
  }
  return current;
}

/**
 * A whole number where a hand measurement is close enough to one to mean it.
 *
 * For the two clicks of the manual path, which are a tempo to three quarters
 * of a BPM and only ever a seed. A *fit* is not rounded like this: it is
 * asked, in `wholeOf` below, whether the whole number holds.
 */
export const snapped = (bpm: number, reach: number): number =>
  Math.abs(bpm - Math.round(bpm)) < reach ? Math.round(bpm) : Number(bpm.toFixed(2));

/** How much worse a whole number may score than the fit and still be the tempo. */
const SLACK = 0.03;

/**
 * The tempo to report: the whole number where the audio agrees the tempo is
 * one, and two decimals where it does not.
 *
 * Produced music is written at whole numbers, and every record on hand is a
 * hundred and twenty-eight in the DAW and 128.055 on the master. So the whole
 * number is tested rather than assumed: its grid, at its own best phase, has
 * to catch as much of the kick within a thirty-second of a beat as the
 * fitted grid does.
 */
function wholeOf(hits: readonly Transient[], line: Line, seconds: number): number {
  const bpm = 60 / line.period;
  const whole = Math.round(bpm);
  const period = 60 / whole;
  let w = 0;
  let sum = 0;
  for (const beat of under(hits, line, seconds)) {
    w += beat.weight;
    sum += beat.weight * (beat.at - beat.k * period);
  }
  if (w > 0) {
    const window = Math.max(period / 32, 0.003);
    const fitted = agreementOf(hits, line, window);
    const rounded = agreementOf(hits, { first: sum / w, period }, window);
    if (rounded >= fitted * (1 - SLACK)) return whole;
  }
  return Number(bpm.toFixed(2));
}

/**
 * Which of the four beats starts the bar: the heaviest quarter by the kick,
 * because the kick is the heaviest thing in most bars of most music this
 * will meet. Four on the floor says nothing, so the tie goes to the beat the
 * song starts on, and a vote has to carry five per cent more to move it.
 */
function downbeatOf(heard: Heard, line: Line, votesOut?: number[]): number {
  // By how loud the kick got, not how sharply it rose: a downbeat kick is a
  // heavier one, and sharpness is the same for every stroke of the same drum.
  const kicks = heard.transients
    .filter((t) => t.band === 'low')
    .map((t) => ({ ...t, strength: t.level }));
  const first = Math.ceil(-line.first / line.period);
  const votes = [0, 0, 0, 0];
  for (const beat of under(kicks, line, heard.seconds)) votes[(((beat.k - first) % 4) + 4) % 4] += beat.weight;
  let downbeat = 0;
  for (let r = 1; r < 4; r++) if (votes[r] > votes[downbeat] * 1.05) downbeat = r;
  votesOut?.push(...votes);
  return first + downbeat;
}

/** Bar 1's downbeat: the first downbeat in the file, so the bar count means what it says. */
function firstBarOf(line: Line, downbeat: number): number {
  const bar = line.period * 4;
  return (((line.first + downbeat * line.period) % bar) + bar) % bar;
}

/**
 * A tempo and a downbeat for a separated track, or nothing.
 *
 * Every period the song repeats at is a candidate; the one that looks most
 * like the beat wins; its phase is found against the whole song; and the
 * line is then fitted through the hits under it. Nothing here is smoothed
 * over a tempo change — the line is straight by construction, and
 * `follow.ts` is where the beat is followed through one.
 */
export function fitOf(heard: Heard, trace?: TempoTrace): Fit | null {
  const refuse = (why: string): null => {
    if (trace) trace.refused = why;
    return null;
  };
  const hits = beatBands(heard);
  if (hits.length < 16) return refuse('fewer than sixteen kick or snare hits');
  const pulse = pulseOf(heard);
  if (trace) trace.pulse = Array.from(pulse);
  const candidates = candidatesOf(pulse, trace);
  if (candidates.length === 0) return refuse('nothing repeats within the tempo range');

  // Each candidate gets its phase, its line through the whole song, and then
  // its say: the pattern is judged on the refined line, because a line a
  // frame out drifts off the hits it is being judged against.
  let best: { line: Line; beatness: number; index: number } | null = null;
  const weighed: CandidateTrace[] = [];
  for (const [index, candidate] of candidates.slice(0, 6).entries()) {
    const bpm = 60 / candidate.period;
    const seen: CandidateTrace = { period: candidate.period, bpm, score: candidate.score };
    weighed.push(seen);
    if (bpm < SLOWEST || bpm > FASTEST) {
      seen.rejected = 'range';
      continue;
    }
    const line = refined(hits, phaseOf(hits, candidate.period, heard.seconds, trace && seen), heard.seconds);
    if (!line) {
      seen.rejected = 'unrefined';
      continue;
    }
    const beatness = beatnessOf(heard, line.period, line.first) * (0.75 + 0.25 * candidate.score);
    seen.line = line;
    seen.beatness = beatness;
    if (!best || beatness > best.beatness) best = { line, beatness, index };
  }
  if (trace) trace.candidates = weighed;
  if (!best) return refuse('no candidate period refined to a line');

  const line = best.line;
  const bpm = wholeOf(hits, line, heard.seconds);
  if (bpm < SLOWEST || bpm > FASTEST) return refuse(`fitted ${bpm} is outside the range`);
  const agreement = agreementOf(hits, line);
  if (agreement < HOPELESS) return refuse(`only ${Math.round(agreement * 100)}% of the hits sit on the grid`);
  const votes: number[] = [];
  const downbeat = downbeatOf(heard, line, votes);
  const offset = firstBarOf(line, downbeat);
  if (trace) {
    trace.chosen = {
      candidate: best.index,
      line,
      fitted: 60 / line.period,
      bpm,
      agreement,
      votes,
      downbeat: (((downbeat - Math.ceil(-line.first / line.period)) % 4) + 4) % 4,
      offset,
    };
  }
  return { bpm, offset, agreement };
}

/**
 * The same fit, seeded with a tempo and a downbeat somebody measured by hand.
 *
 * The clicks say which beat and which downbeat are meant, which is the half
 * a fit gets wrong; the line through every hit in the song sets the tempo,
 * which is the half it gets right. A refinement that ends up three per cent
 * from what was measured has locked onto something else, and is refused.
 */
export function refitOf(heard: Heard, bpm: number, offset: number): Fit | null {
  const hits = beatBands(heard);
  if (hits.length < 8) return null;
  const line = refined(hits, { first: offset, period: 60 / bpm }, heard.seconds);
  if (!line) return null;
  if (Math.abs(60 / line.period - bpm) > bpm * 0.03) return null;
  const agreement = agreementOf(hits, line);
  if (agreement < HOPELESS) return null;
  return { bpm: wholeOf(hits, line, heard.seconds), offset: firstBarOf(line, 0), agreement };
}
