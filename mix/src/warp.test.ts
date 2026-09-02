import { describe, expect, it } from 'vitest';
import {
  barAt,
  beatAt,
  beatsOf,
  bpmText,
  countOf,
  evenBeats,
  moved,
  placeOf,
  rangeText,
  resampled,
  sampleOf,
  shifted,
  startOf,
  tempoAt,
  tempoOf,
  tempoRange,
  type Beats,
} from './warp.ts';

/**
 * What this protects is one map that every part of the window reads the same.
 *
 * The bars on the lanes, the pins on the warp lane, the tab's columns and the
 * stretcher's boundaries all ask this file where a beat is, and if any two of
 * them could disagree the window would show a grid that the sound did not
 * follow. So the assertions are about the map's arithmetic — interpolation,
 * extrapolation, the round trip — and about an edit staying where it was put.
 */

const RATE = 48000;
const SECONDS = 240;
const LENGTH = SECONDS * RATE;

/** The old straight grid: a tempo and a downbeat, as an even map. */
const straight = evenBeats(RATE, LENGTH, 128, 0.9375);

/** A song at 128 for forty bars, 120 for forty, then 132: anchors from three spacings. */
function bent(): Beats {
  const samples: number[] = [];
  let at = 0.5 * RATE;
  const push = (bpm: number, beats: number) => {
    for (let i = 0; i < beats; i++) {
      samples.push(Math.round(at));
      at += (60 * RATE) / bpm;
    }
  };
  push(128, 160);
  push(120, 160);
  push(132, 81);
  return beatsOf(RATE, LENGTH, 0, samples);
}

describe('the straight map', () => {
  it('is the line a tempo and a downbeat make, to the sample, before bar 1 and past the end', () => {
    for (const bar of [-4, 0, 37.5, 100, 130]) {
      expect(placeOf(straight, bar) * SECONDS).toBeCloseTo(0.9375 + (bar * 240) / 128, 4);
    }
  });

  it('puts the top of the file before bar 1 when the song starts late', () => {
    expect(barAt(straight, 0)).toBeCloseTo(-0.5, 4);
    expect(straight.first).toBeLessThan(0);
  });

  it('does not round the tempo into the map', () => {
    const exact = evenBeats(RATE, 200 * RATE, 128, 0);
    expect(placeOf(exact, 100) * 200).toBeCloseTo((100 * 240) / 128, 4);
  });

  it('counts the bars the song holds, not the bars the file spans', () => {
    expect(countOf(evenBeats(RATE, LENGTH, 128, 0))).toBe(128);
    expect(countOf(straight)).toBe(128);
    expect(countOf(evenBeats(RATE, 0, 128, 0))).toBe(1);
  });

  it('reads its tempo back off the spacing', () => {
    expect(tempoOf(straight)).toBeCloseTo(128, 3);
    expect(tempoAt(straight, 50)).toBeCloseTo(128, 3);
    expect(rangeText(straight)).toBe('128');
    expect(rangeText(evenBeats(RATE, LENGTH, 128.05, 0))).toBe('128.05');
  });
});

describe('a map that bends', () => {
  const map = bent();

  it('maps a beat to its sample and back, across all three spacings', () => {
    for (const beat of [-3, 0, 12.25, 160, 230.5, 320, 400, 470]) {
      expect(beatAt(map, sampleOf(map, beat))).toBeCloseTo(beat, 9);
    }
  });

  it('bends where the spacing changes', () => {
    expect(tempoAt(map, 10)).toBeCloseTo(128, 1);
    expect(tempoAt(map, 240)).toBeCloseTo(120, 1);
    expect(tempoAt(map, 350)).toBeCloseTo(132, 1);
  });

  it('carries the neighbouring spacing on past both ends', () => {
    expect(tempoAt(map, -5)).toBeCloseTo(128, 1);
    expect(sampleOf(map, -1)).toBeCloseTo(0.5 * RATE - (60 * RATE) / 128, 0);
    expect(tempoAt(map, 1000)).toBeCloseTo(132, 1);
  });

  it('reads as a range where it bends', () => {
    const { slowest, fastest } = tempoRange(map);
    expect(slowest).toBeCloseTo(120, 1);
    expect(fastest).toBeCloseTo(132, 1);
    expect(rangeText(map)).toBe('120–132');
  });

  it('counts the bars by the spacing it ends on', () => {
    const last = map.samples[map.samples.length - 1];
    const end = (map.samples.length - 1) + ((LENGTH - last) * 132) / (60 * RATE);
    expect(countOf(map)).toBe(Math.ceil(end / 4));
  });
});

describe('making a map safe', () => {
  it('pushes an anchor that does not advance a sample past the one before', () => {
    const map = beatsOf(RATE, LENGTH, 0, [100, 100, 90, 500]);
    expect(map.samples).toEqual([100, 101, 102, 500]);
  });

  it('gives a lone anchor a second, a beat later at the tempo given', () => {
    const map = beatsOf(RATE, LENGTH, 0, [1000], 120);
    expect(map.samples).toEqual([1000, 1000 + RATE / 2]);
    expect(beatsOf(RATE, LENGTH, 0, []).samples).toHaveLength(2);
  });

  it('counts the same beats in another rate', () => {
    const other = resampled(straight, 44100, SECONDS * 44100);
    expect(other.rate).toBe(44100);
    expect(placeOf(other, 100) * SECONDS).toBeCloseTo(placeOf(straight, 100) * SECONDS, 3);
    expect(resampled(straight, RATE, LENGTH)).toEqual(straight);
  });
});

describe('editing an anchor', () => {
  const map = bent();

  it('moves one beat and leaves every other where it was', () => {
    const edited = moved(map, 100, map.samples[100] + 4000);
    expect(edited.samples[100]).toBe(map.samples[100] + 4000);
    edited.samples.forEach((s, i) => {
      if (i !== 100) expect(s).toBe(map.samples[i]);
    });
  });

  it('holds a moved beat strictly between its neighbours', () => {
    expect(moved(map, 100, map.samples[101] + 50).samples[100]).toBe(map.samples[101] - 1);
    expect(moved(map, 100, map.samples[99] - 50).samples[100]).toBe(map.samples[99] + 1);
    expect(moved(map, 0, -100).samples[0]).toBe(-100);
  });

  it('changes the tempo either side of the moved beat and nowhere else', () => {
    const edited = moved(map, 100, map.samples[100] + 4000);
    expect(tempoAt(edited, 99)).toBeLessThan(tempoAt(map, 99));
    expect(tempoAt(edited, 100)).toBeGreaterThan(tempoAt(map, 100));
    expect(tempoAt(edited, 98)).toBeCloseTo(tempoAt(map, 98), 9);
    expect(tempoAt(edited, 101)).toBeCloseTo(tempoAt(map, 101), 9);
  });

  it('ignores a beat that is not in the map', () => {
    expect(moved(map, 10000, 5)).toBe(map);
  });

  it('shifts every anchor the same way', () => {
    const later = shifted(map, 480);
    later.samples.forEach((s, i) => expect(s).toBe(map.samples[i] + 480));
  });
});

describe('what a tempo reads as', () => {
  it('keeps a whole number whole and a measurement to two decimals', () => {
    expect(bpmText(128)).toBe('128');
    expect(bpmText(128.05)).toBe('128.05');
  });

  it('starts bar 1 at the first downbeat in the file, whichever downbeat was given', () => {
    const bar = 240 / 128;
    expect(startOf(0.4 + 4 * bar, 128)).toBeCloseTo(0.4, 6);
    expect(startOf(0.4, 128)).toBeCloseTo(0.4, 6);
  });
});
