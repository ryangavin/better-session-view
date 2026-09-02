import { describe, expect, it } from 'vitest';
import { passOf, sourceAt, straight } from './schedule.ts';
import { barAt, barsOf, mapOf, placeOf, type Marker } from './warp.ts';

/**
 * What this protects is the sound and the playhead agreeing.
 *
 * The stretcher is told where to read and how fast; the playhead is worked
 * out from the same map on the audio clock. If the two ever disagreed the
 * line would drift away from what is heard — the one failure playback.md
 * exists to rule out — and nothing in a browser would say so.
 */

const SECONDS = 240;
/** 128 for forty bars, 120 for forty, 132 after. */
const bent: Marker[] = [
  { at: 0.5, bar: 0 },
  { at: 0.5 + 40 * (240 / 128), bar: 40 },
  { at: 0.5 + 40 * (240 / 128) + 40 * 2, bar: 80 },
  { at: 0.5 + 40 * (240 / 128) + 40 * 2 + 20 * (240 / 132), bar: 100 },
];
const map = mapOf(SECONDS, bent, 132);

describe('the boundaries of a pass', () => {
  it('reads each segment at the rate that lands the next marker on its bar', () => {
    const pass = passOf(map, 128, 0);
    for (let i = 0; i + 1 < pass.boundaries.length; i++) {
      const a = pass.boundaries[i];
      const b = pass.boundaries[i + 1];
      expect((b.output - a.output) * a.rate).toBeCloseTo(b.input - a.input, 9);
    }
  });

  it('is a rate of one everywhere for a straight map at its own tempo', () => {
    const pass = passOf(barsOf(SECONDS, 128, 0.25), 128, 0);
    // Two: the top of the file, and bar 1 a quarter-second in. The same rate
    // either side, which is what makes it straight.
    expect(pass.boundaries).toHaveLength(2);
    for (const boundary of pass.boundaries) expect(boundary.rate).toBeCloseTo(1, 9);
    expect(straight(barsOf(SECONDS, 128, 0.25), 128)).toBe(true);
    expect(straight(barsOf(SECONDS, 128, 0.25), 127)).toBe(false);
    expect(straight(map, 128)).toBe(false);
  });

  it('plays twice as fast at twice the tempo', () => {
    const pass = passOf(barsOf(SECONDS, 128, 0), 256, 0);
    expect(pass.boundaries[0].rate).toBeCloseTo(2, 9);
    expect(pass.length).toBeCloseTo(SECONDS / 2, 9);
  });

  it('starts mid-segment at that segment’s rate, with only the markers ahead', () => {
    const pass = passOf(map, 128, 100);
    expect(pass.boundaries[0]).toMatchObject({ output: 0, input: 100 });
    expect(pass.boundaries[0].rate).toBeCloseTo(128 / 120, 9);
    expect(pass.boundaries.map((b) => b.input)).toEqual([100, bent[2].at, bent[3].at]);
  });

  it('lasts as long as the bars left take at the target tempo', () => {
    const pass = passOf(map, 120, 0);
    expect(pass.length).toBeCloseTo(((barAt(map, 1) - barAt(map, 0)) * 240) / 120, 9);
  });
});

describe('where the sound is', () => {
  it('inverts the output time at every bar, before bar 1 and past the last marker', () => {
    const startBar = barAt(map, 0);
    for (const bar of [startBar, 0, 37.5, 100, 110]) {
      const elapsed = ((bar - startBar) * 240) / 128;
      expect(sourceAt(map, 128, 0, elapsed, false)).toBeCloseTo(placeOf(map, bar) * SECONDS, 9);
    }
  });

  it('starts from where the pass started', () => {
    expect(sourceAt(map, 128, 100, 0, false)).toBeCloseTo(100, 9);
    expect(sourceAt(map, 128, 100, 1, false)).toBeCloseTo(100 + 128 / 120, 9);
  });

  it('loops back to the top of the file, in bars', () => {
    const pass = passOf(map, 128, 100);
    const wrapped = sourceAt(map, 128, 100, pass.length + 1, true);
    expect(wrapped).toBeCloseTo(sourceAt(map, 128, 0, 1, false), 9);
    expect(wrapped).toBeGreaterThan(0);
    expect(wrapped).toBeLessThan(2);
  });

  it('holds at the end of the file when not looping', () => {
    const pass = passOf(map, 128, 100);
    expect(sourceAt(map, 128, 100, pass.length + 1, false)).toBe(SECONDS);
  });

  it('is never before the start, however early the clock reads', () => {
    expect(sourceAt(map, 128, 100, -0.2, true)).toBeCloseTo(100, 9);
  });
});
