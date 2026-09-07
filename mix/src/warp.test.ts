import { describe, expect, it } from 'vitest';
import {
  barAt,
  beatAt,
  beatsOf,
  bpmText,
  countOf,
  evenBeats,
  beatsOnHit,
  moved,
  placeOf,
  pulled,
  rangeText,
  tempoText,
  resampled,
  retimed,
  sampleOf,
  renumbered,
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
 * The bars on the lanes, the markers on the warp lane, the tab's columns and the
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

/** A song at 128 for forty bars, 120 for forty, then 132: beat samples from three spacings. */
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

  it('reads the same from the three numbers as from the map', () => {
    const { slowest, fastest } = tempoRange(map);
    expect(tempoText(tempoOf(map), slowest, fastest)).toBe(rangeText(map));
    expect(tempoText(tempoOf(straight), 128, 128)).toBe('128');
    expect(tempoText(128.05, 128.05, 128.05)).toBe('128.05');
    expect(tempoText(128, Infinity, 0)).toBe('');
  });

  it('counts the bars by the spacing it ends on', () => {
    const last = map.samples[map.samples.length - 1];
    const end = (map.samples.length - 1) + ((LENGTH - last) * 132) / (60 * RATE);
    expect(countOf(map)).toBe(Math.ceil(end / 4));
  });
});

describe('making a map safe', () => {
  it('pushes a beat that does not advance a sample past the one before', () => {
    const map = beatsOf(RATE, LENGTH, 0, [100, 100, 90, 500]);
    expect(map.samples).toEqual([100, 101, 102, 500]);
  });

  it('gives a lone beat a second, a beat later at the tempo given', () => {
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

describe('editing a beat', () => {
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

  it('shifts every beat the same way', () => {
    const later = shifted(map, 480);
    later.samples.forEach((s, i) => expect(s).toBe(map.samples[i] + 480));
  });

  it('sets 1.1.1 at a beat without moving any beat', () => {
    const counted = renumbered(map, 6);
    expect(counted.samples).toBe(map.samples);
    expect(sampleOf(counted, 0)).toBe(sampleOf(map, 6));
    expect(sampleOf(counted, -6)).toBe(sampleOf(map, 0));
    expect(beatAt(counted, sampleOf(map, 6))).toBeCloseTo(0, 9);
  });
});

describe('pulling a bar', () => {
  const map = bent();
  /** Where a beat sits between two others, as a fraction: what a stretch has to keep. */
  const between = (b: Beats, lo: number, k: number, hi: number) =>
    (sampleOf(b, k) - sampleOf(b, lo)) / (sampleOf(b, hi) - sampleOf(b, lo));

  it('keeps the count and the relative spacing of the beats since bar 1, and lands the bar where it was pulled', () => {
    const to = map.samples[100] + 4000;
    const edited = pulled(map, 100, to);
    expect(edited.samples.length).toBe(map.samples.length);
    expect(edited.samples[100]).toBe(to);
    for (let k = 1; k < 100; k++) expect(between(edited, 0, k, 100)).toBeCloseTo(between(map, 0, k, 100), 4);
  });

  it('brings every beat after the pulled bar along by the same distance', () => {
    const edited = pulled(map, 100, map.samples[100] + 4000);
    for (let k = 101; k < map.samples.length; k++) expect(edited.samples[k]).toBe(map.samples[k] + 4000);
  });

  it('stretches from the last beat a hand set, and leaves the beats before it alone', () => {
    const set = moved(map, 40, map.samples[40] + 300);
    const edited = pulled(set, 100, set.samples[100] - 2000);
    for (let k = 0; k <= 40; k++) expect(edited.samples[k]).toBe(set.samples[k]);
    for (let k = 41; k < 100; k++) expect(between(edited, 40, k, 100)).toBeCloseTo(between(set, 40, k, 100), 4);
    expect(edited.samples[100]).toBe(set.samples[100] - 2000);
    expect(edited.samples[120]).toBe(set.samples[120] - 2000);
  });

  it('fixes a steady tempo that is a fraction off in one pull of the last bar', () => {
    const wrong = evenBeats(RATE, LENGTH, 128.4, 0);
    const last = wrong.samples.length - 1;
    const edited = pulled(wrong, last, sampleOf(evenBeats(RATE, LENGTH, 128, 0), last));
    expect(tempoOf(edited)).toBeCloseTo(128, 2);
    const { slowest, fastest } = tempoRange(edited);
    expect(fastest - slowest).toBeLessThan(0.05);
  });

  it('cannot pull a bar back through the beats it stretches', () => {
    const edited = pulled(map, 8, map.samples[0] - 5000);
    expect(edited.samples[8]).toBe(map.samples[0] + 8);
    for (let k = 1; k <= 8; k++) expect(edited.samples[k]).toBeGreaterThan(edited.samples[k - 1]);
  });

  it('stretches a bar before bar 1 towards bar 1 and brings the lead-in along', () => {
    const early = renumbered(map, 16);
    const to = early.samples[8] - 1500;
    const edited = pulled(early, -8, to);
    expect(edited.samples[8]).toBe(to);
    for (let k = 0; k < 8; k++) expect(edited.samples[k]).toBe(early.samples[k] - 1500);
    for (let k = 9; k < 16; k++) expect(between(edited, -8, k - 16, 0)).toBeCloseTo(between(early, -8, k - 16, 0), 4);
    for (let k = 16; k < early.samples.length; k++) expect(edited.samples[k]).toBe(early.samples[k]);
  });

  it('brings the whole map with bar 1 when nothing before it is set', () => {
    const edited = pulled(map, 0, map.samples[0] + 240);
    edited.samples.forEach((s, k) => expect(s).toBe(map.samples[k] + 240));
  });

  it('ignores a bar that is not in the map', () => {
    expect(pulled(map, 10000, 5)).toBe(map);
  });

  describe('which beats a hand set', () => {
    it('is nobody until a beat is moved or a bar pulled, then each once, in order', () => {
      expect(map.set).toBeUndefined();
      const edited = moved(pulled(moved(map, 40, map.samples[40] + 10), 100, map.samples[100] + 20), 40, map.samples[40] + 30);
      expect(edited.set).toEqual([40, 100]);
    });

    it('is counted afresh when bar 1 moves, and rides a nudge and a resample unchanged', () => {
      const edited = pulled(map, 100, map.samples[100] + 4000);
      expect(renumbered(edited, 6).set).toEqual([94]);
      expect(shifted(edited, 480).set).toEqual([100]);
      expect(resampled(edited, 44100, LENGTH).set).toEqual([100]);
      expect(renumbered(map, 6).set).toBeUndefined();
    });

    it('stretches from a set beat wherever bar 1 has since gone', () => {
      const edited = renumbered(pulled(map, 100, map.samples[100] + 4000), 20);
      const again = pulled(edited, 100, edited.samples[120] + 1000);
      for (let k = 0; k <= 100; k++) expect(again.samples[k]).toBe(edited.samples[k]);
      expect(again.samples[120]).toBe(edited.samples[120] + 1000);
      expect(again.set).toEqual([80, 100]);
    });
  });
});

describe('re-counting the beats at another rate', () => {
  const map = bent();
  /** Even beats a thousand samples apart, with one gap twice as long: the variation a re-count must keep. */
  const gapped = beatsOf(RATE, LENGTH, 0, Array.from({ length: 40 }, (_, i) => i * 1000 + (i > 10 ? 1000 : 0)));

  it('doubles then halves back to the very same samples', () => {
    const back = retimed(retimed(map, 2, 1), 1, 2);
    expect(back.first).toBe(map.first);
    expect(back.samples).toEqual(map.samples);
    const counted = renumbered(map, 6);
    expect(retimed(retimed(counted, 2, 1), 1, 2).samples).toEqual(counted.samples);
  });

  it('keeps bar 1 where it was, halved or doubled, wherever bar 1 is in the file', () => {
    const counted = renumbered(map, 7);
    for (const [num, den] of [[2, 1], [1, 2], [3, 2], [2, 3]]) {
      expect(sampleOf(retimed(counted, num, den), 0)).toBe(sampleOf(counted, 0));
      expect(sampleOf(retimed(map, num, den), 0)).toBe(map.samples[0]);
    }
  });

  it('reads a steady grid at three halves of its tempo', () => {
    const faster = retimed(straight, 3, 2);
    expect(tempoOf(faster)).toBeCloseTo(192, 2);
    const { slowest, fastest } = tempoRange(faster);
    expect(fastest - slowest).toBeLessThan(0.05);
    expect(tempoOf(retimed(straight, 2, 3))).toBeCloseTo(128 * 2 / 3, 2);
  });

  it('keeps a long gap proportionally long, doubled and halved', () => {
    const doubled = retimed(gapped, 2, 1);
    expect(doubled.samples[21] - doubled.samples[20]).toBe(1000);
    expect(doubled.samples[22] - doubled.samples[21]).toBe(1000);
    expect(doubled.samples[20] - doubled.samples[19]).toBe(500);
    expect(doubled.samples[23] - doubled.samples[22]).toBe(500);
    const halved = retimed(gapped, 1, 2);
    expect(halved.samples[6] - halved.samples[5]).toBe(3000);
    expect(halved.samples[5] - halved.samples[4]).toBe(2000);
  });

  it('still covers the same stretch of the file, carried on at the local spacing', () => {
    const doubled = retimed(map, 2, 1);
    expect(doubled.samples[0]).toBe(map.samples[0]);
    expect(doubled.samples[doubled.samples.length - 1]).toBe(map.samples[map.samples.length - 1]);
    const halved = retimed(gapped, 1, 2);
    expect(halved.samples[halved.samples.length - 1]).toBeGreaterThanOrEqual(gapped.samples[gapped.samples.length - 1]);
    expect(retimed(beatsOf(RATE, LENGTH, 0, [0, 1000]), 2, 3).samples.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps a set beat that lands on a whole beat, re-indexed, and drops one that does not', () => {
    const set = moved(moved(map, 4, map.samples[4] + 10), 5, map.samples[5] + 10);
    expect(set.set).toEqual([4, 5]);
    expect(retimed(set, 2, 1).set).toEqual([8, 10]);
    expect(retimed(set, 1, 2).set).toEqual([2]);
    expect(retimed(set, 3, 2).set).toEqual([6]);
    expect(retimed(set, 2, 3).set).toEqual([]);
    expect(retimed(map, 2, 1).set).toBeUndefined();
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

describe('how much of the grid the kit confirms', () => {
  const grid = evenBeats(RATE, LENGTH, 120, 0);

  it('counts a beat with a hit inside the window and not one outside it', () => {
    // Beats at 1, 1.5, 2, 2.5, 3: hits confirm 1 and 3, 2.03 is too far from 2.
    expect(beatsOnHit(grid, [1, 2.03, 3], 0.025)).toBe(0.4);
    expect(beatsOnHit(grid, [0, 0.5, 1, 1.5], 0.025)).toBe(1);
  });

  it('is beats with a hit, not hits on a beat: a kick between the beats costs nothing', () => {
    expect(beatsOnHit(grid, [1, 1.25, 1.5, 1.75, 2], 0.025)).toBe(1);
  });

  it('asks only the beats between the first hit and the last', () => {
    expect(beatsOnHit(grid, [10, 10.5, 11], 0.025)).toBe(1);
  });

  it('answers to the map as drawn, so a moved beat changes the share', () => {
    const hits = [0, 0.5, 1.03, 1.5];
    expect(beatsOnHit(grid, hits, 0.025)).toBe(0.75);
    expect(beatsOnHit(moved(grid, 2, 1.03 * RATE), hits, 0.025)).toBe(1);
  });

  it('has nothing to say about a track with no hits', () => {
    expect(beatsOnHit(grid, [], 0.025)).toBeNull();
  });
});
