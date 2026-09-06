import { expect, it } from 'vitest';
import { spectralCoverage, measureCoverage } from './ribbonFullness.ts';

it('distinguishes a narrow spectrum from broad coverage at the same amplitude and ignores gain', () => {
  const narrow = [1, ...Array(15).fill(0)];
  const broad = Array(16).fill(0.25);
  expect(spectralCoverage(broad)).toBeGreaterThan(spectralCoverage(narrow));
  expect(spectralCoverage(broad.map((v) => v * 0.1))).toBeCloseTo(spectralCoverage(broad));
  expect(spectralCoverage(Array(16).fill(0))).toBe(0);
});
it('preserves opposing stereo channels and cancels analysis', async () => {
  const audio = Float32Array.from({ length: 4096 }, (_, i) => Math.sin(i * 2 * Math.PI * 440 / 48000));
  const data = { seconds: audio.length / 48000, step: 0.01, rms: new Float32Array(9), peak: new Float32Array(9), bands: [], stems: [] };
  const controller = new AbortController();
  const result = await measureCoverage([{ id: 'x', channels: [audio, audio.map((v) => -v)] }], 48000, data, controller.signal);
  expect(Math.max(...result)).toBeGreaterThan(0);
  controller.abort();
  await expect(measureCoverage([{ id: 'x', channels: [audio] }], 48000, data, controller.signal)).rejects.toThrow();
});
