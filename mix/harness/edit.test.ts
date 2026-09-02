import { describe, expect, it } from 'vitest';
import { double, halve, insertBeat, moveBeat, removeBeat, rotateBar, seedTruth } from './edit.ts';
import type { Report, Truth } from './types.ts';

const RATE = 100;

const truthOf = (samples: number[], downbeat: number[]): Truth => ({
  track: 't',
  region: { from: 0, to: 10 },
  beats: { rate: RATE, samples, downbeat },
  source: 'manual',
  edits: [],
  at: '2020-01-01T00:00:00.000Z',
});

/** Eight beats a tenth of a second apart, bars on the first and the fifth. */
const eight = (): Truth => truthOf([0, 10, 20, 30, 40, 50, 60, 70], [0, 4]);

describe('seedTruth', () => {
  const report = {
    track: { id: 'abc', title: 'a', seconds: 10, rate: RATE, stems: [] },
    beats: { rate: RATE, length: 1000, first: 2, samples: [0, 10, 20, 30, 40, 50] },
  } as unknown as Report;

  it('copies the predicted beats inside the region only', () => {
    const truth = seedTruth(report, { from: 0.1, to: 0.4 });
    expect(truth.beats.samples).toEqual([10, 20, 30, 40]);
    expect(truth.track).toBe('abc');
    expect(truth.region).toEqual({ from: 0.1, to: 0.4 });
    expect(truth.source).toBe('manual');
    expect(truth.edits).toEqual([]);
  });

  it('marks downbeats from the map first count, as indices into what it kept', () => {
    // first is 2, so the bar starts on the map's index 2 — the next would be 6, past the end.
    expect(seedTruth(report, { from: 0, to: 10 }).beats.downbeat).toEqual([2]);
    // Dropping the first beat pulls the bar line back to index 1.
    expect(seedTruth(report, { from: 0.05, to: 10 }).beats.downbeat).toEqual([1]);
  });
});

describe('moveBeat', () => {
  it('records where the beat came from and where it went', () => {
    const moved = moveBeat(eight(), 1, 13);
    expect(moved.beats.samples).toEqual([0, 13, 20, 30, 40, 50, 60, 70]);
    expect(moved.edits).toEqual([{ type: 'moved', beat: 1, from: 10, to: 13 }]);
    expect(moved.at).not.toBe(eight().at);
  });

  it('keeps the samples sorted and the downbeats on the same beats when one crosses another', () => {
    const moved = moveBeat(eight(), 0, 35);
    expect(moved.beats.samples).toEqual([10, 20, 30, 35, 40, 50, 60, 70]);
    // The beat that started the first bar is now the fourth in order.
    expect(moved.beats.downbeat).toEqual([3, 4]);
  });

  it('leaves the truth alone when nothing moves', () => {
    const same = eight();
    expect(moveBeat(same, 1, 10)).toBe(same);
  });
});

describe('removeBeat', () => {
  it('drops the beat and pulls the later downbeat indices back', () => {
    const cut = removeBeat(eight(), 1);
    expect(cut.beats.samples).toEqual([0, 20, 30, 40, 50, 60, 70]);
    expect(cut.beats.downbeat).toEqual([0, 3]);
    expect(cut.edits).toEqual([{ type: 'spurious', beat: 1, sample: 10 }]);
  });

  it('drops a downbeat itself', () => {
    const cut = removeBeat(eight(), 0);
    expect(cut.beats.downbeat).toEqual([3]);
  });
});

describe('insertBeat', () => {
  it('inserts in order and pushes the later downbeat indices on', () => {
    const grown = insertBeat(eight(), 15);
    expect(grown.beats.samples).toEqual([0, 10, 15, 20, 30, 40, 50, 60, 70]);
    expect(grown.beats.downbeat).toEqual([0, 5]);
    expect(grown.edits).toEqual([{ type: 'missed', sample: 15 }]);
  });

  it('refuses a beat already there', () => {
    const same = eight();
    expect(insertBeat(same, 20)).toBe(same);
  });
});

describe('rotateBar', () => {
  it('moves the bar line on by one beat and appends a phase edit', () => {
    const on = rotateBar(eight(), 1);
    expect(on.beats.downbeat).toEqual([1, 5]);
    expect(on.edits).toEqual([{ type: 'phase', by: 1 }]);
    expect(on.beats.samples).toEqual(eight().beats.samples);
  });

  it('wraps backwards off the first beat', () => {
    expect(rotateBar(eight(), -1).beats.downbeat).toEqual([3, 7]);
  });
});

describe('halve and double', () => {
  it('halve keeps every other beat from the first downbeat', () => {
    const half = halve(eight());
    expect(half.beats.samples).toEqual([0, 20, 40, 60]);
    expect(half.beats.downbeat).toEqual([0]);
    expect(half.edits).toEqual([{ type: 'octave', factor: 0.5 }]);
  });

  it('halve keeps the downbeats when the bar line is not on the first beat', () => {
    const half = halve(truthOf([0, 10, 20, 30, 40, 50, 60, 70], [1, 5]));
    expect(half.beats.samples).toEqual([10, 30, 50, 70]);
    expect(half.beats.downbeat).toEqual([0]);
  });

  it('double puts a beat midway between each pair', () => {
    const twice = double(truthOf([0, 10, 20, 30], [0]));
    expect(twice.beats.samples).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(twice.beats.downbeat).toEqual([0, 4]);
    expect(twice.edits).toEqual([{ type: 'octave', factor: 2 }]);
  });

  it('edits pile up in the order they were made', () => {
    const done = insertBeat(rotateBar(moveBeat(eight(), 0, 2), 1), 5);
    expect(done.edits.map((e) => e.type)).toEqual(['moved', 'phase', 'missed']);
  });
});
