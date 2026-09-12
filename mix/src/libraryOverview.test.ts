import { expect, it } from 'vitest';
import { libraryOverview } from './libraryOverview.ts';
import type { KeptScans } from './openflow.ts';

const scan = (values: number[]): KeptScans => ({ stems: '', key: '', rate: 200,
  sources: { full: { bins: values.length / 5, values: new Float32Array(values) } } });

it('keeps asymmetric activity and the last scan bin in the representative envelope', () => {
  const values = new Array(680).fill(0);
  values[0] = -.5; values[1] = .25;
  values[675] = -1; values[676] = 1;
  const path = libraryOverview(scan(values));
  expect(path?.[0].path).toBe('M0.5,10.30V12.85');
  expect(path?.[67].path).toBe('M67.5,6.11V15.89');
  expect(path).toHaveLength(68);
  expect(path?.every(column => column.height === 22)).toBe(true);
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

it('distinguishes sustained activity from sparse transients without normalizing each track', () => {
  const source = (active: number, amplitude: number) => {
    const values = new Array(680*5).fill(0);
    for (let i=0;i<active;i++) {values[i*5]=-amplitude;values[i*5+1]=amplitude;}
    return libraryOverview(scan(values))!;
  };
  const top = (path: string) => Number(path.split(',')[1].split('V')[0]);
  const transient=source(1,1), sustained=source(10,1), quieter=source(10,.5);
  expect(top(transient[0].path)).toBeLessThan(11);
  expect(top(sustained[0].path)).toBe(1);
  expect(top(quieter[0].path)).toBeGreaterThan(top(sustained[0].path));
  expect(top(transient[0].path)).toBeGreaterThan(top(quieter[0].path));
  expect(transient[1].path).toBe('M1.5,11.00V11.00');
});
