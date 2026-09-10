import { expect, it, vi } from 'vitest';
import { KEY_VERSION } from '../src/key.ts';
import { backfillKeys } from './keyBackfill.ts';
import type { Library, Track } from '../src/openflow.ts';

const song = (id: string): Track => ({ id, title: id, key: null, stems: `stems/${id}`, model: 'model', sources: ['bass'] } as Track);
function analyzed(track: Track): Track {
  return { ...track, keyAnalysis: { version: KEY_VERSION, algorithm: 'bass-scale-compatibility', source: { stems: track.stems!, model: track.model!, hash: 'hash', mapHash: 'map' },
    label: 'Unknown', status: 'unknown', confidence: 'insufficient', analyzedAt: '', candidates: [], alternatives: [], regions: [], coverage: 0, possibleChanges: false } };
}
const library = (tracks: Track[]): Library => ({ root: '/library', tracks } as Library);
const options = { run: true, report: () => {} };

it('resumes past saved Unknown results, skips missing stems, and continues after a song fails', async () => {
  const held = library([analyzed(song('done')), { ...song('no-bass'), sources: [] }, song('bad'), song('good')]);
  const analyze = vi.fn(async (id: string) => {
    if (id === 'bad') throw new Error('broken source');
    held.tracks = held.tracks.map(t => t.id === id ? analyzed(t) : t);
    return held;
  });
  const result = await backfillKeys({ read: async () => held, busy: async () => false, analyze }, options);
  expect(analyze.mock.calls.map(call => call[0])).toEqual(['bad', 'good']);
  expect(result).toEqual({ completed: 1, failed: 1, skipped: 2, stopped: false });
});

it('previews without starting analysis and stops between songs', async () => {
  const held = library([song('one'), song('two')]);
  let stop = false;
  const analyze = vi.fn(async (id: string) => {
    stop = true;
    return library([analyzed(song(id))]);
  });
  const api = { read: async () => held, busy: async () => false, analyze };
  await backfillKeys(api, { ...options, run: false });
  expect(analyze).not.toHaveBeenCalled();
  expect(await backfillKeys(api, { ...options, stopped: () => stop })).toMatchObject({ completed: 1, stopped: true });
  expect(analyze).toHaveBeenCalledTimes(1);
});

it('stops on a changed library or occupied engine without starting work', async () => {
  const held = library([song('one')]), analyze = vi.fn();
  await expect(backfillKeys({ read: vi.fn().mockResolvedValueOnce(held).mockResolvedValue({ ...held, root: '/elsewhere' }), busy: async () => false, analyze }, options)).rejects.toThrow('Library changed');
  await expect(backfillKeys({ read: async () => held, busy: async () => true, analyze }, options)).rejects.toThrow('engine is busy');
  expect(analyze).not.toHaveBeenCalled();
});
