import { describe, expect, it } from 'vitest';
import { envelopesOf, exactly, heardIn, transientsIn, transientsOf, fromPeaks } from './transients.ts';
import type { Peak } from './audio.ts';

/**
 * What this protects is a hit placed to the millisecond, and no hit where
 * there was none.
 *
 * Both halves matter. A detector a few milliseconds loose puts a grid a few
 * milliseconds loose, on the strip whose whole job is to show that; a
 * detector that hears a hit in every wobble of an envelope hands a tracker a
 * hundred things to lock onto that are not the beat. So the fixtures are
 * rendered samples, not envelopes, and what is asserted is where the attack
 * was and how many there were.
 */

const RATE = 16000;

/** A stretch of silence to strike things into. */
const silence = (seconds: number): Float32Array => new Float32Array(Math.round(seconds * RATE));

/** A sine burst with a sharp attack and an exponential ring. */
function strike(out: Float32Array, at: number, hz: number, ring: number, loud = 1): void {
  const from = Math.round(at * RATE);
  const span = Math.min(out.length - from, Math.round(RATE * ring * 8));
  for (let i = 0; i < span; i++) {
    out[from + i] += loud * Math.sin((2 * Math.PI * hz * i) / RATE) * Math.exp(-i / (RATE * ring));
  }
}

/** A noise burst, which is what a hat is. */
function hiss(out: Float32Array, at: number, ring: number, loud = 1): void {
  const from = Math.round(at * RATE);
  let seed = 12345;
  const span = Math.min(out.length - from, Math.round(RATE * ring * 8));
  for (let i = 0; i < span; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    out[from + i] += loud * white * Math.exp(-i / (RATE * ring));
  }
}

const heard = (samples: Float32Array) => heardIn([samples], RATE)!.transients;
const inBand = (samples: Float32Array, band: 'low' | 'mid' | 'high') =>
  heard(samples).filter((t) => t.band === band);

describe('placing a hit', () => {
  it('puts a kick within three milliseconds of its attack, every time', () => {
    // A sixty-hertz kick takes a few milliseconds to swing far enough to be
    // heard as having started; three is what its own fundamental allows.
    const out = silence(8);
    const times = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];
    for (const at of times) strike(out, at, 60, 0.05);
    const low = inBand(out, 'low');
    expect(low).toHaveLength(times.length);
    low.forEach((hit, i) => expect(Math.abs(hit.at - times[i])).toBeLessThan(0.003));
  });

  it('puts a snare within a millisecond of its attack', () => {
    const out = silence(4);
    const times = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];
    for (const at of times) strike(out, at, 1000, 0.04);
    const mid = inBand(out, 'mid');
    expect(mid).toHaveLength(times.length);
    mid.forEach((hit, i) => expect(Math.abs(hit.at - times[i])).toBeLessThan(0.001));
  });

  it('places the same kick the same way whether it is loud or quiet', () => {
    // The rise is in decibels, so the moment reported does not move with the
    // level — a verse and a chorus are on the same grid.
    const loud = silence(2);
    const quiet = silence(2);
    strike(loud, 1, 60, 0.05, 1);
    strike(quiet, 1, 60, 0.05, 0.1);
    const a = inBand(loud, 'low')[0];
    const b = inBand(quiet, 'low')[0];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(Math.abs(a.at - b.at)).toBeLessThan(0.001);
  });

  it('is not moved by a hit a frame boundary happens to split', () => {
    // A column of the old envelope caught whatever peaked inside it. A rolling
    // window has no boundary to fall either side of: kicks at every phase of
    // the hop land the same distance from their attack.
    const out = silence(4);
    const times = Array.from({ length: 12 }, (_, i) => 0.5 + i * 0.25 + (i * 7) / RATE);
    for (const at of times) strike(out, at, 60, 0.05);
    const low = inBand(out, 'low');
    expect(low).toHaveLength(times.length);
    const offsets = low.map((hit, i) => hit.at - times[i]);
    const spread = Math.max(...offsets) - Math.min(...offsets);
    expect(spread).toBeLessThan(0.0005);
  });
});

describe('hearing the kit apart', () => {
  /** The strongest hit in a band, which is the instrument that lives there. */
  const loudestIn = (samples: Float32Array, band: 'low' | 'mid' | 'high') =>
    inBand(samples, band).reduce((best, t) => (t.strength > best.strength ? t : best));

  it('hears the kick loudest in the low band, the snare in the middle and the hat above', () => {
    // Every hit bleeds into the other bands a little — a kick has a click,
    // a hat has a thump — and that is fine, because the bleed is at the same
    // moment as the hit. What must hold is which band each one owns.
    const out = silence(4);
    strike(out, 1, 60, 0.05);
    strike(out, 2, 1000, 0.04);
    hiss(out, 3, 0.01);
    expect(Math.round(loudestIn(out, 'low').at)).toBe(1);
    expect(Math.round(loudestIn(out, 'mid').at)).toBe(2);
    expect(Math.round(loudestIn(out, 'high').at)).toBe(3);
  });

  it('keeps the bands in one order', () => {
    const out = silence(3);
    strike(out, 1.5, 60, 0.05);
    strike(out, 1.0, 1000, 0.04);
    hiss(out, 2.0, 0.01);
    const all = heard(out);
    for (let i = 1; i < all.length; i++) expect(all[i].at).toBeGreaterThanOrEqual(all[i - 1].at);
  });
});

describe('what is not a hit', () => {
  it('hears nothing in silence', () => {
    expect(heard(silence(3))).toHaveLength(0);
  });

  it('hears nothing in a tone that swells slowly', () => {
    // Faded in over a second, then a slow tremolo: nothing here stands up in
    // five milliseconds, so nothing here is a hit.
    const out = silence(4);
    for (let i = 0; i < out.length; i++) {
      const fade = Math.min(1, i / RATE);
      out[i] = fade * Math.sin((2 * Math.PI * 80 * i) / RATE) * (0.5 + 0.5 * Math.sin((2 * Math.PI * i) / RATE));
    }
    expect(inBand(out, 'low')).toHaveLength(0);
  });

  it('hears a flam as one hit, and a roll as one per stroke', () => {
    const out = silence(3);
    strike(out, 1.0, 60, 0.05);
    strike(out, 1.015, 60, 0.05);
    strike(out, 2.0, 60, 0.05);
    strike(out, 2.08, 60, 0.05);
    strike(out, 2.16, 60, 0.05);
    const low = inBand(out, 'low');
    expect(low.filter((t) => t.at > 0.9 && t.at < 1.1)).toHaveLength(1);
    expect(low.filter((t) => t.at > 1.9 && t.at < 2.3)).toHaveLength(3);
  });

  it('does not hear the ring of a hit as more hits', () => {
    const out = silence(3);
    strike(out, 1, 60, 0.3);
    expect(inBand(out, 'low')).toHaveLength(1);
  });

  it('rates a hit against the strongest, not against silence', () => {
    const out = silence(4);
    strike(out, 1, 60, 0.05, 1);
    strike(out, 2, 60, 0.05, 0.3);
    strike(out, 3, 60, 0.05, 1);
    const low = inBand(out, 'low');
    expect(low).toHaveLength(3);
    for (const hit of low) {
      expect(hit.strength).toBeGreaterThan(0);
      expect(hit.strength).toBeLessThanOrEqual(1);
    }
  });
});

describe('the peaks fallback', () => {
  it('finds hits in the drawn peaks when there is nothing better', () => {
    const per = 240 / 9000;
    const beat = 60 / 128;
    const level = new Float32Array(9000);
    for (let k = 0; 0.25 + k * beat < 240; k++) {
      const from = Math.floor((0.25 + k * beat) / per);
      for (let i = from; i < 9000 && i < from + 6; i++) {
        level[i] = Math.max(level[i], Math.exp((-(i - from) * per) / 0.05));
      }
    }
    const peaks: Record<string, Peak[]> = {
      drums: Array.from({ length: 9000 }, (_, i) => ({ min: -level[i], max: level[i] })),
    };
    const it = fromPeaks(peaks, 240, 44100)!;
    expect(it.seconds).toBe(240);
    expect(it.transients.length).toBeGreaterThan(400);
    expect(it.transients.length).toBeLessThan(560);
  });

  it('is nothing for a track with no peaks yet', () => {
    expect(fromPeaks({}, 240, 44100)).toBeNull();
    expect(transientsIn(new Float32Array(100), 0.01, 'low')).toEqual([]);
  });
});

describe('to the sample', () => {
  it('finds the attack again to within a few samples of where it was struck', () => {
    const out = silence(3);
    strike(out, 1.0, 60, 0.05);
    strike(out, 2.0, 1000, 0.04);
    const it = heardIn([out], RATE)!;
    const nearest = (band: string, to: number) =>
      it.transients
        .filter((t) => t.band === band)
        .reduce((best, t) => (Math.abs(t.at - to) < Math.abs(best.at - to) ? t : best));
    const kick = nearest('low', 1);
    const snare = nearest('mid', 2);
    expect(Math.abs(kick.sample - RATE)).toBeLessThan(RATE * 0.003);
    expect(Math.abs(snare.sample - 2 * RATE)).toBeLessThan(RATE * 0.001);
    expect(kick.at).toBeCloseTo(kick.sample / RATE, 9);
  });

  it('leaves a hit where it was when there is nothing to climb', () => {
    const flat = new Float32Array(RATE);
    const env = envelopesOf([flat], RATE)!;
    const hit = { at: 0.5, sample: RATE / 2, strength: 1, level: 1, band: 'low' as const };
    expect(exactly([flat], RATE, hit)).toBe(RATE / 2);
    expect(transientsOf(env, RATE)).toEqual([]);
  });

  it('drops a hat’s thump from the snare band, and keeps a kick under a hat', () => {
    // A hat thumps a little in the snare band. Beside a real snare, that
    // thump is faint, and goes. A kick struck with a hat is two drums, and
    // both stay.
    const out = silence(4);
    strike(out, 1, 1000, 0.04);
    hiss(out, 2, 0.01);
    strike(out, 3, 60, 0.05);
    hiss(out, 3, 0.01);
    const all = heardIn([out], RATE)!.transients;
    const at2 = all.filter((t) => Math.abs(t.at - 2) < 0.02);
    expect(at2.map((t) => t.band)).toEqual(['high']);
    const at3 = all.filter((t) => Math.abs(t.at - 3) < 0.02).map((t) => t.band);
    expect(at3).toContain('low');
    expect(at3).toContain('high');
  });
});
