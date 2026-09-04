import { expect, it } from 'vitest';
import { readReference, scoreReference } from './truthReference.ts';
const truth = { track: 'song', region: { from: 0, to: 3 }, beats: { rate: 48000, samples: [0, 48000, 96000, 144000], downbeat: [0] }, source: 'manual', edits: [], at: '' };
it('rejects another track and nonmonotonic reference beats', () => {
  expect(() => readReference(JSON.stringify(truth), 'other', 3)).toThrow('selected track');
  expect(() => readReference(JSON.stringify({ ...truth, beats: { ...truth.beats, samples: [0, 0] } }), 'song', 3)).toThrow('increase');
});
it('scores identical times correctly at different sample rates', () => {
  const parsed = readReference(JSON.stringify(truth), 'song', 3);
  const s = scoreReference({ rate: 1000, length: 3000, first: 0, samples: [0, 1000, 2000, 3000] }, { rate: 1000, seconds: 3, transients: [] }, parsed);
  expect(s.fMeasure).toBe(1);
  expect(s.offsetMs.mean).toBe(0);
});
