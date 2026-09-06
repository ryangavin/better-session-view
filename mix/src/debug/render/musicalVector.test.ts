import { expect, it } from 'vitest';
import { musicalData, powerPrefix, rmsBetween } from './musicalVector.ts';
import { edgesOf } from '@openflow/widgets/wave/outline.ts';
it('preserves relative source levels in pigment instead of normalizing each source', () => {
  const loud = new Float32Array(10).fill(0.8), quiet = new Float32Array(10).fill(0.2);
  const model = musicalData({ seconds: 10, step: 1, peak: loud, rms: loud, bands: [loud, quiet, quiet], stems: [{ id: 'vocals', rms: loud }, { id: 'bass', rms: quiet }] });
  expect(model.pigment[0][5] / model.pigment[1][5]).toBeCloseTo(4);
  expect(model.pigmentCeiling).toBeCloseTo(0.8 ** 0.85 + 0.2 ** 0.85);
});
it('aggregates squared energy rather than averaging amplitudes, including final bins', () => {
  const prefix = powerPrefix(new Float32Array([0, 1, 0.5]));
  expect(rmsBetween(prefix, 0, 2)).toBeCloseTo(Math.sqrt(0.5));
  expect(rmsBetween(prefix, 2, 4)).toBe(0.5);
});
it('preserves an odd final-bin peak through the vector ladder and time mapping', () => {
  const peak = new Float32Array(1025); peak[1024] = 1;
  const model = musicalData({ seconds: 1025, step: 1, peak, rms: peak, bands: [peak, peak, peak], stems: [] });
  const edge = edgesOf(model.peak, { from: 0, to: 1025 / 2048, width: 100, height: 100, density: 0.25, smooth: 0, headroom: 1, thinnest: 0 });
  expect(Math.min(...edge.topY)).toBe(0);
  expect(model.ceiling).toBe(1);
});
