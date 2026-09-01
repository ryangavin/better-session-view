import { describe, expect, it } from 'vitest';
import type { Peak } from './audio.ts';
import {
  bandsOf,
  barAt,
  barsOf,
  columnsOf,
  countOf,
  fitOf,
  placeOf,
  refitOf,
  type Heard,
  type Pulse,
} from './warp.ts';

/**
 * What this protects is a grid that holds at the end of the song.
 *
 * A tempo a tenth of a per cent out looks perfect for the first thirty seconds
 * and is a beat and a half late by the end, and neither a screenshot of bar 2
 * nor a passing test on a two-bar loop would ever say so. So the fixtures here
 * are four minutes long, and what is asserted is the *drift*: where the grid
 * puts the last bar of the song, not whether it found roughly the right number.
 */

const SECONDS = 240;
/** Columns of the envelope, at about twelve milliseconds each. */
const COLUMNS = 20672;

interface Kit {
  bpm: number;
  /** Seconds to the first downbeat. */
  offset: number;
  /** Which beats of the bar carry a kick. All four unless said otherwise. */
  kicks?: number[];
  /** Which beats carry a snare. It is in `wide` and never in `low`. */
  snares?: number[];
  /** How loud the offbeat eighth-note hats are, in the wide band only. */
  hats?: number;
  /** Every kick the same weight, which is four on the floor and no downbeat in it. */
  even?: boolean;
  seconds?: number;
  columns?: number;
}

/**
 * A drum kit, as the two envelopes a fit listens to.
 *
 * `low` is the kick band — what a hundred and twenty hertz of low-pass leaves —
 * and `wide` is everything the kit did. Hits land on whichever column holds
 * them, because that is what an envelope of loudest-in-the-column does, so
 * every hit here is a quarter of a column out on average. That is the error the
 * fit actually has to work through.
 */
function kit({
  bpm,
  offset,
  kicks = [0, 1, 2, 3],
  snares = [],
  hats = 0,
  even = false,
  seconds = SECONDS,
  columns = COLUMNS,
}: Kit): Heard {
  const per = seconds / columns;
  const beat = 60 / bpm;
  const low = new Float32Array(columns);
  const wide = new Float32Array(columns);

  const hit = (level: Float32Array, at: number, loud: number, ring: number) => {
    const from = Math.floor(at / per);
    if (from < 0) return;
    for (let i = from; i < columns && i < from + 80; i++) {
      level[i] = Math.max(level[i], loud * Math.exp((-(i - from) * per) / ring));
    }
  };

  for (let k = 0; offset + k * beat < seconds; k++) {
    const at = offset + k * beat;
    const inBar = ((k % 4) + 4) % 4;
    if (kicks.includes(inBar)) {
      const loud = even || inBar === 0 ? 1 : 0.8;
      hit(low, at, loud, 0.06);
      hit(wide, at, loud, 0.06);
    }
    if (snares.includes(inBar)) hit(wide, at, 0.9, 0.09);
    if (hats > 0) hit(wide, at + beat / 2, hats, 0.02);
  }

  return { low: { level: low, per }, wide: { level: wide, per } };
}

/** Where the grid puts bar `bars`, against where it belongs. */
const driftAt = (found: { bpm: number; offset: number }, truth: Kit, bars: number): number =>
  Math.abs(found.offset + (bars * 240) / found.bpm - (truth.offset + (bars * 240) / truth.bpm));

describe('fitting a tempo to the kick', () => {
  it('finds a whole-number tempo and says it is whole', () => {
    const fit = fitOf(kit({ bpm: 128, offset: 0.25 }));
    expect(fit).not.toBeNull();
    expect(fit!.bpm).toBe(128);
  });

  it('finds the downbeat, not just the tempo', () => {
    // The half-second of air in front of the song is the thing no tempo can
    // fix: every bar line is late by it, for the whole song.
    const fit = fitOf(kit({ bpm: 124, offset: 0.51 }))!;
    expect(fit.offset).toBeCloseTo(0.51, 1);
  });

  it('does not round a tempo that is not whole', () => {
    const fit = fitOf(kit({ bpm: 122.5, offset: 0 }))!;
    expect(fit.bpm).toBeGreaterThan(122.4);
    expect(fit.bpm).toBeLessThan(122.6);
  });

  it('puts bar 100 within a beat of where it belongs', () => {
    // The whole point. A tenth of a per cent is invisible at bar 2 and a beat
    // and a half out by bar 120, which is what the warp lane exists to show.
    const truth: Kit = { bpm: 126, offset: 0.33 };
    expect(driftAt(fitOf(kit(truth))!, truth, 100)).toBeLessThan(60 / truth.bpm / 4);
  });

  it('counts the beat, not the eighths played over it', () => {
    // Steady hats at the weight of the kick correlate just as well at half the
    // period, and a grid at 256 BPM is not wrong so much as useless.
    expect(fitOf(kit({ bpm: 120, offset: 0, hats: 0.95 }))!.bpm).toBe(120);
  });

  it('takes the beat over the subdivision when the offbeats are weak', () => {
    expect(fitOf(kit({ bpm: 90, offset: 0.4, hats: 0.2 }))!.bpm).toBe(90);
  });

  it('does not halve the tempo of a kick on one and three', () => {
    // The kick alone says 64. The snare between the kicks is what says 128, and
    // it is the reason a fit listens to two bands rather than one.
    const fit = fitOf(kit({ bpm: 128, offset: 0.2, kicks: [0, 2], snares: [1, 3] }))!;
    expect(fit.bpm).toBe(128);
  });

  it('leaves a genuinely slow song slow', () => {
    // Nothing between the kicks, so nothing to promote it with — the answer
    // that fits the audio is the one it keeps.
    const fit = fitOf(kit({ bpm: 76, offset: 0.1 }))!;
    expect(fit.bpm).toBe(76);
  });

  it('starts the bar where the song starts when every kick is the same', () => {
    // Four on the floor gives the downbeat no evidence at all — any of the four
    // would do — and the failure it hides is a grid whose lines are right and
    // whose bar numbers are three beats out.
    const fit = fitOf(kit({ bpm: 128, offset: 0.31, even: true }))!;
    expect(fit.offset).toBeCloseTo(0.31, 1);
  });

  it('says most of the hits are on the grid when they are', () => {
    expect(fitOf(kit({ bpm: 128, offset: 0.25 }))!.agreement).toBeGreaterThan(0.9);
  });

  it('refuses a track with nothing steady in it', () => {
    const noise = new Float32Array(COLUMNS);
    for (let i = 0; i < COLUMNS; i++) {
      noise[i] = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    }
    const pulse: Pulse = { level: noise, per: SECONDS / COLUMNS };
    expect(fitOf({ low: pulse, wide: pulse })).toBeNull();
  });

  it('refuses silence rather than claiming 120', () => {
    const pulse: Pulse = { level: new Float32Array(COLUMNS), per: SECONDS / COLUMNS };
    expect(fitOf({ low: pulse, wide: pulse })).toBeNull();
  });

  it('fits a short loop as well as a song', () => {
    const fit = fitOf(kit({ bpm: 140, offset: 0.1, seconds: 20, columns: 1723 }))!;
    expect(fit.bpm).toBe(140);
  });

  it('still fits from the drawn peaks when no stem has been decoded', () => {
    // Half the resolution and one band, which is what there is before the audio
    // has arrived — and in a browser with no app around the page, all there is.
    const per = SECONDS / 9000;
    const beat = 60 / 128;
    const level = new Float32Array(9000);
    for (let k = 0; 0.25 + k * beat < SECONDS; k++) {
      const from = Math.floor((0.25 + k * beat) / per);
      for (let i = from; i < 9000 && i < from + 40; i++) {
        level[i] = Math.max(level[i], Math.exp((-(i - from) * per) / 0.05));
      }
    }
    const peaks: Record<string, Peak[]> = {
      drums: Array.from({ length: 9000 }, (_, i) => ({ min: -level[i], max: level[i] })),
    };
    expect(fitOf(columnsOf(peaks, SECONDS)!)!.bpm).toBe(128);
  });
});

describe('a fit seeded by hand', () => {
  const truth: Kit = { bpm: 128, offset: 0.4 };

  it('turns four bars counted out into a tempo good to the end of the song', () => {
    // Twenty milliseconds out over four bars is a third of a BPM, which is a
    // bar and a half of drift by the end. The clicks say which beat is meant;
    // the audio is what makes it exact.
    const rough = (240 * 4) / (7.5 - 0.02);
    const fit = refitOf(kit(truth), rough, 0.42)!;
    expect(fit.bpm).toBe(128);
    expect(driftAt(fit, truth, 100)).toBeLessThan(60 / truth.bpm / 4);
  });

  it('keeps the downbeat that was clicked rather than voting on one', () => {
    const fit = refitOf(kit({ ...truth, kicks: [0, 2], snares: [1, 3] }), 128, 0.4)!;
    expect(fit.offset).toBeCloseTo(0.4, 1);
  });

  it('refuses to wander off what was measured', () => {
    expect(refitOf(kit(truth), 96, 0.4)).toBeNull();
  });
});

describe('hearing the kick under the kit', () => {
  const RATE = 44100;

  /** A 60 Hz kick every half second, and a 2 kHz snare between them. */
  const rendered = (): Float32Array => {
    const out = new Float32Array(RATE * 16);
    const strike = (at: number, hz: number, ring: number) => {
      const from = Math.round(at * RATE);
      for (let i = 0; i + from < out.length && i < RATE * ring * 6; i++) {
        out[from + i] += Math.sin((2 * Math.PI * hz * i) / RATE) * Math.exp(-i / (RATE * ring));
      }
    };
    for (let k = 0; k * 0.5 < 16; k++) {
      strike(k * 0.5, 60, 0.05);
      strike(k * 0.5 + 0.25, 2000, 0.04);
    }
    return out;
  };

  it('leaves the kick and takes the snare off it', () => {
    const heard = bandsOf([rendered()], RATE)!;
    const at = (seconds: number, pulse: Pulse) =>
      pulse.level[Math.round(seconds / pulse.per)] ?? 0;
    // Two seconds in, so the filter has long settled and every hit is the same.
    expect(at(2.0, heard.low)).toBeGreaterThan(at(2.25, heard.low) * 8);
    expect(at(2.25, heard.wide)).toBeGreaterThan(at(2.0, heard.wide) * 0.3);
  });

  it('finds the tempo off the rendered kit', () => {
    expect(fitOf(bandsOf([rendered()], RATE)!)!.bpm).toBe(120);
  });
});

describe('where the bars fall', () => {
  const grid = barsOf(240, 128, 0.9375);

  it('puts the top of the file before bar 1 when the song starts late', () => {
    expect(grid.origin).toBeLessThan(0);
    expect(barAt(grid, 0)).toBeCloseTo(-0.5, 6);
  });

  it('maps a bar back to the place it was drawn at', () => {
    for (const bar of [-4, 0, 1, 37.5, 100]) {
      expect(barAt(grid, placeOf(grid, bar))).toBeCloseTo(bar, 6);
    }
  });

  it('does not round the tempo into the map', () => {
    // The old grid drew `ceil(bars)` bars across the file, which ruled a
    // two-hundred-second track at 128 as if it were 128.4 — half a bar of drift
    // by the end, from the ruler rather than from the audio.
    const exact = barsOf(200, 128, 0);
    expect(placeOf(exact, 100) * 200).toBeCloseTo((100 * 240) / 128, 6);
  });

  it('counts the bars the song holds, not the bars the file spans', () => {
    expect(countOf(barsOf(240, 128, 0))).toBe(128);
    expect(countOf(grid)).toBe(128);
    expect(countOf(barsOf(0, 128, 0))).toBe(1);
  });
});
