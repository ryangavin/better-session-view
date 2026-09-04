import { describe, expect, it } from 'vitest';
import type { Peak } from '../../audio.ts';
import { levelsOf, packedOf } from './levels.ts';
import { edgesOf } from './outline.ts';

const ask = (over: Partial<Parameters<typeof edgesOf>[1]> = {}) => ({
  from: 0,
  to: 1,
  width: 1000,
  height: 100,
  density: 1,
  smooth: 1,
  headroom: 0.86,
  ...over,
});

const loud = (n: number): Peak[] =>
  Array.from({ length: n }, (_, i) => ({ min: -Math.abs(Math.sin(i / 40)), max: Math.abs(Math.sin(i / 40)) }));

describe('the silhouette', () => {
  const levels = levelsOf(packedOf(loud(32768)), 512);

  it('draws what the lane can show, not what the master holds', () => {
    // The point of the ladder: the whole track across a thousand pixels is a
    // thousand points and a few thousand cells, not thirty-two thousand.
    const shape = edgesOf(levels, ask());
    expect(shape.points).toBeLessThanOrEqual(1000);
    expect(shape.read).toBeLessThan(4000);
    expect(shape.level).toBeGreaterThan(0);
  });

  it('reads the master when the view is narrow enough to want it', () => {
    const shape = edgesOf(levels, ask({ from: 0.5, to: 0.505 }));
    expect(shape.level).toBe(0);
  });

  it('asks for fewer points when told to be coarser', () => {
    const fine = edgesOf(levels, ask({ density: 1 }));
    const coarse = edgesOf(levels, ask({ density: 0.25 }));
    expect(coarse.points).toBeLessThan(fine.points);
    // And coarser means reading less, which is the whole cost argument.
    expect(coarse.read).toBeLessThanOrEqual(fine.read);
  });

  it('never asks for more points than there are cells to draw them from', () => {
    // A window of a handful of cells stretched across a wide lane must not
    // invent points; that is a drawing enlarged rather than summarised.
    const shape = edgesOf(levels, ask({ from: 0, to: 0.0001, density: 2 }));
    expect(shape.points).toBeLessThanOrEqual(shape.read);
  });

  it('puts every point inside the lane, at the headroom it was given', () => {
    const shape = edgesOf(levels, ask({ height: 100, headroom: 0.86 }));
    for (let i = 0; i < shape.points; i++) {
      expect(shape.topY[i]).toBeGreaterThanOrEqual(50 - 43.001);
      expect(shape.lowY[i]).toBeLessThanOrEqual(50 + 43.001);
      // The top edge is never below the bottom one, whatever the summary said.
      expect(shape.topY[i]).toBeLessThanOrEqual(shape.lowY[i] + 0.001);
    }
  });

  it('walks left to right across the lane', () => {
    const shape = edgesOf(levels, ask({ width: 1000 }));
    expect(shape.topX[0]).toBeLessThan(shape.topX[shape.points - 1]);
    expect(shape.topX[shape.points - 1]).toBeLessThanOrEqual(1000);
  });

  it('survives a window at the very end of the track', () => {
    const shape = edgesOf(levels, ask({ from: 0.999, to: 1 }));
    expect(shape.points).toBeGreaterThan(0);
    expect(Number.isFinite(shape.read)).toBe(true);
  });
});
