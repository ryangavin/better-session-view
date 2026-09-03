import { describe, expect, it } from 'vitest';
import { resample } from './resample.ts';

const sine = (length: number, period: number, phase = 0): Float32Array =>
  Float32Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * (i + phase)) / period));

describe('resample', () => {
  it('is the identity at speed one from a whole sample', () => {
    const wave = sine(4000, 50);
    const back = resample(wave, 1, 100, 3000);
    for (let i = 0; i < 3000; i++) expect(back[i]).toBeCloseTo(wave[100 + i], 5);
  });

  it('reads between the samples at a fractional start', () => {
    const wave = sine(4000, 50);
    const half = resample(wave, 1, 100.5, 1000);
    const want = sine(4000, 50, 100.5);
    for (let i = 20; i < 1000; i++) expect(half[i]).toBeCloseTo(want[i], 3);
  });

  it('plays longer and lower at a speed under one', () => {
    const wave = sine(8000, 50);
    const slow = resample(wave, 0.5, 0, 8000);
    const want = sine(8000, 100);
    for (let i = 20; i < 3900; i++) expect(slow[i]).toBeCloseTo(want[i], 3);
  });

  it('is silent past either end', () => {
    const wave = sine(1000, 50);
    const out = resample(wave, 1, 990, 100);
    expect(out[50]).toBe(0);
    expect(out[99]).toBe(0);
  });

  it('keeps the level: a signal comes through at the loudness it went in', () => {
    const noise = Float32Array.from({ length: 40000 }, (_, i) => Math.sin(i * 12.9898) * Math.cos(i * 0.37));
    const out = resample(noise, 0.9996, 1000, 30000);
    const rms = (x: Float32Array, from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += x[i] * x[i];
      return Math.sqrt(sum / (to - from));
    };
    const ratio = rms(out, 100, 29900) / rms(noise, 1100, 1100 + Math.round(29800 * 0.9996));
    expect(20 * Math.log10(ratio)).toBeCloseTo(0, 2);
  });
});
