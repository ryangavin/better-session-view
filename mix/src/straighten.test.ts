import { describe, expect, it } from 'vitest';
import { straightened } from './straighten.ts';

const RATE = 1000;

/** A click on every beat at a tempo, from an offset, for so many seconds. */
const clicks = (bpm: number, offset: number, seconds: number): Float32Array => {
  const out = new Float32Array(seconds * RATE);
  for (let at = offset; at < seconds; at += 60 / bpm) out[Math.round(at * RATE)] = 1;
  return out;
};

const peaksIn = (channel: Float32Array): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 1 < channel.length; i++) {
    if (channel[i] > 0.5 && (i === 0 || channel[i] >= channel[i - 1]) && channel[i] >= channel[i + 1]) out.push(i);
  }
  return out;
};

describe('straightened', () => {
  it('starts on 1.1.1 and lands every beat a sixtieth of the tempo apart', () => {
    const laid = straightened([clicks(120.5, 0.7, 20)], RATE, { bpm: 120.5, offset: 0.7, to: 120 });
    const found = peaksIn(laid.channels[0]);
    expect(found[0]).toBe(0);
    const period = (60 * RATE) / 120;
    found.forEach((at, k) => expect(Math.abs(at - k * period)).toBeLessThanOrEqual(1));
  });

  it('runs a whole number of bars, padding rather than cutting', () => {
    const laid = straightened([clicks(120, 0, 10.2)], RATE, { bpm: 120, offset: 0, to: 120 });
    expect(laid.bars).toBe(6);
    expect(laid.seconds).toBeCloseTo(12, 6);
    expect(laid.channels[0].length).toBe(12000);
  });

  it('plays slower when laid at a lower tempo', () => {
    const laid = straightened([clicks(128.055, 0, 60)], RATE, { bpm: 128.055, offset: 0, to: 128 });
    expect(laid.speed).toBeCloseTo(128 / 128.055, 9);
    expect(laid.seconds).toBeGreaterThan(60);
  });
});
