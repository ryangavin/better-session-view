import { describe, expect, it } from 'vitest';
import type { Peak } from '../../audio.ts';
import { cellsIn, coarser, levelFor, levelsOf, packedOf } from './levels.ts';

const ramp = (n: number): Peak[] =>
  Array.from({ length: n }, (_, i) => ({ min: -(i % 9) / 9, max: (i % 7) / 7 }));

describe('packing a reading', () => {
  it('interleaves min and max, and says how many cells that is', () => {
    const steps = packedOf([{ min: -1, max: 0.5 }, { min: -0.25, max: 1 }]);
    expect(Array.from(steps)).toEqual([-1, 0.5, -0.25, 1]);
    expect(steps).toBeInstanceOf(Float32Array);
    expect(cellsIn(steps)).toBe(2);
  });
});

describe('folding a level', () => {
  it('takes the widest excursion of each pair', () => {
    const steps = packedOf([
      { min: -0.2, max: 0.9 },
      { min: -0.8, max: 0.1 },
    ]);
    // Float32, so the comparison is to the precision the store actually keeps.
    const folded = coarser(steps);
    expect(folded[0]).toBeCloseTo(-0.8, 6);
    expect(folded[1]).toBeCloseTo(0.9, 6);
  });

  it('halves, and stops where a level is finer than any lane asks for', () => {
    const levels = levelsOf(packedOf(ramp(8192)), 512);
    expect(cellsIn(levels[0])).toBe(8192);
    expect(cellsIn(levels[1])).toBe(4096);
    expect(cellsIn(levels[levels.length - 1])).toBeLessThanOrEqual(512);
  });

  it('costs one more copy of everything, not one per rung', () => {
    // Halving twice over sums to the length it began with. If this grows past a
    // small multiple, something is not halving.
    const levels = levelsOf(packedOf(ramp(16384)), 512);
    expect(levels.reduce((n, one) => n + one.length, 0)).toBeLessThan(16384 * 2 * 2.1);
  });

  it('never loses a transient, however far it is folded', () => {
    // The whole reason this folds rather than samples. One spike among eight
    // thousand quiet cells reaches the coarsest rung there is.
    const quiet = ramp(8192).map(() => ({ min: -0.01, max: 0.01 }));
    quiet[3457] = { min: -0.97, max: 0.97 };
    for (const level of levelsOf(packedOf(quiet), 4)) {
      let high = 0;
      for (let i = 0; i < cellsIn(level); i++) high = Math.max(high, level[i * 2 + 1]);
      expect(high).toBeCloseTo(0.97, 5);
    }
  });
});

describe('choosing a rung', () => {
  const levels = levelsOf(packedOf(ramp(65536)), 512);

  it('reads a short array for the widest view', () => {
    const chosen = levelFor(levels, 0, 1, 2000);
    expect(chosen.level).toBeGreaterThan(0);
    expect(chosen.to - chosen.from).toBeLessThan(65536 / 8);
  });

  it('keeps a cell per column at every zoom', () => {
    for (const [from, to] of [[0, 1], [0, 0.5], [0.2, 0.35], [0.9, 1], [0, 0.001]]) {
      const chosen = levelFor(levels, from, to, 2000);
      const across = chosen.to - chosen.from;
      const master = Math.ceil((to - from) * 65536);
      if (master >= 2000) expect(across).toBeGreaterThanOrEqual(2000);
      expect(across).toBeLessThanOrEqual(Math.max(4000, master));
    }
  });

  it('stays on the master once the view is narrow', () => {
    // Zoomed in there is nothing to save and detail to lose.
    const chosen = levelFor(levels, 0.5, 0.51, 2000);
    expect(chosen.level).toBe(0);
    expect(chosen.steps).toBe(levels[0]);
  });
});
