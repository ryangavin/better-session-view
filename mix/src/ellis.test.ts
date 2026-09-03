import { describe, expect, it } from 'vitest';
import { combOf } from './comb.ts';
import { ellisOf, gridOf } from './ellis.ts';
import { magnitudesOf } from './fft.ts';
import { fluxOf, heardOf, onsetsOf } from './flux.ts';

/**
 * What this protects is that the copied stages still do what the library's
 * did: the flux hears a click where one was rendered, the comb names the
 * tempo the clicks were rendered at, and the tracker and the grid put a beat
 * on each of them. The judgement of the stages against ours is the harness's,
 * on real records; these are only the copy's regression net.
 */

/** The rate the copied constants — a 2048 frame, a 512 hop — were chosen at. At 16k a hop is 32 ms and the comb's harmonics blanket every click. */
const RATE = 44100;

/** A decaying burst of noise every beat at `bpm`, from `offset` seconds, for `seconds`. */
function clicks(bpm: number, offset: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  const period = 60 / bpm;
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let at = offset; at < seconds; at += period) {
    const start = Math.round(at * RATE);
    for (let i = 0; i < 1100 && start + i < out.length; i++) out[start + i] += noise() * Math.exp(-i / 220);
  }
  return out;
}

const within = (got: readonly number[], want: readonly number[], tolerance: number): number => {
  let hit = 0;
  for (const w of want) if (got.some((g) => Math.abs(g - w) <= tolerance)) hit++;
  return hit / want.length;
};

describe('magnitudesOf', () => {
  it('matches a direct DFT', () => {
    const n = 64;
    const frame = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.3) + 0.5 * Math.cos(i * 1.7));
    const got = magnitudesOf(frame);
    for (let k = 0; k <= n / 2; k++) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < n; i++) {
        re += frame[i] * Math.cos((2 * Math.PI * k * i) / n);
        im -= frame[i] * Math.sin((2 * Math.PI * k * i) / n);
      }
      expect(got[k]).toBeCloseTo(Math.hypot(re, im), 8);
    }
  });
});

describe('the copied stages on a click train', () => {
  const bpm = 132;
  const offset = 0.35;
  const seconds = 40;
  const onset = fluxOf(clicks(bpm, offset, seconds), RATE)!;
  const want: number[] = [];
  for (let at = offset; at < seconds; at += 60 / bpm) want.push(at);

  it('hears every click as an onset, to a frame', () => {
    expect(within(onsetsOf(onset), want, onset.per * 1.5)).toBe(1);
  });

  it('names the tempo the clicks were rendered at', () => {
    expect(combOf(onset, 70, 190)!.bpm).toBe(bpm);
  });

  it('tracks a beat onto every click, and one at the top of the file before the first', () => {
    const beats = ellisOf(onset, bpm);
    expect(within(beats, want, onset.per * 1.5)).toBe(1);
    expect(beats.length).toBe(want.length + 1);
    expect(beats[0]).toBe(0);
  });

  it('lays a grid onto every click', () => {
    const beats = gridOf(onsetsOf(onset), bpm, seconds);
    expect(within(beats, want, 0.02)).toBe(1);
  });

  it('hands the onsets over as hits in the kick band', () => {
    const heard = heardOf(onset, RATE, seconds);
    expect(heard.transients.length).toBe(want.length);
    expect(heard.transients.every((t) => t.band === 'low' && t.strength > 0 && t.strength <= 1)).toBe(true);
  });
});
