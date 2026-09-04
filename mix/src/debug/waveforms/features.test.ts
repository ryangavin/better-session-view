import { describe, it, expect } from 'vitest';
import { smooth, activity } from './features.ts';

describe('waveform landmarks', () => {
  it('smooths power rather than signed values or arithmetic amplitudes', () => {
    const values = new Float32Array([0, 1, 0]);
    const result = smooth(values, 0.1, 0.2);
    expect(result[1]).toBeCloseTo(Math.sqrt(1 / 3));
    expect(Array.from(values)).toEqual([0, 1, 0]);
  });
  it('ignores silence and low-level separation bleed', () => {
    expect(activity(new Float32Array(100).fill(0.001), 0.1)).toEqual([]);
  });
  it('closes short gaps but preserves real exits and discards short islands', () => {
    const levels = new Float32Array(50);
    levels.fill(0.2, 2, 12); levels.fill(0.2, 14, 24);
    levels.fill(0.2, 30, 31); levels.fill(0.2, 38, 49);
    const spans = activity(levels, 0.1);
    expect(spans).toHaveLength(2);
    expect(spans[0].from).toBeCloseTo(0.2);
    expect(spans[0].to).toBeCloseTo(2.4);
    expect(spans[1].from).toBeCloseTo(3.8);
    expect(spans[1].to).toBeCloseTo(4.9);
  });
});
