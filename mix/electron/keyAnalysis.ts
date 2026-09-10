import path from 'node:path';
import { read, write, type Manifest } from './manifest.ts';
import { hashOf } from './job.ts';
import { readTranscription, transcriptionAt } from './transcribeJob.ts';
import { readPitchMap } from './pitchMap.ts';
import { estimateKey } from '../src/key.ts';

/** Called explicitly after pitch inference. Re-read metadata before publishing;
 * preserve manual key and edits made while inference was running. */
export async function recordKeyAnalysis(root: string, id: string, stems: string, model: string): Promise<Manifest> {
  const where = transcriptionAt(id, model), held = await readTranscription(root, where);
  const hash = await hashOf(path.join(root, stems, 'bass.wav'));
  const map = await readPitchMap(root, where, hash, held?.pitchMap);
  if (!map || !held?.pitchMap) throw new Error('Analyze bass first: no current continuous pitch evidence');
  const analysis = estimateKey(map, { hash, mapHash: held.pitchMap.sha256, stems, model });
  const manifest = await read(root), track = manifest.tracks.find(t => t.id === id);
  if (!track || track.stems !== stems || track.model !== model) throw new Error('The separation changed during key analysis; try again');
  track.keyAnalysis = analysis;
  await write(root, manifest);
  return manifest;
}
