/**
 * Where the beats fall on a file: the one map everything else reads.
 *
 * **Beat to sample is the only source of truth.** Every beat of the song has
 * its sample — the exact one it falls on — and every question about time is
 * answered by interpolating between two beats: where the bar lines are
 * drawn, where a slice starts, where a loop wraps, how fast a stretch of the
 * record has to play to land its next beat on the grid. Nothing else about
 * timing is stored. There is no BPM in here; a tempo is the spacing of two
 * beats read off on demand, and a tempo change is nothing more than the
 * spacing changing. That is what makes an edit local: drag one beat and its
 * two neighbours hold, the two segments beside it re-tempo, and
 * nothing further away can tell.
 *
 * Samples rather than seconds, because a sample is exact and a second is a
 * measurement of one; the rate the samples count in travels with the map, so
 * a beat means one thing on any device. Bar 1's downbeat is beat zero,
 * beats before it are negative, and bars are beats over four — the one
 * assumption, and it is stated rather than hidden.
 *
 * **The bar count is not the map.** It used to be: the lanes drew `bars` bars
 * across the width of the file and that was the grid, which silently rounded
 * the tempo — a two-hundred-second track at 128 holds 106.67 bars, was drawn
 * as 107, and so was ruled at 128.4. The count is derived from the map, and
 * nothing rules with it.
 */

/** Beats in a bar. Four-four, stated here and nowhere else. */
export const BEATS_PER_BAR = 4;

/** Where the beats fall on a file. */
export interface Beats {
  /** Samples per second the beats count in. */
  rate: number;
  /** How many samples the file is. */
  length: number;
  /** The beat index of the first sample. Zero is bar 1's downbeat; negative is before it. */
  first: number;
  /** The sample of each beat from `first` on, one per beat, strictly increasing. At least two. */
  samples: readonly number[];
}

/**
 * A map from beat samples, made safe: beats that do not advance are pushed a
 * sample past the one before, and fewer than two are given a second a beat
 * later at `bpm`, so a map always has a spacing and can always be extrapolated.
 */
export function beatsOf(rate: number, length: number, first: number, samples: readonly number[], bpm = 120): Beats {
  const out: number[] = [];
  for (const sample of samples) {
    const last = out[out.length - 1];
    out.push(last !== undefined && sample <= last ? last + 1 : sample);
  }
  if (out.length === 0) out.push(0);
  if (out.length === 1) out.push(out[0] + Math.max(1, Math.round((60 * rate) / bpm)));
  return { rate, length, first, samples: out };
}

/**
 * The map a tempo and a downbeat make: a beat every `60 × rate / bpm` samples
 * across the whole file, from the first beat at or after the top of it, with
 * bar 1's downbeat `offset` seconds in. What a typed tempo rules, and what
 * the ruler shows before anything has been measured.
 */
export function evenBeats(rate: number, length: number, bpm: number, offset: number): Beats {
  const spacing = (60 * rate) / bpm;
  const downbeat = offset * rate;
  const first = Math.ceil(-downbeat / spacing);
  const samples: number[] = [];
  for (let k = first; downbeat + k * spacing <= length || samples.length < 2; k++) {
    samples.push(Math.round(downbeat + k * spacing));
  }
  return beatsOf(rate, length, first, samples, bpm);
}

/**
 * The segment a value falls in: the index of the beat on its left, held to
 * the first and last segments so the ends extrapolate rather than stop.
 */
function segmentOf(samples: readonly number[], value: number): number {
  let lo = 0;
  let hi = samples.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The beat at a sample, fractional, interpolated between the beats either side. */
export function beatAt(beats: Beats, sample: number): number {
  const { samples } = beats;
  const i = segmentOf(samples, sample);
  return beats.first + i + (sample - samples[i]) / (samples[i + 1] - samples[i]);
}

/** The sample a beat falls on, fractional beats interpolated between whole ones. */
export function sampleOf(beats: Beats, beat: number): number {
  const { samples } = beats;
  const k = beat - beats.first;
  const i = Math.max(0, Math.min(samples.length - 2, Math.floor(k)));
  return samples[i] + (k - i) * (samples[i + 1] - samples[i]);
}

/** The bar at a fraction of the file. Bar 1 is zero. */
export const barAt = (beats: Beats, place: number): number =>
  beatAt(beats, place * beats.length) / BEATS_PER_BAR;

/** Where a bar falls, as a fraction of the file. */
export const placeOf = (beats: Beats, bar: number): number =>
  beats.length > 0 ? sampleOf(beats, bar * BEATS_PER_BAR) / beats.length : 0;

/**
 * How many bars the song holds, counting bar 1 as the first.
 *
 * A count rather than a measurement — what the slices are spread over and what
 * the export writes down. Nothing draws with it.
 */
export const countOf = (beats: Beats): number => Math.max(1, Math.ceil(barAt(beats, 1)));

/** The tempo at a beat: read off the spacing of the beats either side. */
export function tempoAt(beats: Beats, beat: number): number {
  const { samples } = beats;
  const i = Math.max(0, Math.min(samples.length - 2, Math.floor(beat - beats.first)));
  return (60 * beats.rate) / (samples[i + 1] - samples[i]);
}

/** The slowest and fastest the map runs at. One number twice for a straight line. */
export function tempoRange(beats: Beats): { slowest: number; fastest: number } {
  let slowest = Infinity;
  let fastest = 0;
  for (let i = 0; i + 1 < beats.samples.length; i++) {
    const bpm = (60 * beats.rate) / (beats.samples[i + 1] - beats.samples[i]);
    if (bpm < slowest) slowest = bpm;
    if (bpm > fastest) fastest = bpm;
  }
  return { slowest, fastest };
}

/**
 * The tempo the whole map runs at, as one number: beats over the time they
 * took, from the first beat to the last. What a straight map *is*, and what
 * a bent one averages to.
 */
export function tempoOf(beats: Beats): number {
  const { samples } = beats;
  const span = samples[samples.length - 1] - samples[0];
  return span > 0 ? (60 * beats.rate * (samples.length - 1)) / span : 120;
}

/**
 * A tempo, as a number somebody reads. Integers stay integers, and anything
 * else keeps both decimals: `128.05` is a measurement, and `128.1` is the same
 * measurement dressed up as a mistake.
 */
export const bpmText = (bpm: number): string =>
  Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(2);

/**
 * The tempo a map runs at, as somebody reads it: one number where it holds
 * steady, and the two ends of the range where it does not.
 *
 * A song fact is a range. Steady means within a per cent of its own average,
 * which is a beat's worth of a drummer's wobble; the range is rounded to
 * whole numbers either side because `126.37–131.02` is a header nobody can
 * read and the second decimal is not what a range is saying.
 */
export function rangeText(beats: Beats): string {
  const { slowest, fastest } = tempoRange(beats);
  if (!Number.isFinite(slowest)) return '';
  const whole = tempoOf(beats);
  if (fastest - slowest < whole * 0.02) return bpmText(Number(whole.toFixed(2)));
  const lo = Math.round(slowest);
  const hi = Math.round(fastest);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/**
 * Where bar 1 starts, given where any downbeat falls.
 *
 * Bar 1 is the first downbeat in the file, wherever the grid was read from. A
 * click on the downbeat of the chorus says where the bars fall and nothing
 * about which bar that is, and the count of bars means what it says.
 */
export const startOf = (downbeat: number, bpm: number): number => {
  const bar = 240 / bpm;
  return ((downbeat % bar) + bar) % bar;
};

/**
 * One beat moved to another sample, held strictly between its neighbours.
 *
 * The edit, and the whole of it: the beat keeps its index, the two segments
 * beside it take up the difference, and every other beat is exactly where
 * it was. Nothing is re-fitted, because the map is not a fit — it is where the
 * beats are.
 */
export function moved(beats: Beats, beat: number, sample: number): Beats {
  const i = beat - beats.first;
  if (i < 0 || i >= beats.samples.length) return beats;
  const before = beats.samples[i - 1];
  const after = beats.samples[i + 1];
  let to = Math.round(sample);
  if (before !== undefined) to = Math.max(to, before + 1);
  if (after !== undefined) to = Math.min(to, after - 1);
  const samples = beats.samples.slice();
  samples[i] = to;
  return { ...beats, samples };
}

/**
 * Bar 1 beat 1 set at a beat: Ableton's "set 1.1.1 here". Every beat stays
 * exactly where it is; only the count starts somewhere else, so beats before
 * it go negative rather than going away.
 */
export const renumbered = (beats: Beats, beat: number): Beats => ({ ...beats, first: beats.first - beat });

/** Every beat moved the same way through the file: the nudge. */
export const shifted = (beats: Beats, samples: number): Beats => ({
  ...beats,
  samples: beats.samples.map((s) => s + Math.round(samples)),
});

/** The same map counted in another rate, for a file decoded to a different one. */
export function resampled(beats: Beats, rate: number, length: number): Beats {
  if (rate === beats.rate) return { ...beats, length };
  const scale = rate / beats.rate;
  return beatsOf(rate, length, beats.first, beats.samples.map((s) => Math.round(s * scale)));
}
