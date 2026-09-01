import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  advanceTranscription,
  decodeTranscription,
  MIDI_FILE,
  reusableTranscription,
  startingTranscription,
  transcriptionAt,
  transcriptionKey,
  transcriptionSidecar,
  TRANSCRIPTION_SIDECAR,
  type TranscribeEvent,
} from './transcribeJob.ts';

let root = '';
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'mixflow-transcribe-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

const done = (): Extract<TranscribeEvent, { event: 'done' }> => ({
  event: 'done',
  notes: [{ start: 1, end: 1.4, pitch: 28, velocity: 90, confidence: 0.9, muted: false }],
  noteCount: 1,
  pitchedCount: 1,
  mutedCount: 0,
  voicedFraction: 0.5,
  medianPeriodicity: 0.3,
  pitchRange: [28, 28],
  device: 'mps',
  seconds: 10,
  wall: 2,
  pitchWall: 1.8,
  file: MIDI_FILE,
  model: 'full',
  fmin: 32.7,
  fmax: 400,
  confidence: 0.21,
});

describe('transcription cache', () => {
  it('keys pitch work on stem bytes and every pinned inference setting', () => {
    expect(transcriptionKey('a')).not.toBe(transcriptionKey('b'));
    expect(transcriptionKey('a')).toContain('torchcrepe@0.0.24');
  });

  it('uses a portable path separate from the stems', () => {
    expect(transcriptionAt('track', 'htdemucs_ft')).toBe('transcriptions/track/htdemucs_ft');
  });

  it('reuses only a matching sidecar whose MIDI remains on disk', async () => {
    const where = transcriptionAt('track', 'htdemucs_ft');
    const sidecar = transcriptionSidecar({
      key: transcriptionKey('hash'),
      source: { file: 'stems/track/htdemucs_ft/bass.wav', bytes: 10, hash: 'hash' },
      done: done(),
    });
    await fs.mkdir(path.join(root, where), { recursive: true });
    await fs.writeFile(path.join(root, where, TRANSCRIPTION_SIDECAR), JSON.stringify(sidecar));
    await fs.writeFile(path.join(root, where, MIDI_FILE), 'MThd');
    expect(await reusableTranscription(root, where, transcriptionKey('hash'))).not.toBeNull();
    await fs.rm(path.join(root, where, MIDI_FILE));
    expect(await reusableTranscription(root, where, transcriptionKey('hash'))).toBeNull();
  });
});

describe('transcription worker events', () => {
  it('ignores noise and reads JSON events', () => {
    expect(decodeTranscription('torch warning')).toBeNull();
    expect(decodeTranscription('{broken')).toBeNull();
    expect(decodeTranscription('{"event":"stage","stage":"tracking pitch"}')).toEqual({
      event: 'stage', stage: 'tracking pitch',
    });
  });

  it('reports measured duration and finishes exactly', () => {
    let at = advanceTranscription(startingTranscription(), { event: 'read', seconds: 10, samples: 44 });
    expect(at.seconds).toBe(10);
    at = advanceTranscription(at, done());
    expect(at).toMatchObject({ done: 1, stage: 'done' });
  });
});
