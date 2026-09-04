import { describe, expect, it } from 'vitest';
import type { Peak } from '../audio.ts';
import { levelsOf, packedOf } from './levels.ts';
import { densityFor, edgeInk, edgesOf, samplesFrom } from './outline.ts';

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

describe('how fine to draw', () => {
  it('is coarse across the whole track and fine inside a bar', () => {
    expect(densityFor(1)).toBeCloseTo(0.25, 2);
    expect(densityFor(0.01)).toBeGreaterThan(1.5);
  });

  it('only ever gets finer as the view narrows', () => {
    // A drawing that got coarser on the way in would be losing the thing being
    // looked at, and it would do it in the middle of a gesture.
    let last = 0;
    for (const share of [1, 0.7, 0.4, 0.2, 0.1, 0.05, 0.02, 0.005]) {
      const now = densityFor(share);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it('stays inside its ends, whatever it is handed', () => {
    for (const share of [0, -1, 1e-9, 5, Number.NaN]) {
      const d = densityFor(share);
      expect(d).toBeGreaterThanOrEqual(0.25);
      expect(d).toBeLessThanOrEqual(2);
    }
  });
});

describe('how strongly to draw the edge', () => {
  it('steps back as the drawing gets finer', () => {
    // The illusion it exists for: perimeter climbs with the point count and the
    // area it encloses does not, so an unchanged line reads as a growing rim.
    expect(edgeInk(0.25)).toBeGreaterThan(edgeInk(1));
    expect(edgeInk(1)).toBeGreaterThan(edgeInk(2));
  });

  it('stays between an edge that shows and one that shouts', () => {
    for (const density of [0.01, 0.25, 1, 2, 64, 0, -1, Number.NaN]) {
      expect(edgeInk(density)).toBeGreaterThanOrEqual(0.3);
      expect(edgeInk(density)).toBeLessThanOrEqual(0.9);
    }
  });

  it('is strong where the outline is most of the drawing', () => {
    // Across a whole track the shape is smooth and the edge is what says where
    // it is; that is the one place the border should be assertive.
    expect(edgeInk(densityFor(1))).toBeCloseTo(0.9, 2);
  });
});

describe('a shape that would enclose nothing', () => {
  it('draws silence as a line rather than as a gap', () => {
    // Min and max both zero: the edges meet, the fill has no area, and the lane
    // showed nothing at all where the track was simply quiet.
    const silent = levelsOf(packedOf(Array.from({ length: 4096 }, () => ({ min: 0, max: 0 }))), 512);
    const shape = edgesOf(silent, ask());
    for (let i = 0; i < shape.points; i++) {
      expect(shape.lowY[i] - shape.topY[i]).toBeGreaterThanOrEqual(1);
      // And it sits on the middle, because that is where silence is.
      expect((shape.topY[i] + shape.lowY[i]) / 2).toBeCloseTo(50, 5);
    }
  });

  it('keeps a single sample visible when every point is one', () => {
    // Zoomed far enough in, a point covers one sample, whose own min and max
    // are the same number — the whole waveform used to disappear here.
    const wave = new Float32Array(64).map((_, i) => Math.sin(i / 3) * 0.5);
    const shape = samplesFrom([wave], { ...ask({ width: 800 }), length: wave.length });
    expect(shape.points).toBeGreaterThan(1);
    for (let i = 0; i < shape.points; i++) {
      expect(shape.lowY[i] - shape.topY[i]).toBeGreaterThanOrEqual(1);
    }
  });

  it('holds a hair-thin shape apart about its own middle', () => {
    // An excursion far too small to fill a pixel. It must become a pixel
    // without being moved: a quiet passage belongs where it happened.
    const wave = new Float32Array(64).map((_, i) => (i % 2 ? 0.0008 : -0.0008));
    const shape = samplesFrom([wave], { ...ask({ height: 100, headroom: 0.86 }), length: 64 });
    for (let i = 0; i < shape.points; i++) {
      expect(shape.lowY[i] - shape.topY[i]).toBeCloseTo(1, 5);
      expect((shape.topY[i] + shape.lowY[i]) / 2).toBeCloseTo(50, 1);
    }
  });

  it('leaves a shape that already has room alone', () => {
    const loudEnough = levelsOf(packedOf(loud(4096)), 512);
    const shape = edgesOf(loudEnough, ask());
    let widest = 0;
    for (let i = 0; i < shape.points; i++) widest = Math.max(widest, shape.lowY[i] - shape.topY[i]);
    expect(widest).toBeGreaterThan(10);
  });
});
