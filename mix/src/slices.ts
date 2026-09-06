import type { Peak } from './audio.ts';
import { TICKS_PER_BAR } from './grid.ts';
import { beatAt, countOf, BEATS_PER_BAR, type Beats } from './warp.ts';

/**
 * A slice is a span of bars with a name — what becomes one Session row when the
 * pack is written.
 *
 * Not called a scene or a cue, deliberately. Both already mean something exact
 * in Live and neither is this: a scene is a row you fire, a cue is a locator in
 * the Arrangement, and a slice is a cut this app made in a file it separated.
 * The word only has to survive contact with set[flow], where the other two are
 * load-bearing.
 *
 * The bar is where the slice starts, counting from zero, and it is a position
 * on the *grid* rather than a second of the file: bend the beat map and a slice
 * stays on the same bar, which is what a section of a song is. It is allowed to
 * be a fraction of a bar, because a cut is placed at whatever rung the ruler
 * is drawing when it is placed.
 */
export interface Slice {
  bar: number;
  name: string;
}

const SLICE_NAMES = ['Intro', 'Verse A', 'Build', 'Drop', 'Break', 'Verse B', 'Lift', 'Outro'];

/** What a slice is called when somebody cuts one and has not said. */
export const UNNAMED = 'Part';

/**
 * `count` evenly spaced slices across `bars`.
 *
 * The ruler before anything has been heard: nothing has been decoded yet, so
 * this is spacing with names on it rather than a reading of the song. Once the
 * stems are in, `slicesOf` reads them and this is replaced.
 */
export const slicesFor = (count: number, bars: number): Slice[] =>
  Array.from({ length: count }, (_, i) => ({
    bar: Math.round((i * bars) / count),
    name: SLICE_NAMES[i % SLICE_NAMES.length],
  }));

/** A bar rounded to the nearest rung of a ruling, given the ruling's step in ticks. */
export const snappedBar = (bar: number, step: number): number =>
  (Math.round((bar * TICKS_PER_BAR) / step) * step) / TICKS_PER_BAR;

/**
 * Slice `index` moved to start at `bar`, held between its neighbours.
 *
 * The first slice starts the song and does not move. Any other may be dragged
 * as far as the cut before it — to zero length, which is how you say it should
 * go — and up to a `least` short of the cut after it, so the one after keeps
 * at least a rung.
 */
export function dragged(slices: readonly Slice[], index: number, bar: number, bars: number, least: number): Slice[] {
  if (index <= 0 || index >= slices.length) return [...slices];
  const lo = slices[index - 1].bar;
  const hi = (slices[index + 1]?.bar ?? bars) - least;
  const at = Math.max(lo, Math.min(bar, Math.max(lo, hi)));
  return slices.map((s, i) => (i === index ? { ...s, bar: at } : s));
}

/**
 * A new cut at `bar`, splitting whichever slice it lands in.
 *
 * On an existing cut, or before the first, there is nothing to split and the
 * list comes back as it was; the index is then the slice that already starts
 * there.
 */
export function cut(slices: readonly Slice[], bar: number): { slices: Slice[]; index: number } {
  const already = slices.findIndex((s) => s.bar === bar);
  if (already >= 0) return { slices: [...slices], index: already };
  if (slices.length === 0 || bar < slices[0].bar) return { slices: [...slices], index: 0 };
  const index = slices.findIndex((s) => s.bar > bar);
  const at = index < 0 ? slices.length : index;
  return {
    slices: [...slices.slice(0, at), { bar, name: UNNAMED }, ...slices.slice(at)],
    index: at,
  };
}

/** Slice `index` folded into the one before it. The first cannot go. */
export const removed = (slices: readonly Slice[], index: number): Slice[] =>
  index <= 0 ? [...slices] : slices.filter((_, i) => i !== index);

/**
 * How far either side of a beat the detector listens when asking whether the
 * song changes there: a phrase, four bars. The cut itself may fall on any
 * beat — a section starts where the music changes, not where a lattice
 * from bar 1 happens to land — and it is the *window* that is a phrase,
 * because a fill at the end of a phrase is a change in one bar and not a
 * section.
 */
export const PHRASE = 4;
/** The window, in beats. */
const WINDOW = PHRASE * BEATS_PER_BAR;
/** No two cuts within a bar of each other: one change is one cut. */
const APART = BEATS_PER_BAR;

/** How much a slice has to differ from its neighbour to be one, against the biggest difference heard. */
const STANDS_OUT = 0.25;
/** ...and in absolute terms, so a track that never changes does not get cut where it changed least. */
const LEAST_CHANGE = 0.12;

/** How loud a slice has to be, against the loudest, to be the drop. */
const DROP = 0.8;
/** ...and how quiet to be a break. */
const BREAK = 0.45;
/** How much louder a slice has to end than it began to be a build. */
const RISING = 1.2;

/** What each stem is doing on each beat: its loudness, 0 to 1 against its own loudest beat. */
export interface Heard {
  /** Per stem, one value per beat from 1.1.1. */
  levels: Record<string, Float32Array>;
  /** Whole bars on the grid. */
  bars: number;
  /** Beats on the grid: the length of every level. */
  beats: number;
}

/**
 * Each stem's loudness per beat, read off the same peaks the lanes draw.
 *
 * Columns are placed on the grid by where their centre falls, so a beat in a
 * slow passage collects more columns than one in a fast passage and each gets
 * its mean. Every stem is scaled to its own loudest beat rather than to the
 * mix's, because what marks a section is a stem *arriving* — the vocal coming
 * in, the bass dropping out — and a quiet stem's arrival is as much of a cut
 * as a loud one's.
 */
export function heard(peaks: Record<string, readonly Peak[]>, grid: Beats): Heard {
  const bars = countOf(grid);
  const beats = bars * BEATS_PER_BAR;
  const levels: Record<string, Float32Array> = {};
  for (const [stem, columns] of Object.entries(peaks)) {
    const sum = new Float32Array(beats);
    const count = new Float32Array(beats);
    for (let i = 0; i < columns.length; i++) {
      const beat = Math.floor(beatAt(grid, ((i + 0.5) / columns.length) * grid.length));
      if (beat < 0 || beat >= beats) continue;
      sum[beat] += Math.max(columns[i].max, -columns[i].min);
      count[beat] += 1;
    }
    let loudest = 0;
    for (let b = 0; b < beats; b++) {
      sum[b] = count[b] > 0 ? sum[b] / count[b] : 0;
      loudest = Math.max(loudest, sum[b]);
    }
    if (loudest > 0) for (let b = 0; b < beats; b++) sum[b] /= loudest;
    levels[stem] = sum;
  }
  return { levels, bars, beats };
}

/** The mean of every stem's level across `from` up to `to`. */
const meanOf = (level: Float32Array, from: number, to: number): number => {
  let sum = 0;
  for (let b = from; b < to; b++) sum += level[b];
  return to > from ? sum / (to - from) : 0;
};

/**
 * How different the phrase after a beat is from the phrase before it.
 *
 * Per stem, the change in mean level across the boundary, averaged over the
 * stems — so the vocal arriving over an unchanged beat scores as much as the
 * whole mix getting louder.
 */
export function novelty(heard: Heard, beat: number): number {
  const stems = Object.values(heard.levels);
  if (stems.length === 0) return 0;
  let total = 0;
  for (const level of stems) {
    total += Math.abs(meanOf(level, beat, beat + WINDOW) - meanOf(level, beat - WINDOW, beat));
  }
  return total / stems.length;
}

/**
 * Where the sections change, in bars from 1.1.1, on whatever beat the change
 * is on: every beat that stands out from the bar either side of it and from
 * the track as a whole.
 */
export function cutsOf(heard: Heard): number[] {
  const { beats } = heard;
  const scores = new Float32Array(beats);
  for (let beat = WINDOW; beat + WINDOW <= beats; beat++) scores[beat] = novelty(heard, beat);
  const most = Math.max(0, ...scores);
  const enough = Math.max(LEAST_CHANGE, most * STANDS_OUT);
  const cuts: number[] = [];
  for (let beat = WINDOW; beat + WINDOW <= beats; beat++) {
    const score = scores[beat];
    if (score < enough) continue;
    // The peak of its bar either side, ties going to the earlier beat, so a
    // change that takes a bar to land is one cut and not four.
    let peak = true;
    for (let k = beat - APART; k <= beat + APART && peak; k++) {
      if (k === beat || k < 0 || k >= beats) continue;
      if (scores[k] > score || (scores[k] === score && k < beat)) peak = false;
    }
    if (peak) cuts.push(beat / BEATS_PER_BAR);
  }
  return cuts;
}

/** The mean level of the whole mix per beat. */
const loudness = (heard: Heard): Float32Array => {
  const stems = Object.values(heard.levels);
  const out = new Float32Array(heard.beats);
  for (const level of stems) for (let b = 0; b < heard.beats; b++) out[b] += level[b] / stems.length;
  return out;
};

/**
 * Names for the spans between the cuts, read off how loud each one is.
 *
 * The loudest spans are the drops. A span that ends louder than it began and
 * runs into a drop is a build; a quiet span between two drops is a break. The
 * first is the intro and the last the outro whatever they sound like, and what
 * is left is a verse. The labels are a guess where the cuts are a reading —
 * they are there to be renamed, and being nearly right saves typing most of
 * them.
 */
export function named(heard: Heard, cuts: readonly number[]): Slice[] {
  const starts = [0, ...cuts];
  const loud = loudness(heard);
  const spans = starts.map((bar, i) => {
    const from = Math.round(bar * BEATS_PER_BAR);
    const to = Math.round((starts[i + 1] ?? heard.bars) * BEATS_PER_BAR);
    const head = Math.max(1, Math.floor((to - from) / 4));
    return {
      bar,
      to,
      level: meanOf(loud, from, to),
      rises: meanOf(loud, to - head, to) > meanOf(loud, from, from + head) * RISING,
    };
  });
  const peak = Math.max(0, ...spans.map((s) => s.level));
  const isDrop = spans.map((s) => peak > 0 && s.level >= peak * DROP);

  const kinds = spans.map((span, i) => {
    if (i === 0) return 'Intro';
    if (i === spans.length - 1 && spans.length > 2) return 'Outro';
    if (isDrop[i]) return 'Drop';
    if (isDrop[i + 1] && span.rises) return 'Build';
    const dropBefore = isDrop.slice(0, i).some(Boolean);
    const dropAfter = isDrop.slice(i + 1).some(Boolean);
    if (dropBefore && dropAfter && span.level < peak * BREAK) return 'Break';
    return 'Verse';
  });

  const seen = new Map<string, number>();
  return spans.map((span, i) => {
    const kind = kinds[i];
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    return { bar: span.bar, name: n === 1 ? kind : `${kind} ${n}` };
  });
}

/**
 * The slices a track gets before anybody has touched them: cuts where the
 * stems change, named by how loud each span is.
 *
 * Falls back to the even eight when there is too little to read — no stems,
 * or fewer bars than two phrases.
 */
export function slicesOf(peaks: Record<string, readonly Peak[]>, grid: Beats): Slice[] {
  const bars = countOf(grid);
  if (Object.keys(peaks).length === 0 || bars < PHRASE * 2) return slicesFor(8, bars);
  const listened = heard(peaks, grid);
  return named(listened, cutsOf(listened));
}

/** A bar for reading: 1-based, and `.beat` after it when it is not on a bar line. */
export const barText = (bar: number): string => {
  const whole = Math.floor(bar);
  const beat = Math.round((bar - whole) * 400) / 100;
  return beat === 0 ? `${whole + 1}` : `${whole + 1}.${beat + 1}`;
};

/** A length in bars for reading, to the hundredth. */
export const lengthText = (bars: number): string =>
  Number.isInteger(bars) ? `${bars}` : bars.toFixed(2).replace(/0+$/, '');
