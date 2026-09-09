import { describe, expect, it } from 'vitest';
import { keyRegions, parseReference, scorePitch } from './evidence.ts';
import { validPitchMap, type PitchMap } from '../../pitchMap.ts';

export function fixture(pitches: (number | null)[], step = 0.1): PitchMap {
  return { openflow: 'mix-pitch-map', version: 1, source: { hash: 'source', bytes: 12 },
    engine: { name: 'test fixture', version: '1', model: 'none', fmin: 20, fmax: 400, hopMs: step * 1000, decoder: 'none', batchSize: 1, seed: 0 },
    seconds: pitches.length * step, sampleRate: 16000, start: 0, step, windowSeconds: .064,
    policy: { periodicityFloor: .21, silenceDb: -60 }, hz: pitches.map(p => p === null ? null : 440 * 2 ** ((p - 69) / 12)),
    periodicity: pitches.map(() => .9), smoothedPeriodicity: pitches.map(() => .9), rmsDb: pitches.map(() => -20),
    state: pitches.map(p => p === null ? 'unvoiced' : 'voiced') };
}

describe('continuous bass evidence', () => {
  it('rejects a wrong clock, truncated arrays and invalid voiced estimates', () => {
    const map = fixture([28, 28.23, null]);
    expect(validPitchMap(map)).toBe(true);
    expect(validPitchMap({ ...map, step: 1 })).toBe(false);
    expect(validPitchMap({ ...map, state: ['voiced'] })).toBe(false);
    expect(validPitchMap({ ...map, hz: [28, NaN, null] })).toBe(false);
  });
  it('does not treat unlabeled reference as silence or octave errors as correct notes', () => {
    const map = fixture([45, null, 33, 33]);
    const r = parseReference(JSON.stringify({ sourceHash: 'source', kind: 'human', provenance: 'independent fixture',
      frames: [{ time: 0, hz: 55 }, { time: .1, hz: 55 }, { time: .2, hz: 0 }, { time: .3, hz: null }] }), 'source');
    expect(scorePitch(map, r)).toMatchObject({ voiced: 2, unvoiced: 1, detected: 1, falseVoiced: 1, correct: 0, octave: 1 });
    expect(() => parseReference(JSON.stringify(r), 'other')).toThrow('different audio');
  });
});

describe('bass scale regions', () => {
  it('retains relative major/minor ambiguity and labels a sustained change', () => {
    const c = [24, 26, 28, 29, 31, 33, 35, 36];
    const map = fixture([...c, ...c.map(p => p + 6)], 1);
    expect(keyRegions(map, 8).map(r => r.label)).toEqual(['C major / A minor', 'F♯ major / E♭ minor']);
    expect(keyRegions(map, 8).map(r => [r.from, r.to])).toEqual([[0, 8], [8, 16]]);
  });
  it('abstains on a pedal, missing evidence and chromatic material', () => {
    expect(keyRegions(fixture(new Array(80).fill(28)))[0].label).toBe('Unknown');
    expect(keyRegions(fixture(new Array(80).fill(null)))[0].label).toBe('Unknown');
    expect(keyRegions(fixture(Array.from({ length: 80 }, (_, i) => 24 + i % 12)))[0].label).toBe('Unknown');
  });
  it('does not promote a brief passing pitch into a region change', () => {
    const pitches = Array.from({ length: 160 }, (_, i) => [24, 26, 28, 29, 31, 33, 35, 36][i % 8]);
    pitches[90] = 30;
    const regions = keyRegions(fixture(pitches), 8);
    expect(regions).toHaveLength(1);
    expect(regions[0].label).toBe('C major / A minor');
  });
});
