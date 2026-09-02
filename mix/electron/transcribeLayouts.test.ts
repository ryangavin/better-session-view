import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { STANDARD_BASS } from '../src/tab.ts';
import { writeLayouts } from './transcribe.ts';
import {
  MIDI_FILE,
  TAB_FILE,
  transcriptionSidecar,
  TRANSCRIPTION_SIDECAR,
  type TranscribeEvent,
} from './transcribeJob.ts';

let root = '';
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'mixflow-layout-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

const done = (): Extract<TranscribeEvent, { event: 'done' }> => ({
  event: 'done',
  notes: [{ start: 1, end: 1.4, pitch: 40, velocity: 90, confidence: 0.9, muted: false }],
  noteCount: 1,
  pitchedCount: 1,
  mutedCount: 0,
  voicedFraction: 0.5,
  medianPeriodicity: 0.3,
  pitchRange: [40, 40],
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

describe('transcription layouts', () => {
  it('rewrites MIDI, tab and the persisted correction from cached notes', async () => {
    const where = 'transcriptions/track/model';
    await fs.mkdir(path.join(root, where), { recursive: true });
    const sidecar = transcriptionSidecar({
      key: 'key',
      source: { file: 'stems/track/model/bass.wav', bytes: 10, hash: 'hash' },
      done: done(),
    });

    await writeLayouts(root, where, sidecar, STANDARD_BASS, null, -12);

    const held = JSON.parse(await fs.readFile(path.join(root, where, TRANSCRIPTION_SIDECAR), 'utf8'));
    const tab = await fs.readFile(path.join(root, where, TAB_FILE), 'utf8');
    const midi = Array.from(await fs.readFile(path.join(root, where, MIDI_FILE)));
    expect(held).toMatchObject({ transpose: -12, notes: [{ pitch: 40 }] });
    expect(tab).toContain('E1|0');
    expect(midi.join(',')).toContain([0x90, 28, 90].join(','));
  });
});
