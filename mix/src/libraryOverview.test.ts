import { expect, it } from 'vitest';
import { libraryOverview } from './libraryOverview.ts';
import type { KeptScans } from './openflow.ts';

const scan = (values: number[]): KeptScans => ({ stems: '', key: '', rate: 200,
  sources: { full: { bins: values.length / 5, values: new Float32Array(values) } } });

it('keeps the extrema of the real whole-song scan, including its last bin', () => {
  const values = new Array(680).fill(0);
  values[0] = -.5; values[1] = .25;
  values[675] = -1; values[676] = 1;
  const path = libraryOverview(scan(values));
  expect(path?.[0].path).toBe('M0.5,7.00V13.00');
  expect(path?.[67].path).toBe('M67.5,1.00V17.00');
  expect(path).toHaveLength(68);
});

it('does not invent an original waveform from missing, stem-only or invalid caches', () => {
  expect(libraryOverview(null)).toBeNull();
  expect(libraryOverview({ stems: '', key: '', rate: 200, sources: { drums: { bins: 1, values: new Float32Array(5) } } })).toBeNull();
  expect(libraryOverview(scan([NaN, .5, 0, 0, 0]))).toBeNull();
});

it('averages saved spectral energy over each miniature column without baking colors', () => {
  const values = new Array(680).fill(0);
  values[2] = 2; values[3] = 4; values[4] = 6;
  values[7] = 4; values[8] = 8; values[9] = 12;
  expect(libraryOverview(scan(values))?.[0].energy).toEqual([3, 6, 9]);
  values[2] = -1;
  expect(libraryOverview(scan(values))).toBeNull();
});
