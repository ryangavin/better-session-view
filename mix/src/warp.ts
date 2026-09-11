/**
 * Where the beats fall on a file: the one map everything else reads.
 *
 * **Beat to sample is the only source of truth.** Every beat of the song has
 * its sample — the exact one it falls on — and every question about time is
 * answered by interpolating between two beats: where the bar lines are
 * drawn, where a slice starts, where a loop wraps, how fast a stretch of the
 * record has to play to land its next beat on the grid. Automatic maps carry versioned musical-fit metadata and retain the raw
 * detector observations separately. Their regional tempo is established by
 * sustained evidence, not one short interval; see musical.ts. Manual maps
 * still answer local timing directly from beat spacing. That is what makes an edit local: drag one beat and its
 * two neighbours hold, the two segments beside it re-tempo, and
 * nothing further away can tell. The other edit is a bar pulled: the beats
 * since the last point a hand set stretch to follow it, and the beats after
 * come along, so a tempo that is a fraction off is one drag rather than
 * a hundred. The map remembers which beats a hand set, and nothing else
 * about the hand.
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
  /** Fitted musical-grid provenance and original detector observations. */
  musical?: import('./musical.ts').MusicalEvidence;
  /** Samples per second the beats count in. */
  rate: number;
  /** How many samples the file is. */
  length: number;
  /** The beat index of the first sample. Zero is bar 1's downbeat; negative is before it. */
  first: number;
  /** The sample of each beat from `first` on, one per beat, strictly increasing. At least two. */
  samples: readonly number[];
  /**
   * The beats a hand has set, as beat indices, sorted. Where the next pull of
   * a bar stretches from; bar 1 counts without being listed. Absent from a
   * map nobody has touched, and from any file written before there was one.
   */
  set?: readonly number[];
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

/** Supported musical-region extremes, or exact interval extremes for a manual/raw map. */
export function tempoRange(beats: Beats): { slowest: number; fastest: number } {
  const regions=beats.set?.length ? undefined : beats.musical?.segments;
  if(regions?.length)return {slowest:Math.min(...regions.map(s=>s.bpm)),fastest:Math.max(...regions.map(s=>s.bpm))};
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
 * The tempo a stretch of the map runs at, as one number: the median spacing
 * of the beats from `from` to `upto`, beats counted from 1.1.1. What a
 * section is laid at when each section gets its own tempo — the median so a
 * ramp at one end does not pull a steady section off its number. The whole
 * map's tempo where the stretch holds no beats.
 */
export function tempoBetween(beats: Beats, from: number, upto: number): number {
  const { samples } = beats;
  const lo = Math.max(0, Math.ceil(from - beats.first));
  const hi = Math.min(samples.length - 1, Math.floor(upto - beats.first));
  const spacings: number[] = [];
  for (let i = lo; i + 1 <= hi; i++) spacings.push(samples[i + 1] - samples[i]);
  if (spacings.length === 0) return tempoOf(beats);
  spacings.sort((a, b) => a - b);
  return (60 * beats.rate) / spacings[spacings.length >> 1];
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
  if(beats.musical?.ambiguous && !beats.set?.length)return 'Check beat count';
  const { slowest, fastest } = tempoRange(beats);
  return tempoText(tempoOf(beats), slowest, fastest);
}

/**
 * The same reading, from the three numbers rather than from the map.
 *
 * The library rail says this about a track it has not opened, and the numbers
 * are all it is given — sending seven hundred samples a row to re-derive them
 * would be the map arriving so a header could round it.
 */
export function tempoText(whole: number, slowest: number, fastest: number): string {
  if (!Number.isFinite(slowest) || !Number.isFinite(whole)) return '';
  if (fastest - slowest < whole * 0.02) return bpmText(Number(whole.toFixed(2)));
  const lo = Math.round(slowest);
  const hi = Math.round(fastest);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/**
 * How much of the grid the kit confirms: the share of beats with one of
 * `hits`, in seconds and in order, within `within` seconds. Null with nothing
 * to count.
 *
 * The one number that says whether a grid is right while it is being edited,
 * so it is read off the map as drawn rather than off the last fit, which
 * knows nothing about a beat that was just dragged. It is beats with a hit
 * and not hits on a beat, because a kick between the beats is the music, not
 * the grid's mistake: a syncopated record read that way scored a quarter with
 * the grid dead on. Only the beats between the first hit and the last are
 * asked, so a spoken intro with no drums in it does not count against the
 * grid ruled through it. Each beat finds its nearest hit by bisection, and a
 * song's worth costs nothing a drag can feel.
 */
export function beatsOnHit(beats: Beats, hits: readonly number[], within: number): number | null {
  if (hits.length === 0) return null;
  const { samples, rate } = beats;
  const first = hits[0] * rate;
  const last = hits[hits.length - 1] * rate;
  let asked = 0;
  let on = 0;
  for (const at of samples) {
    if (at < first || at > last) continue;
    asked++;
    const seconds = at / rate;
    let lo = 0, hi = hits.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (hits[mid] < seconds) lo = mid + 1; else hi = mid; }
    const before = lo > 0 ? seconds - hits[lo - 1] : Infinity;
    const after = lo < hits.length ? hits[lo] - seconds : Infinity;
    if (Math.min(before, after) <= within) on++;
  }
  return asked === 0 ? null : on / asked;
}

/** How far from a beat, as a share of its spacing, a hit still counts as the one it meant. */
export const UNDER_A_BEAT = 0.25;

/**
 * The hit a beat was meant to sit on, as a sample: the nearest kick or snare
 * within a quarter of the beat's own spacing, and null where there is none.
 *
 * A quarter of a beat rather than a fixed window, because "near" means
 * something different at 70 than at 170: it is inside the reach of a sixteenth
 * either way, so a beat detected on the right pulse but a few milliseconds
 * late finds its hit, and a beat a whole eighth off is left alone, since the
 * hit an eighth away is a different note. The spacing is the smaller of the
 * two beside the beat, so a beat at the edge of a break is judged by the
 * tighter side. Bisection over `hits`, which are sorted seconds.
 */
export function hitUnder(beats: Beats, hits: readonly number[], beat: number): number | null {
  const i = beat - beats.first;
  if (i < 0 || i >= beats.samples.length || hits.length === 0) return null;
  const at = beats.samples[i];
  const before = i > 0 ? at - beats.samples[i - 1] : Infinity;
  const after = i + 1 < beats.samples.length ? beats.samples[i + 1] - at : Infinity;
  const reach = Math.min(before, after) * UNDER_A_BEAT;
  const seconds = at / beats.rate;
  let lo = 0, hi = hits.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (hits[mid] < seconds) lo = mid + 1; else hi = mid; }
  const near = [hits[lo - 1], hits[lo]].filter((h): h is number => h !== undefined);
  if (near.length === 0) return null;
  const hit = near.reduce((best, h) => (Math.abs(h - seconds) < Math.abs(best - seconds) ? h : best));
  const sample = Math.round(hit * beats.rate);
  return Math.abs(sample - at) <= reach ? sample : null;
}

/** How far from a beat, in seconds, a kick or snare still counts as on it. */
export const ON_A_BEAT = 0.025;

/** How off one bar of the map reads against the kit. */
export interface BarOff {
  /** The bar, bar 1 being zero. */
  bar: number;
  /** The median distance in seconds of its confirmed beats from their hits; null where none is confirmed. */
  off: number | null;
  /** The share of its beats with no hit within a quarter of a beat of them. */
  missing: number;
  /**
   * How off it reads, nought to one, against the rest of the map: how much
   * further than the typical bar its beats sit from their hits, twice
   * `within` counting as wholly off, or how many more than a quarter of its
   * beats go unconfirmed. Nought where it reads like every other bar.
   */
  score: number;
}

/**
 * How off every bar of the map is, so the one that is most off can be found
 * rather than looked for. A bar is judged by the beats of its own — four from
 * bar 1's downbeat, and from bar 1 on, since the lead-in is ruled back from
 * it and is not a bar anybody fixes — that fall between the first hit and the last, the way
 * `beatsOnHit` judges the whole, so a spoken intro is nobody's bad bar and a
 * bar the drums enter halfway through is judged on the half they play; and a
 * bar with no hit anywhere in it is left out for the same reason, because a
 * breakdown is no evidence against the grid ruled through it and would
 * otherwise be the worst bar of every record that has one. Each beat finds
 * the hit it was meant for as `hitUnder` does, within a quarter of its own
 * spacing: the bar's `off` is the median distance of the beats that found
 * one, so a bar whose beats sit consistently late or early reads as off by
 * that much and one wild beat does not condemn its three good neighbours;
 * its `missing` is the share that found none, so a bar whose kit plays
 * between the beats reads as off too. The score is relative: a grid that
 * sits five milliseconds late everywhere is not a hundred bad bars, it is
 * one nudge, and the bar worth going to is the one that departs from the
 * rest — so a bar's distance is taken over the median bar's before it counts,
 * with twice `within` counting as wholly off; and one beat in four with no
 * kick or snare under it is a syncopation, not a mistake, so only more than a
 * quarter unconfirmed counts, all four as wholly off. On a hip-hop record
 * read against a right grid, the first measure painted a third of the bars
 * as wrong. Bisection per beat, so a song's worth costs nothing a drag can
 * feel.
 */
export function barsOff(beats: Beats, hits: readonly number[], within: number): BarOff[] {
  if (hits.length === 0) return [];
  const { samples, rate, first } = beats;
  const lo = hits[0] * rate;
  const hi = hits[hits.length - 1] * rate;
  const out: BarOff[] = [];
  let bar: number | null = null;
  let asked = 0;
  let found: number[] = [];
  const close = () => {
    if (bar === null || asked === 0) return;
    const from = sampleOf(beats, bar * BEATS_PER_BAR) / rate;
    const upto = sampleOf(beats, (bar + 1) * BEATS_PER_BAR) / rate;
    let a = 0, b = hits.length;
    while (a < b) { const mid = (a + b) >>> 1; if (hits[mid] < from) a = mid + 1; else b = mid; }
    const played = a < hits.length && hits[a] < upto;
    asked = played ? asked : 0;
    if (!played) { found = []; return; }
    found.sort((a, b) => a - b);
    const off = found.length > 0 ? found[found.length >> 1] : null;
    const missing = 1 - found.length / asked;
    out.push({ bar, off, missing, score: 0 });
    asked = 0;
    found = [];
  };
  for (let i = Math.max(0, -first); i < samples.length; i++) {
    const at = samples[i];
    if (at < lo || at > hi) continue;
    const beat = first + i;
    const of = Math.floor(beat / BEATS_PER_BAR);
    if (of !== bar) { close(); bar = of; }
    asked++;
    const hit = hitUnder(beats, hits, beat);
    if (hit !== null) found.push(Math.abs(hit - at) / rate);
  }
  close();
  const offs = out.flatMap((b) => (b.off === null ? [] : [b.off])).sort((a, b) => a - b);
  const typical = offs.length > 0 ? offs[offs.length >> 1] : 0;
  for (const b of out) {
    const late = b.off === null ? 0 : Math.min(1, Math.max(0, b.off - typical) / (2 * within));
    const unconfirmed = Math.max(0, (b.missing - 0.25) / 0.75);
    b.score = Math.max(late, unconfirmed);
  }
  return out;
}

/**
 * The bars worth going to, most off first: those scoring `atLeast`, in the
 * order of a hand's work — worst to least, and earlier before later where two
 * read the same. Where none reaches it, the single worst there is, so the
 * gesture always lands somewhere and a good grid shows its weakest bar.
 */
export function worstBars(off: readonly BarOff[], atLeast: number): BarOff[] {
  const ranked = off.slice().sort((a, b) => b.score - a.score || a.bar - b.bar);
  const bad = ranked.filter((b) => b.score >= atLeast);
  return bad.length > 0 ? bad : ranked.slice(0, 1);
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
  return { ...beats, samples, set: setting(beats.set, beat) };
}

/** The set list with one more beat in it, still sorted and still without repeats. */
function setting(set: readonly number[] | undefined, beat: number): readonly number[] {
  const out = (set ?? []).filter((b) => b !== beat);
  out.push(beat);
  return out.sort((a, b) => a - b);
}

/** Where a pull of `beat` stretches from: the nearest set beat on bar 1's side of it, bar 1 itself failing that. */
function heldBeside(set: readonly number[] | undefined, beat: number): number | undefined {
  let held: number | undefined = beat === 0 ? undefined : 0;
  for (const b of set ?? []) {
    if (beat >= 0 ? b < beat && (held === undefined || b > held) : b > beat && (held === undefined || b < held)) held = b;
  }
  return held;
}

/**
 * One bar pulled to another sample, and the grid stretched to follow.
 *
 * The beats between the last set point and the pulled bar keep their count
 * and their relative spacing across the new span; the beats past it come
 * along by the same distance, keeping the spacing detection gave them; the
 * beats before the set point stay. Bar 1 is the set point until a hand has
 * set a nearer one, so a steady record whose tempo is a fraction off is fixed
 * by pulling its last bar onto its hit — Serato's bar marker, and Live's warp
 * marker where the markers are few. Before bar 1 the same, mirrored, because
 * the song grows outward from its downbeat: a bar in the lead-in stretches
 * towards bar 1 and the beats before it come along. Bar 1 itself, with
 * nothing set before it, brings the whole map — the grid hangs from it.
 *
 * The pulled bar is a set beat afterwards, so the next pull stretches from
 * it rather than from bar 1 again, and the span it spread is safe from any
 * pull further on.
 */
export function pulled(beats: Beats, beat: number, sample: number): Beats {
  const { samples, first } = beats;
  const i = beat - first;
  if (i < 0 || i >= samples.length) return beats;
  const set = setting(beats.set, beat);
  const held = heldBeside(beats.set, beat);
  let to = Math.round(sample);
  let out: number[];
  if (held === undefined) {
    out = samples.map((s) => s + to - samples[i]);
  } else if (beat >= 0) {
    const lo = Math.max(0, held - first);
    to = Math.max(to, samples[lo] + (i - lo));
    const scale = (to - samples[lo]) / (samples[i] - samples[lo]);
    out = samples.map((s, k) => (k < lo ? s : k <= i ? samples[lo] + Math.round((s - samples[lo]) * scale) : s + to - samples[i]));
  } else {
    const hi = Math.min(samples.length - 1, held - first);
    to = Math.min(to, samples[hi] - (hi - i));
    const scale = (samples[hi] - to) / (samples[hi] - samples[i]);
    out = samples.map((s, k) => (k > hi ? s : k >= i ? samples[hi] - Math.round((samples[hi] - s) * scale) : s + to - samples[i]));
  }
  return { ...beatsOf(beats.rate, beats.length, first, out), set, ...(beats.musical && {musical:{...beats.musical,segments:[]}}) };
}

/**
 * Bar 1 beat 1 set at a beat: Ableton's "set 1.1.1 here". Every beat stays
 * exactly where it is; only the count starts somewhere else, so beats before
 * it go negative rather than going away. The set beats are counted the same
 * way, so a hand's work stays where the hand put it.
 */
export const renumbered = (beats: Beats, beat: number): Beats => ({
  ...beats,
  first: beats.first - beat,
  ...(beats.musical && {musical:{...beats.musical,segments:beats.musical.segments.map(s=>({...s,beat:s.beat-beat}))}}),
  ...(beats.set && { set: beats.set.map((b) => b - beat) }),
});

/** Every beat moved the same way through the file: what a ⌘-drag on any marker does. */
export const shifted = (beats: Beats, samples: number): Beats => ({
  ...beats,
  samples: beats.samples.map((s) => s + Math.round(samples)),
});

/**
 * The same beats counted at another rate: `num` new beats across every `den`
 * old ones, so (2, 1) doubles the tempo, (1, 2) halves it, (3, 2) and (2, 3)
 * are the 3:2 and 2:3 readings. What a detector that heard the wrong pulse
 * gets — an octave out, or 4:3 — is corrected without losing what it heard
 * right: new beat k sits where old beat k·den/num falls, interpolated between
 * the old beats either side, so a stretch that ran fast still runs fast, and
 * carried on at the local spacing past both ends so the map covers the same
 * stretch of the file. Bar 1's downbeat is new beat zero as it was old beat
 * zero, so the count keeps starting on the same hit. Typing a tempo would
 * have ruled the variation flat, and Find beats cannot be told which pulse.
 *
 * A hand-set beat is kept, re-indexed, where it lands on a whole new beat —
 * every one under ×2, the even ones under ÷2 — and dropped where it would
 * fall between two, because a set point is a place the next pull stretches
 * from and half a beat is not a place.
 */
export function retimed(beats: Beats, num: number, den: number): Beats {
  const { first, samples } = beats;
  const last = first + samples.length - 1;
  const from = Math.floor((first * num) / den);
  const upto = Math.ceil((last * num) / den);
  const out: number[] = [];
  for (let k = from; k <= upto; k++) out.push(Math.round(sampleOf(beats, (k * den) / num)));
  const set = beats.set?.flatMap((b) => ((b * num) % den === 0 ? [(b * num) / den] : [])).filter((b) => b >= from && b <= upto);
  return { ...beatsOf(beats.rate, beats.length, from, out), ...(set && { set }), ...(beats.musical && {musical:{...beats.musical,segments:[]}}) };
}

/** The same map counted in another rate, for a file decoded to a different one. */
export function resampled(beats: Beats, rate: number, length: number): Beats {
  if (rate === beats.rate) return { ...beats, length };
  const scale = rate / beats.rate;
  return {
    ...beatsOf(rate, length, beats.first, beats.samples.map((s) => Math.round(s * scale))),
    ...(beats.set && { set: beats.set }),
    ...(beats.musical && { musical: beats.musical }),
  };
}
