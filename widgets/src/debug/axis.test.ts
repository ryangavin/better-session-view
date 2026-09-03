import { describe, expect, it } from 'vitest';
import { around, clamped, clock, panned, timeOf, xOf, zoomed } from './axis.ts';

const v = { from: 10, to: 20, width: 100, height: 1 };

describe('xOf / timeOf', () => {
  it('map seconds to pixels and back', () => {
    expect(xOf(v, 15)).toBe(50);
    expect(timeOf(v, 50)).toBe(15);
    expect(timeOf(v, xOf(v, 12.345))).toBeCloseTo(12.345);
  });
});

describe('clamped', () => {
  it('keeps the window inside the whole', () => {
    expect(clamped({ from: -5, to: 5 }, 60, 0.02)).toEqual({ from: 0, to: 10 });
    expect(clamped({ from: 55, to: 65 }, 60, 0.02)).toEqual({ from: 50, to: 60 });
  });
  it('starts a window wider than the whole at zero', () => {
    expect(clamped({ from: 3, to: 100 }, 60, 0.02)).toEqual({ from: 0, to: 60 });
  });
  it('never goes narrower than the narrowest', () => {
    expect(clamped({ from: 1, to: 1.001 }, 60, 0.02)).toEqual({ from: 1, to: 1.02 });
  });
});

describe('zoomed', () => {
  it('holds the second under the cursor still', () => {
    const w = { from: 0, to: 10 };
    const z = zoomed(w, 0.5, 0.25);
    expect(z.to - z.from).toBeCloseTo(5);
    expect(z.from + 0.25 * 5).toBeCloseTo(2.5);
  });
});

describe('panned', () => {
  it('moves both edges', () => {
    expect(panned({ from: 1, to: 3 }, 2)).toEqual({ from: 3, to: 5 });
  });
});

describe('around', () => {
  it('pads a span by a share of its length', () => {
    expect(around({ from: 10, to: 20 })).toEqual({ from: 9, to: 21 });
  });
});

describe('clock', () => {
  it('prints minutes and padded seconds', () => {
    expect(clock(0)).toBe('0:00.000');
    expect(clock(61.5)).toBe('1:01.500');
    expect(clock(-1)).toBe('0:00.000');
  });
});
