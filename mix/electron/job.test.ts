import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  advance,
  decode,
  estimate,
  hashOf,
  keyOf,
  reusable,
  SIDECAR,
  sidecarOf,
  starting,
  stemsAt,
  type Event,
  type Sidecar,
} from './job.ts';
import { MODELS, modelOf } from './models.ts';

/**
 * What this file is protecting, in one sentence each:
 *
 *   * a cache that skipped work it should have done, which is stems from the
 *     wrong file or the wrong model presented as the right ones;
 *   * a window that says 60% when nothing is happening, or that stops at 97%;
 *   * a sidecar that claims something the run did not measure.
 *
 * The child process is not here and neither is electron. `separate.ts` owns
 * both and is thin because everything worth asserting was moved into this file.
 */

let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'mixflow-job-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const model = modelOf('htdemucs_ft')!;

const done = (): Extract<Event, { event: 'done' }> => ({
  event: 'done',
  residual: -23.6,
  seconds: 240.4,
  wall: 88.2,
  load: 1.5,
  samplerate: 44100,
  channels: 2,
  bits: 32,
  float: true,
  device: 'mps',
  stems: [
    { source: 'drums', file: 'drums.wav', rms: -14.2 },
    { source: 'bass', file: 'bass.wav', rms: -18.9 },
    { source: 'other', file: 'other.wav', rms: -12.1 },
    { source: 'vocals', file: 'vocals.wav', rms: -16.4 },
  ],
});

/** A stem directory with a sidecar in it, as a finished job leaves one. */
const layDown = async (where: string, sidecar: Sidecar): Promise<void> => {
  await fs.mkdir(path.join(root, where), { recursive: true });
  await fs.writeFile(path.join(root, where, SIDECAR), JSON.stringify(sidecar));
  for (const stem of sidecar.stems) {
    await fs.writeFile(path.join(root, where, stem.file), 'RIFF');
  }
};

const madeFrom = (hash: string, id = 'htdemucs_ft'): Sidecar =>
  sidecarOf({
    key: keyOf(hash, modelOf(id)!),
    model: modelOf(id)!,
    source: { file: 'audio/a.flac', bytes: 40_000_000, hash, format: '.flac' },
    done: done(),
  });

describe('the cache key', () => {
  it('is over the source contents, so the same song at two bitrates is two results', async () => {
    const a = path.join(root, 'a.wav');
    const b = path.join(root, 'b.wav');
    await fs.writeFile(a, 'the lossless one');
    await fs.writeFile(b, 'the 128k one');
    expect(keyOf(await hashOf(a), model)).not.toBe(keyOf(await hashOf(b), model));
  });

  it('is the same for the same bytes under a different name', async () => {
    const a = path.join(root, 'a.wav');
    const b = path.join(root, 'renamed.wav');
    await fs.writeFile(a, 'identical');
    await fs.writeFile(b, 'identical');
    expect(keyOf(await hashOf(a), model)).toBe(keyOf(await hashOf(b), model));
  });

  it('separates one model from another on the same file', () => {
    expect(keyOf('abc', modelOf('htdemucs')!)).not.toBe(keyOf('abc', modelOf('htdemucs_6s')!));
  });

  it('separates one set of inference settings from another', () => {
    expect(keyOf('abc', model, 1, 0.25)).not.toBe(keyOf('abc', model, 5, 0.25));
    expect(keyOf('abc', model, 1, 0.25)).not.toBe(keyOf('abc', model, 1, 0.75));
  });
});

describe('reusing a separation that is already there', () => {
  it('reuses one made from the same file with the same model', async () => {
    const where = stemsAt('t1', 'htdemucs_ft');
    await layDown(where, madeFrom('hash-a'));
    expect(await reusable(root, where, keyOf('hash-a', model))).not.toBeNull();
  });

  it('refuses one made from a different file', async () => {
    const where = stemsAt('t1', 'htdemucs_ft');
    await layDown(where, madeFrom('hash-a'));
    expect(await reusable(root, where, keyOf('hash-b', model))).toBeNull();
  });

  it('refuses one whose audio somebody deleted in the Finder', async () => {
    const where = stemsAt('t1', 'htdemucs_ft');
    await layDown(where, madeFrom('hash-a'));
    await fs.rm(path.join(root, where, 'vocals.wav'));
    expect(await reusable(root, where, keyOf('hash-a', model))).toBeNull();
  });

  it('refuses a sidecar it cannot read rather than trusting it', async () => {
    const where = stemsAt('t1', 'htdemucs_ft');
    await fs.mkdir(path.join(root, where), { recursive: true });
    await fs.writeFile(path.join(root, where, SIDECAR), 'not json');
    expect(await reusable(root, where, keyOf('hash-a', model))).toBeNull();
  });

  it('refuses a sidecar written by a format it does not know', async () => {
    const where = stemsAt('t1', 'htdemucs_ft');
    const stale = { ...madeFrom('hash-a'), version: 99 };
    await layDown(where, stale);
    expect(await reusable(root, where, keyOf('hash-a', model))).toBeNull();
  });

  it('refuses a directory with no sidecar at all', async () => {
    const where = stemsAt('t1', 'htdemucs_ft');
    await fs.mkdir(path.join(root, where), { recursive: true });
    await fs.writeFile(path.join(root, where, 'vocals.wav'), 'RIFF');
    expect(await reusable(root, where, keyOf('hash-a', model))).toBeNull();
  });

  it("keeps one model out of another model's directory", () => {
    expect(stemsAt('t1', 'htdemucs')).not.toBe(stemsAt('t1', 'htdemucs_ft'));
  });

  it('names a relative posix path, because a library travels', () => {
    expect(stemsAt('t1', 'htdemucs')).toBe('stems/t1/htdemucs');
  });
});

describe('reading the worker', () => {
  it('ignores a line that is not JSON rather than failing the job', () => {
    expect(decode('UserWarning: something about torch')).toBeNull();
    expect(decode('')).toBeNull();
    expect(decode('{ half an obj')).toBeNull();
  });

  it('ignores JSON that is not an event', () => {
    expect(decode('{"hello":1}')).toBeNull();
  });

  it('reads an event', () => {
    expect(decode('{"event":"stage","stage":"writing stems"}')).toEqual({
      event: 'stage',
      stage: 'writing stems',
    });
  });
});

describe('what the window is shown', () => {
  it('starts at nothing rather than at a guess', () => {
    expect(starting().done).toBe(0);
    expect(starting().perStem).toBeNull();
    expect(starting().seconds).toBeNull();
  });

  it('has no per-stem progress for a model that does every source at once', () => {
    const opened: Event = {
      event: 'opened',
      load: 1,
      sources: ['drums', 'bass', 'other', 'vocals'],
      samplerate: 44100,
      channels: 2,
      perSource: null,
    };
    const at = advance(advance(starting(), opened), {
      event: 'progress',
      done: 0.5,
      source: null,
    });
    expect(at.perStem).toBeNull();
    expect(at.done).toBe(0.5);
  });

  it('walks the stems in order for a model that does one source at a time', () => {
    const opened: Event = {
      event: 'opened',
      load: 1,
      sources: ['drums', 'bass', 'other', 'vocals'],
      samplerate: 44100,
      channels: 2,
      perSource: ['drums', 'bass', 'other', 'vocals'],
    };
    let at = advance(starting(), opened);
    at = advance(at, { event: 'progress', done: 0.3, source: 'bass' });
    // Three tenths of four sources: drums finished, bass a fifth in, the rest
    // untouched. The overall bar and the meters are the same number.
    expect(at.perStem).toEqual({ drums: 1, bass: 0.19999999999999996, other: 0, vocals: 0 });
    at = advance(at, { event: 'progress', done: 1, source: 'vocals' });
    expect(at.perStem).toEqual({ drums: 1, bass: 1, other: 1, vocals: 1 });
  });

  it('never goes backwards, however the chunks finish', () => {
    let at = advance(starting(), { event: 'progress', done: 0.6, source: null });
    at = advance(at, { event: 'progress', done: 0.4, source: null });
    expect(at.done).toBe(0.6);
  });

  it('learns the length when the worker reads the file, and not before', () => {
    let at = starting();
    expect(at.seconds).toBeNull();
    at = advance(at, { event: 'read', seconds: 240.4, samples: 10_603_008 });
    expect(at.seconds).toBe(240.4);
  });

  it('ends at exactly one, whatever the last progress line said', () => {
    let at = advance(starting(), { event: 'progress', done: 0.97, source: null });
    at = advance(at, done());
    expect(at.done).toBe(1);
    expect(at.written).toEqual(['drums', 'bass', 'other', 'vocals']);
  });

  it('records a stem as written once, not once per line', () => {
    let at = starting();
    const line: Event = { event: 'written', source: 'bass', file: 'bass.wav', rms: -18 };
    at = advance(advance(at, line), line);
    expect(at.written).toEqual(['bass']);
  });
});

describe('the sidecar', () => {
  it('records what the run measured rather than what the model claims', () => {
    const made = sidecarOf({
      key: 'k',
      model,
      source: { file: 'audio/a.flac', bytes: 41_000_000, hash: 'abc', format: '.flac' },
      done: done(),
    });
    expect(made.residual).toBe(-23.6);
    expect(made.samplerate).toBe(44100);
    expect(made.wall).toBe(88.2);
    expect(made.device).toBe('mps');
  });

  it('records float32, which is what makes the stems sum', () => {
    const made = sidecarOf({
      key: 'k',
      model,
      source: { file: 'audio/a.flac', bytes: 1, hash: 'abc', format: '.flac' },
      done: done(),
    });
    expect(made.float).toBe(true);
    expect(made.bits).toBe(32);
  });

  it('records the source it was made from, relative and with its format', () => {
    const made = madeFrom('abc');
    expect(made.source.file).toBe('audio/a.flac');
    expect(made.source.format).toBe('.flac');
    expect(path.isAbsolute(made.source.file)).toBe(false);
  });

  it('declares no post-processing, because none was asked for', () => {
    expect(madeFrom('abc').steps).toEqual([]);
  });
});

describe('the estimate', () => {
  it('will not invent one for a track nobody has measured', () => {
    expect(estimate(model, null)).toBeNull();
  });

  it('counts the fixed cost of loading separately from the rate', () => {
    // A twenty-second clip is mostly startup; a ten-minute track is mostly
    // separation. One multiplier cannot describe both, and the difference is
    // the whole reason `load` is its own field.
    const short = estimate(model, 20)!;
    const long = estimate(model, 600)!;
    expect(short).toBeGreaterThan(20 / model.realtime);
    expect(long / short).toBeGreaterThan(10);
  });
});

describe('the registry', () => {
  it('has no two models under one id', () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  });

  it('refuses a model it does not have rather than falling back to one it does', () => {
    // Falling back would separate with something other than what was asked for
    // and then write that into a sidecar as though it had been chosen.
    expect(modelOf('melband-kim')).toBeNull();
  });

  it('says how fast each one is in words that match its number', () => {
    for (const m of MODELS) expect(m.speed).toBe(`~${m.realtime}× realtime`);
  });

  it('gives every model a source list rather than a source count', () => {
    // Four-source models fold guitar and piano back into Other, so the count
    // alone cannot say which lanes a track will have.
    for (const m of MODELS) expect(m.sources.length).toBeGreaterThan(0);
    expect(modelOf('htdemucs_6s')!.sources).toContain('piano');
    expect(modelOf('htdemucs')!.sources).not.toContain('piano');
  });
});
