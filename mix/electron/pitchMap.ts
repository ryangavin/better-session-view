import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validPitchMap, type PitchMap } from '../src/pitchMap.ts';

export const PITCH_MAP_FILE = 'pitch-map.json';
export interface PitchMapRef { file: typeof PITCH_MAP_FILE; version: number; frames: number; sha256: string }

export async function readPitchMap(root: string, where: string, sourceHash: string, ref?: PitchMapRef): Promise<PitchMap | null> {
  if (!ref || ref.file !== PITCH_MAP_FILE || ref.version !== 1) return null;
  try {
    const bytes = await fs.readFile(path.join(root, where, PITCH_MAP_FILE));
    if (createHash('sha256').update(bytes).digest('hex') !== ref.sha256) return null;
    const map: unknown = JSON.parse(bytes.toString('utf8'));
    return validPitchMap(map) && map.source.hash === sourceHash && map.hz.length === ref.frames ? map : null;
  } catch { return null; }
}
