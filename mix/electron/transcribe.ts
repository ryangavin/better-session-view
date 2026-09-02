import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { midiFile } from '../src/midi.ts';
import { bassTranspose, renderTab, transposeNotes, type Tuning } from '../src/tab.ts';
import type { Beats } from '../src/warp.ts';
import { hashOf } from './job.ts';
import { places, prepare, uvPath, worker } from './runtime.ts';
import {
  advanceTranscription,
  decodeTranscription,
  MIDI_FILE,
  PITCH_ENGINE,
  reusableTranscription,
  startingTranscription,
  TAB_FILE,
  transcriptionAt,
  transcriptionKey,
  transcriptionSidecar,
  TRANSCRIPTION_SIDECAR,
  type TranscribeEvent,
  type TranscribeProgress,
  type TranscriptionSidecar,
} from './transcribeJob.ts';
import { busyWork, cancelWork, claim, hold, release, wasCancelled } from './work.ts';

const project = (runtime: string): string => process.env.OPENFLOW_DEMUCS ?? places(runtime).env;

export interface TranscribeRequest {
  root: string;
  runtime: string;
  trackId: string;
  model: string;
  /** The manifest's relative stem directory; the renderer never supplies a path. */
  stems: string;
  tuning: Tuning;
  bars: Beats | null;
  /** Semitones, constrained to the octave choices the renderer exposes. */
  transpose: number;
}

export interface Transcribed {
  ok: true;
  trackId: string;
  model: string;
  where: string;
  midi: string;
  tab: string;
  sidecar: TranscriptionSidecar;
  tuning: Tuning;
  reused: boolean;
}

export interface TranscribeFailed {
  ok: false;
  trackId: string;
  says: string;
  cancelled: boolean;
}

export type TranscribeOutcome = Transcribed | TranscribeFailed;

export interface TranscribeWatcher {
  progress(trackId: string, progress: TranscribeProgress): void;
}

export const transcribing = (): string | null => busyWork('transcribe');
export const cancelTranscription = (trackId?: string): void => cancelWork(trackId, 'transcribe');

async function atomicWrite(file: string, contents: string | Uint8Array): Promise<void> {
  const scratch = `${file}.writing`;
  await fs.writeFile(scratch, contents);
  await fs.rename(scratch, file);
}

/**
 * Rebuild every cheap artifact from one cached inference.
 *
 * The sidecar keeps raw detections. Its transpose records how MIDI, text tab
 * and the renderer currently interpret them, so changing octave never asks the
 * pitch model the same expensive question twice.
 */
export async function writeLayouts(
  root: string,
  where: string,
  sidecar: TranscriptionSidecar,
  tuning: Tuning,
  bars: Beats | null,
  transpose: number,
): Promise<TranscriptionSidecar> {
  const corrected = { ...sidecar, transpose: bassTranspose(transpose) };
  const notes = transposeNotes(corrected.notes, corrected.transpose);
  await atomicWrite(path.join(root, where, MIDI_FILE), midiFile(notes));
  await atomicWrite(
    path.join(root, where, TAB_FILE),
    renderTab({ notes, tuning, seconds: corrected.seconds, bars }),
  );
  await atomicWrite(
    path.join(root, where, TRANSCRIPTION_SIDECAR),
    `${JSON.stringify(corrected, null, 2)}\n`,
  );
  return corrected;
}

export async function transcribe(
  request: TranscribeRequest,
  watch: TranscribeWatcher,
): Promise<TranscribeOutcome> {
  const fail = (says: string, cancelled = false): TranscribeFailed => ({
    ok: false, trackId: request.trackId, says, cancelled,
  });
  if (request.tuning.length < 2) return fail('choose a bass tuning first');
  const occupied = busyWork();
  if (occupied) return fail(`another job is already using the engine for ${occupied}`);

  const stemRelative = `${request.stems}/bass.wav`;
  const source = path.join(request.root, stemRelative);
  let bytes = 0;
  try {
    bytes = (await fs.stat(source)).size;
  } catch {
    return fail('this separation has no bass stem on disk');
  }
  const hash = await hashOf(source);
  const key = transcriptionKey(hash);
  const where = transcriptionAt(request.trackId, request.model);
  const already = await reusableTranscription(request.root, where, key);
  if (already) {
    const sidecar = await writeLayouts(
      request.root,
      where,
      already,
      request.tuning,
      request.bars,
      request.transpose,
    );
    return {
      ok: true,
      trackId: request.trackId,
      model: request.model,
      where,
      midi: `${where}/${MIDI_FILE}`,
      tab: `${where}/${TAB_FILE}`,
      sidecar,
      tuning: request.tuning,
      reused: true,
    };
  }

  const lease = claim('transcribe', request.trackId);
  if (!lease) return fail('another job took the engine');
  const scratch = path.join(request.root, `${where}.writing`);
  try {
    await fs.rm(scratch, { recursive: true, force: true });
    await fs.mkdir(scratch, { recursive: true });
  } catch (why) {
    release(lease);
    return fail(`could not prepare transcription — ${(why as Error).message}`);
  }

  let progress = startingTranscription();
  watch.progress(request.trackId, progress);
  if (!process.env.OPENFLOW_DEMUCS) {
    try {
      await prepare(request.runtime, {
        say: (stage) => {
          progress = { ...progress, stage };
          watch.progress(request.trackId, progress);
        },
        hold: (child) => hold(lease, child),
      });
    } catch (why) {
      const stopped = wasCancelled(lease);
      release(lease);
      await fs.rm(scratch, { recursive: true, force: true });
      return fail(stopped ? 'cancelled' : (why as Error).message, stopped);
    }
  }

  const done = await new Promise<Extract<TranscribeEvent, { event: 'done' }> | TranscribeFailed>((resolve) => {
    const child = spawn(
      uvPath(),
      [
        'run', '--project', project(request.runtime), '--quiet', 'python', worker('transcribe.py'),
        '--input', source, '--out', scratch,
        '--model', PITCH_ENGINE.model,
        '--fmin', String(PITCH_ENGINE.fmin), '--fmax', String(PITCH_ENGINE.fmax),
        '--hop-ms', String(PITCH_ENGINE.hopMs), '--confidence', String(PITCH_ENGINE.confidence),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    hold(lease, child);
    let found: Extract<TranscribeEvent, { event: 'done' }> | null = null;
    let said: string | null = null;
    let noise = '';
    let tail = '';
    child.stdout.on('data', (chunk: Buffer) => {
      tail += chunk.toString();
      const lines = tail.split('\n');
      tail = lines.pop() ?? '';
      for (const line of lines) {
        const event = decodeTranscription(line);
        if (!event) continue;
        if (event.event === 'failed') said = event.says;
        else if (event.event === 'done') found = event;
        progress = advanceTranscription(progress, event);
        watch.progress(request.trackId, progress);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { noise = `${noise}${chunk}`.slice(-4000); });
    child.on('error', (why) => resolve(fail(why.message)));
    child.on('close', (code, signal) => {
      if (wasCancelled(lease)) return resolve(fail('cancelled', true));
      if (found) return resolve(found);
      const last = noise.trim().split('\n').filter(Boolean).pop();
      return resolve(fail(said ?? (signal ? `transcription stopped on ${signal}` : last || `transcription exited ${code}`)));
    });
  });

  if ('ok' in done) {
    release(lease);
    await fs.rm(scratch, { recursive: true, force: true });
    return done;
  }

  const sidecar = transcriptionSidecar({
    key,
    source: { file: stemRelative, bytes, hash },
    done,
    transpose: request.transpose,
  });
  try {
    await writeLayouts(
      request.root,
      `${where}.writing`,
      sidecar,
      request.tuning,
      request.bars,
      request.transpose,
    );
    await fs.rm(path.join(request.root, where), { recursive: true, force: true });
    await fs.mkdir(path.dirname(path.join(request.root, where)), { recursive: true });
    await fs.rename(scratch, path.join(request.root, where));
  } catch (why) {
    await fs.rm(scratch, { recursive: true, force: true });
    release(lease);
    return fail(`could not write transcription — ${(why as Error).message}`);
  }
  release(lease);
  return {
    ok: true,
    trackId: request.trackId,
    model: request.model,
    where,
    midi: `${where}/${MIDI_FILE}`,
    tab: `${where}/${TAB_FILE}`,
    sidecar,
    tuning: request.tuning,
    reused: false,
  };
}
