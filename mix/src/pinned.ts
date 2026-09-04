import { PHRASE } from './slices.ts';
import { beatAt, sampleOf, BEATS_PER_BAR, type Beats } from './warp.ts';

/**
 * The record pinned to the output grid: where it is held, and nothing else.
 *
 * `warp.ts` says where the beats *were*. This says where the audio *goes*: a
 * pin is a source sample that plays at an output sample, and between two pins
 * the record runs at one speed. What is pinned is a decision, and it is a
 * different one from what was heard: a section pinned at its two ends lands
 * exactly on its bars and keeps every push and pull inside it, because the
 * only thing that changed is one speed. Pin every beat instead and every beat
 * lands on its line, which is what a beat map used as a time map does — and
 * on a record made to a click that is the detector's scatter turned into a
 * speed wobble on every beat, which is what a squashed export sounds like.
 *
 * So the density is the whole control: **per section**, which is the cuts and
 * the end; **per phrase**, every four bars from each cut; **per bar**; **per
 * beat**. The same map at four densities is four pinnings, and they differ in
 * nothing but how many pins there are. `loosest` picks the sparsest whose bar
 * lines still land within a tolerance, and says how far off the worst one is,
 * so the default is a measurement and not a taste.
 *
 * Samples, at the map's rate, and real-valued: a pin is a place, and the
 * rounding is the resampler's to do. The cuts are bars counted from bar 1,
 * as the slices are, and beat 0 pins to output 0 whatever the cuts say — a
 * clip starts at 1.1.1. What the map has before that is a section of its
 * own, pinned at its first beat and at 1.1.1, so a count-in plays at its own
 * speed and lands on the one; an export starts at output zero and never
 * reads it.
 */

export type Every = 'section' | 'phrase' | 'bar' | 'beat';

export const DENSITIES: readonly Every[] = ['section', 'phrase', 'bar', 'beat'];

/** A source sample and the output sample it plays at. */
export interface Pin {
  source: number;
  output: number;
}

export interface Pinned {
  rate: number;
  /** How many samples the record is. */
  length: number;
  /** Output samples per beat: the grid it is pinned to. */
  spacing: number;
  /** Strictly increasing in both coordinates. At least two. */
  pins: readonly Pin[];
  every: Every;
  /** Whole bars of output, the last of which may end in silence. */
  bars: number;
  /** The cuts that were pinned, in bars, whatever the density. */
  cuts: readonly number[];
}

/** Output samples per beat at a tempo. */
export const spacingOf = (rate: number, to: number): number => (60 * rate) / to;

/**
 * How many whole bars the record fills at a tempo, from bar 1, padded up
 * rather than cut so nothing of the outro is lost.
 */
export const barsOf = (beats: Beats, to: number): number =>
  Math.max(1, Math.ceil((beatAt(beats, beats.length) * spacingOf(beats.rate, to)) / (BEATS_PER_BAR * spacingOf(beats.rate, to)) - 1e-6));

/** The cuts in beats from bar 1, checked: in order, from zero, and inside the record. */
function cutBeats(cuts: readonly number[], bars: number): number[] {
  const out: number[] = [];
  let last = -Infinity;
  for (const bar of cuts) {
    if (!Number.isFinite(bar) || bar < 0) throw new Error(`not a cut: bar ${bar}`);
    if (bar < last) throw new Error('cuts out of order');
    last = bar;
    if (bar >= bars) continue;
    const beat = bar * BEATS_PER_BAR;
    if (out[out.length - 1] !== beat) out.push(beat);
  }
  return out;
}

/**
 * The record pinned at every cut, and inside each section as densely as
 * `every` says.
 */
export function pinnedOf(beats: Beats, to: number, cuts: readonly number[], every: Every): Pinned {
  const spacing = spacingOf(beats.rate, to);
  const bars = barsOf(beats, to);
  const end = bars * BEATS_PER_BAR;
  const starts = cutBeats(cuts, bars);
  const before = Math.min(0, beats.first);
  const at = new Set<number>([before, 0, end, ...starts]);
  const edges = [...(before < 0 ? [before] : []), 0, ...starts.filter((b) => b > 0), end];
  for (let i = 0; i + 1 < edges.length; i++) {
    const from = edges[i];
    const upto = edges[i + 1];
    const step = every === 'beat' ? 1 : every === 'bar' ? BEATS_PER_BAR : every === 'phrase' ? PHRASE * BEATS_PER_BAR : 0;
    if (step === 0) continue;
    // Beats and bars are counted from the top, so a cut on a fraction of a
    // bar still pins the bar lines after it and not a fraction past each. A
    // phrase is counted from its own section, from the first whole bar in it:
    // a section pinned to eight bars is two phrases of its own, wherever it
    // falls in the song.
    const first = every === 'phrase' ? Math.ceil(from / BEATS_PER_BAR) * BEATS_PER_BAR : Math.ceil(from / step) * step;
    // Before 1.1.1 the phrases are counted back from it, as the bars are.
    if (every === 'phrase' && from < 0) {
      for (let beat = -step; beat > from; beat -= step) at.add(beat);
      continue;
    }
    for (let beat = first; beat < upto; beat += step) if (beat > from) at.add(beat);
  }
  const pins = [...at].sort((a, b) => a - b).map((beat) => ({ source: sampleOf(beats, beat), output: beat * spacing }));
  return { rate: beats.rate, length: beats.length, spacing, pins, every, bars, cuts: starts.map((b) => b / BEATS_PER_BAR) };
}

/** The segment a value falls in along one coordinate: the pin on its left, held to the ends. */
function segmentOf(pins: readonly Pin[], key: keyof Pin, value: number): number {
  let lo = 0;
  let hi = pins.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pins[mid][key] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The output sample a source sample plays at, the end segments carried on past the pins. */
export function outputOf(pinned: Pinned, source: number): number {
  const { pins } = pinned;
  const i = segmentOf(pins, 'source', source);
  const a = pins[i];
  const b = pins[i + 1];
  return a.output + ((source - a.source) * (b.output - a.output)) / (b.source - a.source);
}

/** The source sample playing at an output sample. */
export function sourceOf(pinned: Pinned, output: number): number {
  const { pins } = pinned;
  const i = segmentOf(pins, 'output', output);
  const a = pins[i];
  const b = pins[i + 1];
  return a.source + ((output - a.output) * (b.source - a.source)) / (b.output - a.output);
}

/** Source samples per output sample at an output sample: over one plays faster than the record did. */
export function speedAt(pinned: Pinned, output: number): number {
  const { pins } = pinned;
  const i = segmentOf(pins, 'output', output);
  return (pins[i + 1].source - pins[i].source) / (pins[i + 1].output - pins[i].output);
}

/**
 * How far each whole beat lands from its grid line, in output samples: zero
 * at a pin, and between pins whatever the record's own drift left over. What
 * a denser pinning would correct, beat by beat.
 */
export function errorsOf(beats: Beats, pinned: Pinned): Float64Array {
  const end = pinned.bars * BEATS_PER_BAR;
  const out = new Float64Array(end + 1);
  for (let beat = 0; beat <= end; beat++) {
    out[beat] = Math.abs(outputOf(pinned, sampleOf(beats, beat)) - beat * pinned.spacing);
  }
  return out;
}

/** The worst bar line, in seconds. */
const worstBarOf = (beats: Beats, pinned: Pinned): number => {
  const errors = errorsOf(beats, pinned);
  let worst = 0;
  for (let beat = 0; beat < errors.length; beat += BEATS_PER_BAR) worst = Math.max(worst, errors[beat]);
  return worst / pinned.rate;
};

/** Ten milliseconds: about a sixty-fourth of a beat at 128, and under what a bar line can be heard to miss by. */
export const TOLERANCE = 0.01;

/**
 * The sparsest pinning whose bar lines all land within `tolerance` seconds,
 * and how far the worst one is off. Per bar always lands them, so per beat is
 * never chosen here: that one is asked for, not measured into.
 */
export function loosest(beats: Beats, to: number, cuts: readonly number[], tolerance = TOLERANCE): { every: Every; worst: number } {
  let last = { every: 'bar' as Every, worst: 0 };
  for (const every of ['section', 'phrase', 'bar'] as const) {
    const worst = worstBarOf(beats, pinnedOf(beats, to, cuts, every));
    last = { every, worst };
    if (worst <= tolerance) break;
  }
  return last;
}
