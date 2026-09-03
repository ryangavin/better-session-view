import { describe, expect, it } from 'vitest';
import { countedOf, fitOf, refitOf, snapped, sweepOf, through, type Beat } from './tempo.ts';
import { heardIn, type Heard, type Transient } from './transients.ts';

/**
 * What this protects is a grid that holds at the end of the song, found
 * without being told what tempo to expect.
 *
 * A tempo a tenth of a per cent out looks perfect for the first thirty seconds
 * and is a beat and a half late by the end; a tempo an octave out looks
 * perfect everywhere and is useless. So the fixtures here are rendered kits,
 * four minutes long, and what is asserted is where bar 100 lands and which
 * pulse was called the beat — with the kit arranged every way an octave can
 * hide: a kick on one and three, hats at the weight of the kick, a slow song
 * with nothing between its beats.
 */

const RATE = 16000;
const SECONDS = 240;

interface Kit {
  bpm: number;
  /** Seconds to the first downbeat. */
  offset: number;
  /** Which beats of the bar carry a kick. All four unless said otherwise. */
  kicks?: number[];
  /** Which beats carry a snare. */
  snares?: number[];
  /** Hats on the offbeat eighths, at this loudness. */
  hats?: number;
  /** Every kick the same weight: four on the floor, no downbeat in it. */
  even?: boolean;
  /** Which beat of the bar the recording starts on. */
  from?: number;
  seconds?: number;
}

function strike(out: Float32Array, at: number, hz: number, ring: number, loud: number): void {
  const from = Math.round(at * RATE);
  if (from < 0 || from >= out.length) return;
  const span = Math.min(out.length - from, Math.round(RATE * ring * 8));
  for (let i = 0; i < span; i++) {
    out[from + i] += loud * Math.sin((2 * Math.PI * hz * i) / RATE) * Math.exp(-i / (RATE * ring));
  }
}

let seed = 1;
function hiss(out: Float32Array, at: number, ring: number, loud: number): void {
  const from = Math.round(at * RATE);
  if (from < 0 || from >= out.length) return;
  const span = Math.min(out.length - from, Math.round(RATE * ring * 8));
  for (let i = 0; i < span; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    out[from + i] += loud * (seed / 2147483648 - 1) * Math.exp(-i / (RATE * ring));
  }
}

/** A drum kit, rendered, then heard the way the app hears a stem. */
function kit({ bpm, offset, kicks = [0, 1, 2, 3], snares = [], hats = 0, even = false, from = 0, seconds = SECONDS }: Kit): Heard {
  const out = new Float32Array(Math.round(seconds * RATE));
  const beat = 60 / bpm;
  for (let k = 0; offset + k * beat < seconds; k++) {
    const at = offset + k * beat;
    const inBar = (((k + from) % 4) + 4) % 4;
    if (kicks.includes(inBar)) strike(out, at, 60, 0.05, even || inBar === 0 ? 1 : 0.8);
    if (snares.includes(inBar)) strike(out, at, 1000, 0.04, 0.9);
    if (hats > 0) hiss(out, at + beat / 2, 0.01, hats);
  }
  return heardIn([out], RATE)!;
}

/** Where the grid puts bar `bars`, in seconds, against where it belongs. */
const driftAt = (found: { bpm: number; offset: number }, truth: Kit, bars: number): number =>
  Math.abs(found.offset + (bars * 240) / found.bpm - (truth.offset + (bars * 240) / truth.bpm));

/**
 * How far out the grid may be at bar 100, in seconds. Ten milliseconds: the
 * detector places a kick to about one, so this is the least-squares line
 * holding, not merely the tempo being about right.
 */
const DRIFT = 0.01;

describe('fitting a tempo to the kit', () => {
  it('finds a whole-number tempo and says it is whole', () => {
    const fit = fitOf(kit({ bpm: 128, offset: 0.25 }));
    expect(fit).not.toBeNull();
    expect(fit!.bpm).toBe(128);
  });

  it('finds the downbeat, not just the tempo', () => {
    const fit = fitOf(kit({ bpm: 124, offset: 0.51 }))!;
    expect(Math.abs(fit.offset - 0.51)).toBeLessThan(DRIFT);
  });

  it('does not round a tempo that is not whole', () => {
    const fit = fitOf(kit({ bpm: 122.5, offset: 0 }))!;
    expect(fit.bpm).toBeGreaterThan(122.4);
    expect(fit.bpm).toBeLessThan(122.6);
  });

  it('keeps the decimals of a master that runs a twentieth over a whole number', () => {
    const truth: Kit = { bpm: 128.055, offset: 0.25 };
    const fit = fitOf(kit(truth))!;
    expect(fit.bpm).not.toBe(128);
    expect(driftAt(fit, truth, 100)).toBeLessThan(DRIFT);
  });

  it('puts bar 100 within ten milliseconds of where it belongs', () => {
    const truth: Kit = { bpm: 126, offset: 0.33 };
    expect(driftAt(fitOf(kit(truth))!, truth, 100)).toBeLessThan(DRIFT);
  });

  it('holds at bar 100 on a tempo that is not a whole number', () => {
    const truth: Kit = { bpm: 122.5, offset: 0.17 };
    expect(driftAt(fitOf(kit(truth))!, truth, 100)).toBeLessThan(DRIFT);
  });

  it.each([1, 2, 3])('starts the bar on the heaviest quarter, not on beat %i', (from) => {
    const truth: Kit = { bpm: 120, offset: 0.2, from };
    const fit = fitOf(kit(truth))!;
    expect(fit.bpm).toBe(120);
    const wait = ((4 - from) % 4) * (60 / 120);
    expect(Math.abs(fit.offset - (0.2 + wait))).toBeLessThan(DRIFT);
  });

  it('starts the bar where the song starts when every kick is the same', () => {
    const fit = fitOf(kit({ bpm: 128, offset: 0.31, even: true }))!;
    expect(Math.abs(fit.offset - 0.31)).toBeLessThan(DRIFT);
  });

  it('says most of the hits are on the grid when they are', () => {
    expect(fitOf(kit({ bpm: 128, offset: 0.25 }))!.agreement).toBeGreaterThan(0.9);
  });

  it('fits a short loop as well as a song', () => {
    expect(fitOf(kit({ bpm: 140, offset: 0.1, seconds: 20 }))!.bpm).toBe(140);
  });
});

describe('which pulse is the beat', () => {
  it('counts the beat, not the eighths played over it', () => {
    // Hats at the weight of the kick correlate just as well at half the
    // period. At that period every other pulse has no kick or snare on it,
    // which is what says it is a subdivision.
    expect(fitOf(kit({ bpm: 120, offset: 0, hats: 0.95 }))!.bpm).toBe(120);
  });

  it('does not halve the tempo of a kick on one and three', () => {
    // The kick alone repeats at 64. The snare on two and four is on the
    // pulses of 128 and between the pulses of 64, and that is the evidence.
    const fit = fitOf(kit({ bpm: 128, offset: 0.2, kicks: [0, 2], snares: [1, 3] }))!;
    expect(fit.bpm).toBe(128);
  });

  it('leaves a genuinely slow song slow', () => {
    // Nothing between the kicks: at double the tempo every other pulse is
    // empty, so the slow reading is the one that fits.
    expect(fitOf(kit({ bpm: 76, offset: 0.1 }))!.bpm).toBe(76);
  });

  it('hears drum and bass at its own tempo, not at half', () => {
    // 174 and 87 both lie in the range, and there is no lean to pick one.
    // The snare on two and four and a kick on one and three say 174.
    const fit = fitOf(kit({ bpm: 174, offset: 0.3, kicks: [0, 2], snares: [1, 3], hats: 0.5 }))!;
    expect(fit.bpm).toBe(174);
  });

  it('hears a slow groove at its own tempo, not at double', () => {
    const fit = fitOf(kit({ bpm: 88, offset: 0.2, snares: [1, 3], hats: 0.5 }))!;
    expect(fit.bpm).toBe(88);
  });

  it('refuses a tempo out of range rather than reporting one', () => {
    expect(fitOf(kit({ bpm: 60, offset: 0.2 }))).toBeNull();
  });
});

describe('what it will not claim', () => {
  it('refuses a track with nothing steady in it', () => {
    let x = 7;
    const transients = [];
    let at = 0;
    while (at < SECONDS) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      at += 0.15 + (x / 4294967296) * 0.6;
      transients.push({ at, sample: Math.round(at * RATE), strength: 0.5 + (x % 100) / 200, level: 1, band: 'low' as const });
    }
    expect(fitOf({ seconds: SECONDS, rate: RATE, transients })).toBeNull();
  });

  it('refuses silence rather than claiming 120', () => {
    expect(fitOf({ seconds: SECONDS, rate: RATE, transients: [] })).toBeNull();
  });
});

describe('a fit seeded by hand', () => {
  const truth: Kit = { bpm: 128, offset: 0.4 };

  it('turns four bars counted out into a tempo good to the end of the song', () => {
    const rough = (240 * 4) / (7.5 - 0.02);
    const fit = refitOf(kit(truth), rough, 0.42)!;
    expect(fit.bpm).toBe(128);
    expect(driftAt(fit, truth, 100)).toBeLessThan(DRIFT);
  });

  it('keeps the downbeat that was clicked rather than voting on one', () => {
    const fit = refitOf(kit({ ...truth, kicks: [0, 2], snares: [1, 3] }), 128, 0.4)!;
    expect(Math.abs(fit.offset - 0.4)).toBeLessThan(DRIFT);
  });

  it('puts the click on a bar line and bar 1 at the top of the file', () => {
    const bar = 240 / truth.bpm;
    const fit = refitOf(kit(truth), truth.bpm, truth.offset + 4 * bar)!;
    expect(Math.abs(fit.offset - truth.offset)).toBeLessThan(DRIFT);
    expect(fit.offset).toBeLessThan(bar);
  });

  it('refuses a refinement that has drifted off what was measured', () => {
    expect(refitOf(kit(truth), 124, 0.4)).toBeNull();
  });

  it('refuses a seed the alignment cannot hold at all', () => {
    expect(refitOf(kit(truth), 96, 0.4)).toBeNull();
  });
});

describe('the pieces', () => {
  it('snaps a hand tempo to a whole number within reach and not beyond it', () => {
    expect(snapped(127.6, 0.75)).toBe(128);
    expect(snapped(126.9, 0.05)).toBe(126.9);
  });

  it('draws the line through weighted beats', () => {
    const beats: Beat[] = [0, 1, 2, 3, 4].map((k) => ({ k, at: 0.5 + k * 0.4, weight: 1 }));
    const line = through(beats)!;
    expect(line.first).toBeCloseTo(0.5, 9);
    expect(line.period).toBeCloseTo(0.4, 9);
    expect(through([beats[0]])).toBeNull();
  });
});

describe('countedOf', () => {
  it('counts the beats between two picks at the known tempo and reads the tempo off the span', () => {
    // Nine beats at 128 are 4.21875 s; picks a few milliseconds loose still count nine.
    const counted = countedOf(10.002, 10.002 + 4.2, 128)!;
    expect(counted.beats).toBe(9);
    expect(counted.bpm).toBeCloseTo(128.571, 2);
  });

  it('takes the picks in either order', () => {
    expect(countedOf(14.2, 10, 128)).toEqual(countedOf(10, 14.2, 128));
  });

  it('refuses picks too close to be a beat apart', () => {
    expect(countedOf(10, 10.02, 128)).toBeNull();
    expect(countedOf(10, 10.1, 128)).toBeNull();
  });
});

describe('sweepOf', () => {
  const train = (bpm: number, offset: number, seconds: number, jitter = 0): Heard => {
    const rate = 44100;
    const period = 60 / bpm;
    const transients: Transient[] = [];
    let k = 0;
    for (let at = offset; at < seconds; at = offset + ++k * period) {
      const wobble = jitter * Math.sin(k * 1.7);
      const t = at + wobble;
      transients.push({ at: t, sample: Math.round(t * rate), strength: 1, level: 1, band: k % 2 ? 'mid' : 'low' });
    }
    return { seconds, rate, transients };
  };

  it('finds the bottom on a whole number when the song is on one', () => {
    const swept = sweepOf(train(128, 0.35, 300), 0.35, 128.055);
    expect(swept?.best.bpm).toBeCloseTo(128, 3);
    expect(swept?.best.error).toBeLessThan(0.01);
    expect(swept?.whole.error).toBeCloseTo(swept!.best.error, 6);
    expect(swept?.was.error).toBeGreaterThan(swept!.best.error);
  });

  it('finds the bottom off the whole number when the song is off it', () => {
    const swept = sweepOf(train(128.055, 0.35, 300, 0.004), 0.35, 128);
    expect(Math.abs(swept!.best.bpm - 128.055)).toBeLessThanOrEqual(0.002);
    expect(swept!.whole.error).toBeGreaterThan(swept!.best.error);
  });

  it('holds 1.1.1 where it was pointed', () => {
    const swept = sweepOf(train(128, 0.35, 300), 0.35, 128);
    expect(swept?.offset).toBe(0.35);
    expect(swept?.curve.length).toBe(1001);
  });
});
