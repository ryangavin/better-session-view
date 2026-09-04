import { describe, expect, it } from 'vitest';
import { straightened } from './straighten.ts';
import { beatsOf, evenBeats, tempoOf } from './warp.ts';

const RATE = 1000;

/** A click on every beat at a tempo, from an offset, for so many seconds. */
const clicks = (bpm: number, offset: number, seconds: number): Float32Array => {
  const out = new Float32Array(seconds * RATE);
  for (let at = offset; at < seconds; at += 60 / bpm) out[Math.round(at * RATE)] = 1;
  return out;
};

/** A click on each of these samples, and nothing anywhere else. */
const clicksAt = (anchors: readonly number[], length: number): Float32Array => {
  const out = new Float32Array(length);
  for (const at of anchors) if (at >= 0 && at < length) out[at] = 1;
  return out;
};

/** Anchors from a first one and a spacing per beat, added up. */
const anchorsOf = (first: number, spacings: readonly number[]): number[] => {
  const out = [first];
  for (const spacing of spacings) out.push(out[out.length - 1] + spacing);
  return out;
};

/** The samples the beats came out on, which is what a straightening is judged by. */
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

  it('is bit for bit the record when laid at its own tempo', () => {
    const noise = Float32Array.from({ length: 12000 }, (_, i) => Math.sin(i * 12.9898) * 0.5);
    const laid = straightened([noise], RATE, { bpm: 120, offset: 0.5004, to: 120 });
    for (let i = 0; i < 11000; i++) expect(laid.channels[0][i]).toBe(noise[500 + i]);
  });

  it('lands every beat of a slowing record on the output grid', () => {
    // Forty beats easing from 120 down to 100: no single speed puts them all
    // on a grid, and the tempo the whole thing averages to is the best a
    // straight line can do.
    const spacings = Array.from({ length: 40 }, (_, k) => Math.round(500 + (k * 100) / 40));
    const anchors = anchorsOf(500, spacings);
    const length = anchors[anchors.length - 1] + 500;
    const beats = beatsOf(RATE, length, 0, anchors);
    const laid = straightened([clicksAt(anchors, length)], RATE, {
      bpm: tempoOf(beats),
      offset: anchors[0] / RATE,
      to: 120,
      beats,
    });
    const found = peaksIn(laid.channels[0]);
    const period = (60 * RATE) / 120;
    anchors.forEach((_, k) => expect(Math.abs(found[k] - k * period)).toBeLessThanOrEqual(1));
  });

  it('lands both halves of a record that steps tempo on the output grid', () => {
    // Sixteen bars at 120, then the rest at 90. Laid at one speed the second
    // half is late by the whole step, and further out with every beat.
    const spacings = Array.from({ length: 32 }, (_, k) => (k < 16 ? 500 : 667));
    const anchors = anchorsOf(300, spacings);
    const length = anchors[anchors.length - 1] + 500;
    const beats = beatsOf(RATE, length, 0, anchors);
    const laid = straightened([clicksAt(anchors, length)], RATE, {
      bpm: tempoOf(beats),
      offset: anchors[0] / RATE,
      to: 120,
      beats,
    });
    const found = peaksIn(laid.channels[0]);
    const period = (60 * RATE) / 120;
    anchors.forEach((_, k) => expect(Math.abs(found[k] - k * period)).toBeLessThanOrEqual(1));
  });

  it('is untouched by being handed its own map when it is already straight', () => {
    const noise = Float32Array.from({ length: 12000 }, (_, i) => Math.sin(i * 12.9898) * 0.5);
    const ruling = { bpm: 120, offset: 0.5004, to: 120 };
    const plain = straightened([noise], RATE, ruling);
    const mapped = straightened([noise], RATE, {
      ...ruling,
      beats: evenBeats(RATE, noise.length, 120, 0.5004),
    });
    expect(mapped.bars).toBe(plain.bars);
    expect(mapped.seconds).toBe(plain.seconds);
    expect(mapped.speed).toBeCloseTo(plain.speed, 12);
    expect(mapped.channels[0]).toEqual(plain.channels[0]);
  });

  it('pads to the end of the bar the record ends in, not the beat', () => {
    // A record running a beat and a half past bar six: the pad has to reach
    // bar seven, and the click in that last beat has to survive it.
    const last = 6 * 4 * 500 + 500;
    const anchors = anchorsOf(0, Array.from({ length: 25 }, () => 500));
    const beats = beatsOf(RATE, last + 250, 0, anchors);
    const laid = straightened([clicksAt([last], last + 250)], RATE, {
      bpm: 120,
      offset: 0,
      to: 120,
      beats,
    });
    expect(laid.bars).toBe(7);
    expect(laid.channels[0].length).toBe(7 * 4 * 500);
    expect(peaksIn(laid.channels[0])).toEqual([last]);
  });
});
