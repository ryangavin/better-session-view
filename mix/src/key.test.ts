import { expect, it } from 'vitest';
import { estimateKey, keyFilters, keyLabel, savedKey } from './key.ts';
import type { PitchMap } from './pitchMap.ts';
function map(pitches: number[]): PitchMap {
  return { seconds: pitches.length, start: 0, step: 1, hz: pitches.map(p => 440 * 2 ** ((p - 69) / 12)), state: pitches.map(() => 'voiced') } as PitchMap;
}
const source = { hash: 'bass', mapHash: 'map', stems: 'stems/a', model: 'model' };
it('keeps sparse bass unknown, despite a strong tonic-looking pedal', () => {
  expect(estimateKey(map(Array(30).fill(24)), source).status).toBe('unknown');
});
it('shows one provisional key for relative ambiguity while retaining both hypotheses', () => {
  const a = estimateKey(map(Array.from({length: 4}, () => [24,26,28,29,31,33,35]).flat()), source);
  expect(a.status).toBe('candidate');
  expect(a.candidates.map(c => c.label)).toEqual(['C major']);
  expect(a.alternatives.map(c => c.label)).toEqual(['C major','A minor']);
});
it('offers a provisional bass-root interpretation and retains alternatives', () => {
  const a = estimateKey(map([...Array(24).fill(28),26,26,31,31,33,33]),source);
  expect(a.candidates.map(c => c.label)).toEqual(['E minor']);
  expect(a.alternatives.length).toBeGreaterThan(1);
});
it('retains distinct time regions diagnostically without claiming verified modulation', () => {
  const scale = [24,26,28,29,31,33,35,36];
  const a = estimateKey(map([...scale,...scale,...scale.map(p=>p+6),...scale.map(p=>p+6)]), source);
  expect(a.candidates).toHaveLength(1); expect(a.possibleChanges).toBe(true);
  expect(a.regions).toHaveLength(2);
});
it('manual metadata wins and absent or stale analysis remains filterable', () => {
  const keyAnalysis = estimateKey(map(Array(30).fill(24)),source);
  const track = {key:'G minor',keyAnalysis,stems:'stems/a',model:'model'};
  expect(keyLabel(track)).toBe('G minor'); expect(keyFilters(track)).toEqual(['G minor']);
  expect(savedKey({...track,stems:'stems/b'})).toBeNull();
  expect(keyFilters({...track,key:null,stems:'stems/b'})).toEqual(['Unknown']);
});

it('excludes runner-up scale matches from the library Keys filter', () => {
  const a = estimateKey(map(Array.from({length: 8}, () => [24,26,28,31]).flat()), source);
  expect(a.alternatives.length).toBeGreaterThan(2);
  expect(a.candidates).toHaveLength(1);
  expect(keyFilters({key:null,keyAnalysis:a,stems:source.stems,model:source.model})).toEqual(a.candidates.map(c=>c.label));
});

it('keeps sustained contrasting regions out of published keys without harmonic verification', () => {
  const scale = [24,26,28,29,31,33,35,36];
  const first = Array.from({length: 8}, () => scale).flat();
  const a = estimateKey(map([...first, ...first.map(p => p + 6)]), source);
  expect(a.regions.map(r => [r.from, r.to])).toEqual([[0,64],[64,128]]);
  expect(a.possibleChanges).toBe(true);
  expect(a.candidates).toHaveLength(1);
  expect(a.status).toBe('candidate');
  expect(a.alternatives.length).toBeGreaterThan(1);
});
it('invalidates older multi-candidate summaries without discarding their evidence', () => {
  const a = estimateKey(map(Array.from({length: 4}, () => [24,26,28,29,31,33,35]).flat()), source);
  const track = {key:null,stems:source.stems,model:source.model,keyAnalysis:{...a,version:2}};
  expect(savedKey(track)).toBeNull();
  expect(keyFilters(track)).toEqual(['Unknown']);
  expect(track.keyAnalysis.alternatives).toHaveLength(2);
});
