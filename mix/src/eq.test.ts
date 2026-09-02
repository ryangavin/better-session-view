import { describe, expect, it } from 'vitest';
import { BAND, BUTTERWORTH_DB, BUTTERWORTH_Q, FLAT, HIGH_BEGINS, isFlat, KILL, linearOf, LOW_ENDS } from './eq.ts';

/**
 * The numbers the graph is set from. The graph itself is Web Audio and only
 * runs in a window; what can be pinned here is that the knobs and the nodes
 * agree about what a reading means.
 */

describe('a band gain', () => {
  it('is unity at zero', () => {
    expect(linearOf(0)).toBe(1);
  });

  it('is half amplitude six down, as decibels say', () => {
    expect(linearOf(-6.0206)).toBeCloseTo(0.5, 4);
  });

  it('is silence at the stop, not a very quiet band', () => {
    expect(linearOf(KILL)).toBe(0);
    expect(linearOf(KILL - 10)).toBe(0);
    expect(linearOf(KILL + 0.1)).toBeGreaterThan(0);
  });

  it('is the bottom of the knob', () => {
    expect(BAND.min).toBe(KILL);
    expect(BAND.defaultValue).toBe(0);
  });
});

describe('the cuts', () => {
  it('meet at a kilohertz rather than overlap, so the low can never end above the high', () => {
    expect(LOW_ENDS.max).toBeLessThanOrEqual(HIGH_BEGINS.min);
  });

  it('rest where the bands say they do', () => {
    expect(LOW_ENDS.defaultValue).toBe(FLAT.lowEnds);
    expect(HIGH_BEGINS.defaultValue).toBe(FLAT.highBegins);
  });
});

describe('a Butterworth section', () => {
  it('is minus three decibels where the node wants decibels, and 0.707 where it wants a Q', () => {
    expect(BUTTERWORTH_DB).toBeCloseTo(-3.0103, 3);
    expect(BUTTERWORTH_Q).toBeCloseTo(0.7071, 3);
    expect(10 ** (BUTTERWORTH_DB / 20)).toBeCloseTo(BUTTERWORTH_Q, 6);
  });
});

describe('flat', () => {
  it('is every band at rest', () => {
    expect(isFlat(FLAT)).toBe(true);
    expect(isFlat({ ...FLAT, mid: 0.5 })).toBe(false);
    expect(isFlat({ ...FLAT, lowEnds: 300 })).toBe(false);
  });
});
