import fs from 'node:fs/promises';
import path from 'node:path';
import type { TranscribedNote } from '../src/tab.ts';

export const TRANSCRIPTIONS = 'transcriptions';
export const TRANSCRIPTION_SIDECAR = 'transcription.json';
export const MIDI_FILE = 'bass.mid';
export const TAB_FILE = 'bass.tab.txt';
export const TRANSCRIPTION_FORMAT = 1;

export const PITCH_ENGINE = {
  engine: 'torchcrepe',
  version: '0.0.24',
  model: 'full',
  fmin: 32.7,
  fmax: 400,
  hopMs: 10,
  confidence: 0.21,
} as const;

export interface TranscriptionSidecar {
  openflow: 'mix-transcription';
  version: number;
  key: string;
  source: { file: string; bytes: number; hash: string };
  engine: typeof PITCH_ENGINE;
  notes: TranscribedNote[];
  noteCount: number;
  pitchedCount: number;
  mutedCount: number;
  voicedFraction: number;
  medianPeriodicity: number;
  pitchRange: [number | null, number | null];
  device: string;
  seconds: number;
  wall: number;
  pitchWall: number;
  midi: typeof MIDI_FILE;
  produced: string;
}

export type TranscribeEvent =
  | { event: 'stage'; stage: string; device?: string }
  | { event: 'read'; seconds: number; samples: number }
  | ({ event: 'done'; notes: TranscribedNote[] } & Omit<
      TranscriptionSidecar,
      'openflow' | 'version' | 'key' | 'source' | 'engine' | 'notes' | 'midi' | 'produced'
    > & { file: string; model: string; fmin: number; fmax: number; confidence: number })
  | { event: 'failed'; says: string };

export interface TranscribeProgress {
  done: number;
  stage: string;
  seconds: number | null;
}

export const transcriptionAt = (trackId: string, model: string): string =>
  `${TRANSCRIPTIONS}/${trackId}/${model}`;

export const transcriptionKey = (stemHash: string): string =>
  `${stemHash}:${PITCH_ENGINE.engine}@${PITCH_ENGINE.version}:${PITCH_ENGINE.model}:f${PITCH_ENGINE.fmin}-${PITCH_ENGINE.fmax}:h${PITCH_ENGINE.hopMs}:c${PITCH_ENGINE.confidence}`;

export function decodeTranscription(line: string): TranscribeEvent | null {
  const text = line.trim();
  if (!text.startsWith('{')) return null;
  try {
    const held = JSON.parse(text) as TranscribeEvent;
    return typeof held?.event === 'string' ? held : null;
  } catch {
    return null;
  }
}

export const startingTranscription = (): TranscribeProgress => ({
  done: 0,
  stage: 'starting pitch analysis',
  seconds: null,
});

export function advanceTranscription(
  was: TranscribeProgress,
  event: TranscribeEvent,
): TranscribeProgress {
  if (event.event === 'stage') return { ...was, stage: event.stage };
  if (event.event === 'read') return { ...was, seconds: event.seconds };
  if (event.event === 'done') return { ...was, done: 1, stage: 'done' };
  return was;
}

export function transcriptionSidecar(args: {
  key: string;
  source: TranscriptionSidecar['source'];
  done: Extract<TranscribeEvent, { event: 'done' }>;
}): TranscriptionSidecar {
  const { key, source, done } = args;
  return {
    openflow: 'mix-transcription',
    version: TRANSCRIPTION_FORMAT,
    key,
    source,
    engine: PITCH_ENGINE,
    notes: done.notes,
    noteCount: done.noteCount,
    pitchedCount: done.pitchedCount,
    mutedCount: done.mutedCount,
    voicedFraction: done.voicedFraction,
    medianPeriodicity: done.medianPeriodicity,
    pitchRange: done.pitchRange,
    device: done.device,
    seconds: done.seconds,
    wall: done.wall,
    pitchWall: done.pitchWall,
    midi: MIDI_FILE,
    produced: new Date().toISOString(),
  };
}

export async function readTranscription(root: string, where: string): Promise<TranscriptionSidecar | null> {
  try {
    const held = JSON.parse(
      await fs.readFile(path.join(root, where, TRANSCRIPTION_SIDECAR), 'utf8'),
    ) as TranscriptionSidecar;
    if (held.openflow !== 'mix-transcription' || held.version !== TRANSCRIPTION_FORMAT) return null;
    if (!Array.isArray(held.notes)) return null;
    return held;
  } catch {
    return null;
  }
}

export async function reusableTranscription(
  root: string,
  where: string,
  key: string,
): Promise<TranscriptionSidecar | null> {
  const held = await readTranscription(root, where);
  if (!held || held.key !== key) return null;
  try {
    await fs.access(path.join(root, where, held.midi));
    return held;
  } catch {
    return null;
  }
}
