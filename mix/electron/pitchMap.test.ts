import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readPitchMap, PITCH_MAP_FILE, type PitchMapRef } from './pitchMap.ts';

let folder = '';
afterEach(async () => { if (folder) await fs.rm(folder, { recursive: true, force: true }); });
it('rejects missing, modified or wrong-source evidence instead of trusting note-only caches', async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'mix-pitch-'));
  const map = { openflow: 'mix-pitch-map', version: 1, source: { hash: 'audio', bytes: 100 },
    engine: { name: 'test', fmin: 32.7, fmax: 400 }, seconds: .01, start: 0, step: .01, sampleRate: 16000, windowSeconds: .064,
    policy: { periodicityFloor: .21, silenceDb: -60 }, hz: [55], periodicity: [.9], smoothedPeriodicity: [.9], rmsDb: [-20], state: ['voiced'] };
  const bytes = JSON.stringify(map);
  const ref: PitchMapRef = { file: PITCH_MAP_FILE, version: 1, frames: 1, sha256: createHash('sha256').update(bytes).digest('hex') };
  expect(await readPitchMap(folder, '', 'audio')).toBeNull();
  await fs.writeFile(path.join(folder, PITCH_MAP_FILE), bytes);
  expect(await readPitchMap(folder, '', 'audio', ref)).toMatchObject({ hz: [55] });
  expect(await readPitchMap(folder, '', 'changed-audio', ref)).toBeNull();
  await fs.appendFile(path.join(folder, PITCH_MAP_FILE), ' ');
  expect(await readPitchMap(folder, '', 'audio', ref)).toBeNull();
});
