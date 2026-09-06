import { describe as group, expect, it } from 'vitest';
import { agreementOf, ALGORITHMS, describe, IDS, secondsOf, straight } from './algorithms.ts';
import type { Beats } from './warp.ts';

const RATE = 48000;
const LENGTH = RATE * 30;
const at = (bpm: number, offset = 0): Beats => straight(bpm, offset, RATE, LENGTH)!;

group('the algorithm registry', () => {
  it('names every id exactly once, and describes each', () => {
    expect(new Set(IDS).size).toBe(IDS.length);
    for (const one of ALGORITHMS) {
      expect(one.name.length).toBeGreaterThan(3);
      expect(one.does.length).toBeGreaterThan(10);
      expect(describe(one.id)).toBe(one);
    }
  });
});

group('whether two algorithms agree', () => {
  it('calls a map identical to itself wholly together, on the beat', () => {
    const one = at(128);
    const got = agreementOf(one, one);
    expect(got.together).toBe(1);
    expect(got.medianMs).toBe(0);
    expect(got.ratio).toBeCloseTo(1, 6);
    expect(got.octave).toBeNull();
  });

  it('measures a candidate that runs late, and signs it', () => {
    const got = agreementOf(at(128), at(128, 0.01));
    expect(got.together).toBe(1);
    expect(got.medianMs).toBeCloseTo(10, 1);
    // and early is negative, which is the whole point of signing it
    expect(agreementOf(at(128, 0.01), at(128)).medianMs).toBeCloseTo(-10, 1);
  });

  it('parts company when the candidate is further off than one beat can be', () => {
    // 60 ms is beyond CLOSE, so no reference beat finds a partner
    expect(agreementOf(at(128), at(128, 0.06)).together).toBe(0);
  });

  it('names a half-time read rather than calling it a different tempo', () => {
    const half = agreementOf(at(128), at(64));
    expect(half.octave).toBe('½×');
    const double = agreementOf(at(128), at(256));
    expect(double.octave).toBe('2×');
    expect(agreementOf(at(128), at(192)).octave).toBe('3/2×');
  });

  it('shows a half-time candidate as agreeing while the reference does not', () => {
    // Every beat of a 64 bpm map lands on a 128 bpm beat, but only half of the
    // 128 bpm beats land on a 64 bpm one — which is why both directions matter.
    expect(agreementOf(at(64), at(128)).together).toBe(1);
    expect(agreementOf(at(128), at(64)).together).toBeCloseTo(0.5, 1);
  });

  it('refuses a map with nothing in it rather than dividing by its length', () => {
    const empty: Beats = { rate: RATE, length: LENGTH, first: 0, samples: [] };
    expect(agreementOf(at(128), empty).together).toBe(0);
    expect(agreementOf(empty, at(128)).together).toBe(0);
  });

  it('reads beats in seconds so maps at different rates still line up', () => {
    const slow: Beats = { rate: 24000, length: 24000 * 30, first: 0, samples: [0, 11250, 22500] };
    expect(secondsOf(slow)).toEqual([0, 0.46875, 0.9375]);
    expect(agreementOf(slow, at(128)).together).toBe(1);
  });
});
