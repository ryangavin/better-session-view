import { describe, expect, it } from 'vitest';
import { score } from './score.ts';
import type { Report, Truth } from './types.ts';

const RATE = 48000;
const PERIOD = 0.5;

/** A report whose map is the given beat times, every one anchored, at a steady tempo. */
function reportOf(beatsAt: readonly number[], first = 0): Report {
  const samples = beatsAt.map((at) => Math.round(at * RATE));
  return {
    track: { id: 't', title: 't', seconds: 40, rate: RATE, stems: [] },
    heard: {
      seconds: 40,
      rate: RATE,
      transients: beatsAt.map((at) => ({ at, sample: Math.round(at * RATE), strength: 1, level: 0.8, band: 'low' as const })),
    },
    fit: { bpm: 120, offset: 0, agreement: 1 },
    follow: { bpm: 120, offset: 0, agreement: 1, tracked: 1, slowest: 120, fastest: 120 },
    beats: { rate: RATE, length: 40 * RATE, first, samples },
    trace: {
      follow: { frame: 0.004, beats: samples.map((sample, i) => ({ frame: i, at: sample / RATE, hit: i, sample })) },
    },
    peaks: { drums: [], per: 1 },
    known: null,
  };
}

/** Truth of beats every half second from `from`, downbeats every fourth from the first. */
function truthOf(beatsAt: readonly number[], downbeatEvery = 4, firstDownbeat = 0): Truth {
  return {
    track: 't',
    region: { from: beatsAt[0] - 0.1, to: beatsAt[beatsAt.length - 1] + 0.1 },
    beats: {
      rate: RATE,
      samples: beatsAt.map((at) => Math.round(at * RATE)),
      downbeat: beatsAt.map((_, i) => i).filter((i) => (i - firstDownbeat) % downbeatEvery === 0),
    },
    source: 'manual',
    edits: [],
    at: '2026-09-02T00:00:00Z',
  };
}

const grid = (count: number, from = 2, period = PERIOD) => Array.from({ length: count }, (_, i) => from + i * period);

describe('score', () => {
  it('finds nothing wrong with a map that is the truth', () => {
    const beats = grid(32);
    const s = score(reportOf(beats), truthOf(beats));
    expect(s.counts).toEqual({ on: 32, shifted: 0, missed: 0, spurious: 0 });
    expect(s.fMeasure).toBe(1);
    expect(s.continuity).toBe(1);
    expect(s.octave).toBeNull();
    expect(s.offBeat).toBe(false);
    expect(s.phase).toBe(0);
    expect(s.troubled).toEqual([]);
  });

  it('tells a moved beat from a missed one from an invented one', () => {
    const truth = grid(32);
    const predicted = [...truth];
    predicted[5] += 0.03; // shifted, within the window
    predicted[9] += 0.2; // far enough to be a miss and a spurious beat
    predicted.splice(20, 1); // missed outright
    const s = score(reportOf(predicted), truthOf(truth));
    expect(s.counts).toEqual({ on: 29, shifted: 1, missed: 2, spurious: 1 });
    expect(s.rows[5].verdict).toBe('shifted');
    expect(s.rows[5].offsetMs).toBeCloseTo(30, 0);
    expect(s.rows[9].verdict).toBe('missed');
    expect(s.rows[20].verdict).toBe('missed');
    expect(s.spurious).toEqual([9]);
    expect(s.troubled.map((t) => t.bar)).toEqual([2, 3, 6]);
  });

  it('names a map at half the tempo', () => {
    const truth = grid(32);
    const predicted = truth.filter((_, i) => i % 2 === 0);
    const s = score(reportOf(predicted), truthOf(truth));
    expect(s.octave).toBe('half');
    expect(s.counts.missed).toBe(16);
  });

  it('names a map at double the tempo', () => {
    const truth = grid(16);
    const predicted = grid(31, 2, PERIOD / 2);
    const s = score(reportOf(predicted), truthOf(truth));
    expect(s.octave).toBe('double');
    expect(s.counts.spurious).toBe(15);
  });

  it('names a map that falls between the beats', () => {
    const truth = grid(32);
    const predicted = truth.map((at) => at + PERIOD / 2);
    const s = score(reportOf(predicted), truthOf(truth));
    expect(s.offBeat).toBe(true);
    expect(s.octave).toBeNull();
  });

  it('names a bar line that starts late', () => {
    const truth = grid(32);
    // The map's beat zero is the truth's beat 1, so its bars start one beat after the true ones.
    const s = score(reportOf(truth, -1), truthOf(truth));
    expect(s.counts.on).toBe(32);
    expect(s.phase).toBe(1);
  });

  it('judges only the region, and reads what was under each true beat', () => {
    const truth = grid(32);
    const report = reportOf(truth);
    const s = score(report, truthOf(truth.slice(8, 16)));
    expect(s.truthCount).toBe(8);
    expect(s.predictedCount).toBe(8);
    expect(s.rows[0].predicted).toBe(8);
    expect(s.rows[0].under?.band).toBe('low');
    expect(s.rows[0].anchored).toBe(true);
  });
});
