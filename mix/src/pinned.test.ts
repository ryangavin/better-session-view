import { describe, expect, it } from 'vitest';
import { DENSITIES, errorsOf, loosest, outputOf, pinnedOf, sourceOf, spacingOf, speedAt, type Every } from './pinned.ts';
import { beatsOf, evenBeats, sampleOf, BEATS_PER_BAR } from './warp.ts';

const RATE = 1000;

/** Beat samples from a first one and a spacing per beat, added up. */
const beatsFrom = (first: number, spacings: readonly number[]): number[] => {
  const out = [first];
  for (const spacing of spacings) out.push(out[out.length - 1] + spacing);
  return out;
};

/** Forty beats easing from 120 to 100: a record no one speed lays straight. */
const slowing = () => {
  const samples = beatsFrom(500, Array.from({ length: 40 }, (_, k) => Math.round(500 + (k * 100) / 40)));
  return beatsOf(RATE, samples[samples.length - 1] + 500, 0, samples);
};

/** Sixty-four beats at 120 with a drummer's wobble on every one, from a fixed seed. */
const wobbling = () => {
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const samples = beatsFrom(200, Array.from({ length: 64 }, () => Math.round(480 + next() * 40)));
  return beatsOf(RATE, samples[samples.length - 1] + 300, 0, samples);
};

/** The interval between two consecutive whole beats after pinning. */
const outInterval = (pinned: ReturnType<typeof pinnedOf>, beats: ReturnType<typeof beatsOf>, beat: number) =>
  outputOf(pinned, sampleOf(beats, beat + 1)) - outputOf(pinned, sampleOf(beats, beat));

describe('pinnedOf', () => {
  it('pinned per beat is the map itself, one pin a beat', () => {
    const beats = slowing();
    const pinned = pinnedOf(beats, 120, [0], 'beat');
    const end = pinned.bars * BEATS_PER_BAR;
    expect(pinned.pins.length).toBe(end + 1);
    pinned.pins.forEach((pin, beat) => {
      expect(pin.source).toBe(sampleOf(beats, beat));
      expect(pin.output).toBe(beat * pinned.spacing);
    });
  });

  it('pinned per section lands the cuts exactly and leaves the timing inside alone', () => {
    const beats = slowing();
    const pinned = pinnedOf(beats, 120, [0, 5], 'section');
    expect(pinned.pins.map((p) => p.output)).toEqual([0, 5 * BEATS_PER_BAR * pinned.spacing, pinned.bars * BEATS_PER_BAR * pinned.spacing]);
    expect(pinned.pins[1].source).toBe(sampleOf(beats, 20));
    // Every beat inside the section keeps its interval's ratio to the next one's.
    for (let beat = 1; beat < 18; beat++) {
      const src = (sampleOf(beats, beat + 1) - sampleOf(beats, beat)) / (sampleOf(beats, beat + 2) - sampleOf(beats, beat + 1));
      const out = outInterval(pinned, beats, beat) / outInterval(pinned, beats, beat + 1);
      expect(out).toBeCloseTo(src, 9);
    }
  });

  it('leaves a rigid record at its own tempo untouched', () => {
    const beats = evenBeats(RATE, 20000, 120, 0.35);
    for (const every of DENSITIES) {
      const pinned = pinnedOf(beats, 120, [0, 4], every);
      for (let out = 0; out < pinned.bars * BEATS_PER_BAR * pinned.spacing; out += 37) {
        expect(speedAt(pinned, out)).toBeCloseTo(1, 9);
        expect(sourceOf(pinned, out)).toBeCloseTo(out + 350, 6);
      }
    }
  });

  it('pins per phrase and per bar from each cut, on whole bars', () => {
    const beats = evenBeats(RATE, 20000, 120, 0);
    const spacing = spacingOf(RATE, 120);
    const bars = (pinned: ReturnType<typeof pinnedOf>) => pinned.pins.map((p) => p.output / spacing / BEATS_PER_BAR);
    // Ten bars: phrases count from each cut, on the first whole bar in the section.
    expect(bars(pinnedOf(beats, 120, [0, 6], 'phrase'))).toEqual([0, 4, 6, 10]);
    expect(bars(pinnedOf(beats, 120, [0, 1.5], 'phrase'))).toEqual([0, 1.5, 2, 6, 10]);
    expect(bars(pinnedOf(beats, 120, [0, 2.5], 'bar'))).toEqual([0, 1, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('is monotonic in both coordinates at every density, on a wobbly map', () => {
    const beats = wobbling();
    for (const every of DENSITIES) {
      const pinned = pinnedOf(beats, 118, [0, 3, 7.5, 12], every);
      for (let i = 1; i < pinned.pins.length; i++) {
        expect(pinned.pins[i].source).toBeGreaterThan(pinned.pins[i - 1].source);
        expect(pinned.pins[i].output).toBeGreaterThan(pinned.pins[i - 1].output);
      }
      for (let out = -500; out < 40000; out += 97) {
        const speed = speedAt(pinned, out);
        expect(Number.isFinite(speed) && speed > 0).toBe(true);
        expect(outputOf(pinned, sourceOf(pinned, out))).toBeCloseTo(out, 6);
      }
    }
  });

  it('starts at 1.1.1 and pins the end whatever the cuts say', () => {
    const beats = slowing();
    const pinned = pinnedOf(beats, 120, [3], 'section');
    expect(pinned.pins[0]).toEqual({ source: sampleOf(beats, 0), output: 0 });
    expect(pinned.pins[pinned.pins.length - 1].output).toBe(pinned.bars * BEATS_PER_BAR * pinned.spacing);
    expect(pinned.cuts).toEqual([3]);
  });

  it('drops a cut past the end and refuses cuts out of order', () => {
    const beats = slowing();
    expect(pinnedOf(beats, 120, [0, 4, 400], 'section').cuts).toEqual([0, 4]);
    expect(() => pinnedOf(beats, 120, [0, 6, 4], 'section')).toThrow('out of order');
    expect(() => pinnedOf(beats, 120, [0, -1], 'section')).toThrow('not a cut');
  });

  it('adding a cut moves nothing before it', () => {
    const beats = wobbling();
    const two = pinnedOf(beats, 120, [0, 8], 'section');
    const three = pinnedOf(beats, 120, [0, 8, 12], 'section');
    for (let beat = 0; beat <= 8 * BEATS_PER_BAR; beat++) {
      expect(outputOf(three, sampleOf(beats, beat))).toBe(outputOf(two, sampleOf(beats, beat)));
    }
    expect(outputOf(three, sampleOf(beats, 10 * BEATS_PER_BAR))).not.toBe(outputOf(two, sampleOf(beats, 10 * BEATS_PER_BAR)));
  });

  it('corrects more, and never less, as it is pinned more densely', () => {
    const beats = slowing();
    const worst = (every: Every) => Math.max(...errorsOf(beats, pinnedOf(beats, 120, [0], every)));
    const [section, phrase, bar, beat] = DENSITIES.map(worst);
    expect(section).toBeGreaterThan(phrase);
    expect(phrase).toBeGreaterThan(bar);
    expect(bar).toBeGreaterThan(beat);
    expect(beat).toBeLessThan(1e-6);
  });
});

describe('loosest', () => {
  it('pins a rigid record per section, with nothing off', () => {
    const beats = evenBeats(RATE, 20000, 120, 0.2);
    expect(loosest(beats, 120, [0, 4])).toEqual({ every: 'section', worst: 0 });
  });

  it('goes only as dense as the bar lines need', () => {
    const beats = slowing();
    // A ten-bar slow-down: half a second out at the middle bar pinned at the
    // ends, tens of milliseconds pinned every four bars, nothing pinned every bar.
    const wide = loosest(beats, 120, [0], 0.2);
    expect(wide.every).toBe('phrase');
    expect(wide.worst).toBeGreaterThan(0.01);
    expect(wide.worst).toBeLessThan(0.2);
    const tight = loosest(beats, 120, [0]);
    expect(tight).toEqual({ every: 'bar', worst: 0 });
  });
});
