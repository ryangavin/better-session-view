import type { Onset } from './flux.ts';

/**
 * Beats through an onset function, two ways, from audiojs/beat (MIT).
 *
 * `ellisOf` is Ellis's dynamic programming (JNMR 2007): every frame asks
 * which earlier frame best precedes it as a beat, paying for onset strength
 * gained and for the gap's departure from the target period, on a log scale
 * so a gap twice the period costs what half of one does. Where `follow.ts`
 * reads a local period off the song a stretch at a time and holds the beats
 * to that, this holds them to one target throughout. `gridOf` is the other
 * thing the library does: a straight grid at the tempo, slid to the phase
 * that sits nearest the most onsets, which is the shape of `tempo.ts`'s fit
 * without the least squares.
 */

/** How dearly a gap's departure from the target period is paid for. */
const TIGHTNESS = 680;

/** The beats, in seconds, held to `bpm` through the onset function. */
export function ellisOf(onset: Onset, bpm: number): number[] {
  const { values, per, first } = onset;
  const n = values.length;
  if (n < 2 || !(bpm > 0)) return [];
  const target = 60 / bpm / per;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += values[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (values[i] - mean) ** 2;
  const sd = Math.sqrt(variance / n) || 1;
  const strength = new Float64Array(n);
  for (let i = 0; i < n; i++) strength[i] = (values[i] - mean) / sd;

  const score = Float64Array.from(strength);
  const before = new Int32Array(n).fill(-1);
  const nearest = Math.max(1, Math.floor(target * 0.5));
  const furthest = Math.ceil(target * 2);
  for (let i = 1; i < n; i++) {
    for (let j = Math.max(0, i - furthest); j < Math.max(0, i - nearest); j++) {
      const stretch = Math.log((i - j) / target);
      const s = score[j] + strength[i] - TIGHTNESS * stretch * stretch;
      if (s > score[i]) {
        score[i] = s;
        before[i] = j;
      }
    }
  }

  let end = Math.max(0, n - Math.floor(target));
  for (let i = end + 1; i < n; i++) if (score[i] > score[end]) end = i;
  const frames: number[] = [];
  for (let at = end; at >= 0; at = before[at]) frames.push(at);
  frames.reverse();

  const beats = frames.map((f) => first + f * per);
  const interval = target * per;
  if (beats.length > 0 && beats[0] > interval * 0.25) {
    const earlier: number[] = [];
    for (let t = beats[0] - interval; t > -interval * 0.5; t -= interval) earlier.unshift(Math.max(0, t));
    beats.unshift(...earlier);
  }
  return beats;
}

/** How many phases of one beat are tried for the grid. */
const PHASES = 20;

/** A grid at `bpm` over `seconds`, at the phase nearest the most onsets, in seconds. */
export function gridOf(onsets: readonly number[], bpm: number, seconds: number): number[] {
  if (!(bpm > 0) || onsets.length === 0) return [];
  const interval = 60 / bpm;
  let best = -Infinity;
  let phase = 0;
  for (let p = 0; p < PHASES; p++) {
    const at = (p / PHASES) * interval;
    let score = 0;
    for (const onset of onsets) {
      let away = (((onset - at) % interval) + interval) % interval;
      if (away > interval / 2) away = interval - away;
      score -= away;
    }
    if (score > best) {
      best = score;
      phase = at;
    }
  }
  const beats: number[] = [];
  for (let t = phase; t < seconds; t += interval) beats.push(t);
  if (beats.length > 0 && beats[0] > interval * 0.25) beats.unshift(Math.max(0, beats[0] - interval));
  return beats;
}
