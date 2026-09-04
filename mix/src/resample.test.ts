import { describe, expect, it } from 'vitest';
import { resample } from './resample.ts';

const sine = (length: number, period: number, phase = 0): Float32Array =>
  Float32Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * (i + phase)) / period));

const RATE = 48000;
/** The speed the whole thing exists for: a record measured at 128.055 laid at 128. */
const WORKING = 128 / 128.055;

const tone = (length: number, hz: number): Float32Array =>
  Float32Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * hz * i) / RATE));

/**
 * How much of one frequency is in a stretch of signal, and how much is not.
 *
 * A peak search answers the wrong question: the output's peaks land between
 * samples, so the tallest sample is always short of the tone by a hair that
 * depends on where the phase happened to fall. Fitting a sine and a cosine by
 * least squares reads the tone itself, and what will not fit is everything a
 * resampler adds — aliases, harmonics, jitter. The fit is least squares rather
 * than a bare projection because a window is never a whole number of cycles at
 * a speed like 128/128.055, and the two basis waves are not quite orthogonal
 * over it; solving the two-by-two takes the tilt out instead of blaming it on
 * the resampler.
 */
const fitTone = (x: Float32Array, hz: number, from: number, to: number) => {
  const w = (2 * Math.PI * hz) / RATE;
  let ss = 0;
  let cc = 0;
  let sc = 0;
  let xs = 0;
  let xc = 0;
  for (let i = from; i < to; i++) {
    const s = Math.sin(w * i);
    const c = Math.cos(w * i);
    ss += s * s;
    cc += c * c;
    sc += s * c;
    xs += x[i] * s;
    xc += x[i] * c;
  }
  const det = ss * cc - sc * sc;
  const a = (xs * cc - xc * sc) / det;
  const b = (xc * ss - xs * sc) / det;
  let residual = 0;
  for (let i = from; i < to; i++) {
    const left = x[i] - (a * Math.sin(w * i) + b * Math.cos(w * i));
    residual += left * left;
  }
  const amplitude = Math.hypot(a, b);
  return {
    /** Decibels away from the level it went in at. */
    level: 20 * Math.log10(amplitude),
    /** Everything that is not the tone, in decibels under the tone. */
    dirt: 20 * Math.log10(Math.sqrt(residual / (to - from)) / (amplitude / Math.SQRT2)),
  };
};

/**
 * The kernel's first and last taps hang off the end of the input, so the first
 * and last thirty-two output samples are a fade rather than the signal. Two
 * thousand is that with room to spare, and cheap at this length.
 */
const EDGE = 2000;

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

  it('passes a whole sample through untouched, silence included', () => {
    // Where a sample is not zero, dust a ten-thousandth of a trillionth down
    // is lost in the float anyway; where it is zero there is nothing for it to
    // hide under, and a stem is mostly silence. So a gap in the signal has to
    // come back as the digital silence it went in as, not as a whisper of one.
    const gapped = Float32Array.from({ length: 2000 }, (_, i) =>
      i > 800 && i < 1200 ? 0 : Math.sin(i * 12.9898) * 0.5,
    );
    const out = resample(gapped, 1, 0, gapped.length);
    expect(out).toEqual(gapped);
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

  // The four below are the ones that tell this resampler apart from a cheaper
  // one. Everything above still passes if the sixty-four taps are thrown away
  // and the two nearest samples are simply blended, which is how a stem ends up
  // sounding like a cassette. Linear interpolation at the working speed reads
  // 0.012 dB down at a kilohertz, 4.7 dB down at nineteen, and its dirt sits
  // 64 dB under the tone at a kilohertz and 7 dB under it at nineteen. The
  // thresholds here are set to reject that and nothing else.

  it('is flat within a hundredth of a decibel from a hundred hertz to nineteen kilohertz', () => {
    for (const hz of [100, 1000, 5000, 10000, 15000, 19000]) {
      const out = resample(tone(RATE, hz), WORKING, 0, 47000);
      // The tone comes out at the speed it was read at, not the speed it went in.
      const { level } = fitTone(out, hz * WORKING, EDGE, 45000);
      expect(Math.abs(level)).toBeLessThan(0.002);
    }
  });

  it('keeps everything but the tone a hundred decibels down', () => {
    for (const hz of [100, 1000, 2000, 5000]) {
      const out = resample(tone(RATE, hz), WORKING, 0, 47000);
      const { dirt } = fitTone(out, hz * WORKING, EDGE, 45000);
      expect(dirt).toBeLessThan(-98);
    }
  });

  it('is dirtiest at the top of the band, where the phase table runs out', () => {
    // Not a hundred decibels up here, and the doc comment overstates it. The
    // fraction of a sample is resolved to one part in sixteen thousand, and
    // that rounding is a timing jitter of thirty microsamples; a jitter costs
    // six decibels per octave, so what is 133 dB down at a hundred hertz is
    // only 87 dB down at nineteen kilohertz. Still inaudible under a mix, and
    // still forty decibels cleaner than a blend of two samples — but it is the
    // phase table, not the taps, that sets the floor, and doubling PHASES is
    // where any more would come from.
    for (const [hz, floor] of [
      [10000, -91],
      [15000, -88],
      [19000, -86],
    ] as const) {
      const out = resample(tone(RATE, hz), WORKING, 0, 47000);
      const { dirt } = fitTone(out, hz * WORKING, EDGE, 45000);
      expect(dirt).toBeLessThan(floor);
    }
  });

  it('puts an impulse exactly where the speed says', () => {
    // Half a tap of drift is silent on its own and ruinous against three other
    // stems: the kick arrives a fraction after the bass and the low end smears.
    // At half speed the input's sample 1000 is the output's 2000, and the
    // response around it is symmetric, which a half-sample offset would tilt.
    const impulse = new Float32Array(4000);
    impulse[1000] = 1;
    const out = resample(impulse, 0.5, 0, 4000);
    let peak = 0;
    for (let i = 0; i < out.length; i++) if (Math.abs(out[i]) > Math.abs(out[peak])) peak = i;
    expect(peak).toBe(2000);
    expect(out[2000]).toBeCloseTo(1, 6);
    for (let k = 1; k < 60; k++) expect(out[2000 - k]).toBeCloseTo(out[2000 + k], 6);
  });

  it('holds the level across the speeds it is actually asked for', () => {
    // Every speed lands on a different set of phases, and each row of the table
    // is normalised on its own; a row that drifts off unity is a stem a hair
    // loud or quiet at one tempo and not another.
    for (const speed of [0.98, 0.999, WORKING, 1, 1.001, 1.02]) {
      const length = Math.floor(46000 / Math.max(1, speed));
      const out = resample(tone(RATE, 1000), speed, 0, length);
      const { level } = fitTone(out, 1000 * speed, EDGE, length - EDGE);
      expect(Math.abs(level)).toBeLessThan(0.002);
    }
  });
});
