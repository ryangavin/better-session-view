import { describe, expect, it } from 'vitest';
import type { Peak } from './audio.ts';
import { TICKS_PER_BAR } from './grid.ts';
import { barText, cut, cutsOf, dragged, heard, lengthText, named, removed, slicesOf, snappedBar, UNNAMED } from './slices.ts';
import { evenBeats } from './warp.ts';

/**
 * What this protects is a ruler that reads the song rather than measures it.
 *
 * The failure is quiet: eight even spans over a track whose drop is at bar 33
 * look like an arrangement and are not one, and a cut that lands a beat off
 * the phrase reads as a mistake in the grid rather than in the ruler. Both are
 * invisible unless you know the record.
 */

const RATE = 44100;
/** A grid of `bars` bars at 120, one bar every two seconds. */
const gridOf = (bars: number) => evenBeats(RATE, bars * 2 * RATE, 120, 0);

/**
 * A stem drawn as peaks: `level(bar)` says how loud it is in each bar, and
 * every bar gets the same number of columns.
 */
const stem = (bars: number, level: (bar: number) => number, perBar = 32): Peak[] =>
  Array.from({ length: bars * perBar }, (_, i) => {
    const l = level(Math.floor(i / perBar));
    return { min: -l, max: l };
  });

/** Loud from `from` up to `to`, quiet elsewhere. */
const between = (from: number, to: number, loud = 1, quiet = 0) => (bar: number) =>
  bar >= from && bar < to ? loud : quiet;

describe('the edits', () => {
  const four = [
    { bar: 0, name: 'a' },
    { bar: 8, name: 'b' },
    { bar: 16, name: 'c' },
    { bar: 24, name: 'd' },
  ];

  it('snaps a bar to the rung the ruler is drawing', () => {
    expect(snappedBar(8.4, TICKS_PER_BAR)).toBe(8);
    expect(snappedBar(8.4, TICKS_PER_BAR / 4)).toBe(8.5);
    expect(snappedBar(8.6, TICKS_PER_BAR * 4)).toBe(8);
  });

  it('drags a cut between its neighbours and no further', () => {
    expect(dragged(four, 1, 12, 32, 1)[1].bar).toBe(12);
    expect(dragged(four, 1, 30, 32, 1)[1].bar).toBe(15);
    expect(dragged(four, 1, -3, 32, 1)[1].bar).toBe(0);
    expect(dragged(four, 3, 40, 32, 1)[3].bar).toBe(31);
  });

  it('never moves the first slice', () => {
    expect(dragged(four, 0, 4, 32, 1)[0].bar).toBe(0);
  });

  it('cuts the slice under the bar and selects the new one', () => {
    const { slices, index } = cut(four, 12);
    expect(index).toBe(2);
    expect(slices.map((s) => s.bar)).toEqual([0, 8, 12, 16, 24]);
    expect(slices[2].name).toBe(UNNAMED);
  });

  it('does not cut where there is a cut already', () => {
    const { slices, index } = cut(four, 16);
    expect(index).toBe(2);
    expect(slices).toHaveLength(4);
  });

  it('cuts after the last slice too', () => {
    expect(cut(four, 28).slices.map((s) => s.bar)).toEqual([0, 8, 16, 24, 28]);
  });

  it('removes a slice into the one before it, but never the first', () => {
    expect(removed(four, 2).map((s) => s.name)).toEqual(['a', 'b', 'd']);
    expect(removed(four, 0)).toHaveLength(4);
  });

  it('reads a bar and a length', () => {
    expect(barText(8)).toBe('9');
    expect(barText(8.5)).toBe('9.3');
    expect(lengthText(8)).toBe('8');
    expect(lengthText(8.25)).toBe('8.25');
  });
});

describe('what is heard', () => {
  it('puts each column in the bar it falls in, scaled to the loudest bar', () => {
    const grid = gridOf(8);
    const { levels, bars } = heard({ drums: stem(8, (bar) => (bar < 4 ? 0.2 : 0.4)) }, grid);
    expect(bars).toBe(8);
    expect(Array.from(levels.drums)).toEqual([0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1]);
  });
});

describe('where the cuts fall', () => {
  it('cuts where the drums come in and go out, and nowhere else', () => {
    const grid = gridOf(64);
    const peaks = {
      drums: stem(64, between(16, 48)),
      bass: stem(64, () => 0.5),
    };
    expect(cutsOf(heard(peaks, grid))).toEqual([16, 48]);
  });

  it('cuts where a vocal arrives over an unchanged beat', () => {
    const grid = gridOf(64);
    const peaks = {
      drums: stem(64, () => 1),
      vocals: stem(64, between(32, 64, 0.3)),
    };
    expect(cutsOf(heard(peaks, grid))).toEqual([32]);
  });

  it('ignores a one-bar fill', () => {
    const grid = gridOf(32);
    const peaks = { drums: stem(32, (bar) => (bar === 15 ? 1 : 0.6)) };
    expect(cutsOf(heard(peaks, grid))).toEqual([]);
  });

  it('cuts nothing in a track that never changes', () => {
    const grid = gridOf(32);
    expect(cutsOf(heard({ drums: stem(32, () => 0.7) }, grid))).toEqual([]);
  });
});

describe('what they are called', () => {
  it('names the loudest span the drop, the rise into it the build, and the ends', () => {
    const grid = gridOf(64);
    const peaks = {
      drums: stem(64, (bar) => (bar < 16 ? 0.2 : bar < 32 ? 0.2 + ((bar - 16) / 16) * 0.6 : bar < 48 ? 1 : 0.3)),
      // The bass sits out the build, which is how a build usually announces itself.
      bass: stem(64, (bar) => (bar < 16 ? 0.4 : bar < 32 ? 0 : bar < 48 ? 1 : 0.1)),
    };
    const listened = heard(peaks, grid);
    const cuts = cutsOf(listened);
    expect(cuts).toContain(16);
    expect(cuts).toContain(32);
    expect(cuts).toContain(48);
    const names = named(listened, cuts).map((s) => s.name);
    expect(names[0]).toBe('Intro');
    expect(names[names.length - 1]).toBe('Outro');
    expect(names).toContain('Drop');
    expect(names[names.indexOf('Drop') - 1]).toBe('Build');
  });

  it('calls the quiet span between two drops a break, and numbers repeats', () => {
    const grid = gridOf(80);
    const drop = (bar: number) => (bar >= 16 && bar < 32) || (bar >= 48 && bar < 64);
    const peaks = {
      drums: stem(80, (bar) => (drop(bar) ? 1 : 0.2)),
      bass: stem(80, (bar) => (drop(bar) ? 1 : 0.1)),
    };
    const listened = heard(peaks, grid);
    const names = named(listened, cutsOf(listened)).map((s) => s.name);
    expect(names).toEqual(['Intro', 'Drop', 'Break', 'Drop 2', 'Outro']);
  });

  it('starts at bar 1 whatever it heard', () => {
    const grid = gridOf(64);
    const slices = slicesOf({ drums: stem(64, between(8, 40)) }, grid);
    expect(slices[0].bar).toBe(0);
  });

  it('falls back to the even eight with nothing to hear', () => {
    expect(slicesOf({}, gridOf(64))).toHaveLength(8);
  });
});
