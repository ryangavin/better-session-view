import { describe, expect, it } from 'vitest';
import { gridEvidence } from './gridEvidence.ts';
import type { Heard } from '../transients.ts';
const grid = { rate: 1000, length: 4000, first: 0, samples: [0, 1000, 2000, 3000] };
const heard = (times: number[]): Heard => ({ rate: 48000, seconds: 4, transients: times.map((at) => ({ at, sample: at * 48000, band: 'low', strength: 1, level: 1 })) });
describe('grid evidence', () => {
  it('compares seconds across rates, retains signed residuals, and applies tolerance inclusively', () => {
    const got = gridEvidence(grid, heard([0.02, 0.98, 2.06, 3]), 4, 20);
    expect(got.support).toBe(0.75);
    expect(got.beats[1].residualMs).toBeCloseTo(-20);
    expect(got.p95Ms).toBeCloseTo(60);
    expect(got.tailSeconds).toBe(1);
  });
  it('does not invent support in silence or extrapolate stored grid coverage', () => {
    const got = gridEvidence(grid, heard([]), 20, 40);
    expect(got.support).toBe(0);
    expect(got.medianMs).toBeNull();
    expect(got.tailSeconds).toBe(17);
    expect(got.windows[1].count).toBe(0);
  });
  it('ignores high-only hits and reports malformed map intervals', () => {
    const h = heard([0]); h.transients[0].band = 'high';
    const got = gridEvidence({ ...grid, samples: [0, 0, 2000, NaN] }, h, 4, 40);
    expect(got.invalidIntervals).toBe(2);
    expect(got.supported).toBe(0);
  });
  it('keeps an end-of-file beat in the final window and excludes out-of-file beats', () => {
    const got = gridEvidence({ ...grid, samples: [-1000, 0, 10000, 11000] }, heard([0, 10]), 10, 40);
    expect(got.beats.length).toBe(2);
    expect(got.windows[0].count).toBe(2);
    expect(got.support).toBe(1);
  });
});
