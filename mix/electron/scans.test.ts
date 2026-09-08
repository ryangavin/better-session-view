import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { wavOf } from '../src/audio.ts';
import { walk, SCAN_RATE, SCAN_VALUES } from '../src/play/scan.ts';
import { readScans, writeScans } from './analysis.ts';
import { keepStemScans, scanned } from './scans.ts';
import { SIDECAR } from './job.ts';

/**
 * A separation is minutes of GPU; the walk that makes the first load quick is a
 * fraction of a second at the end of it. What matters is that it is the same
 * walk the window would have done — a scan drawn from one and a scan drawn from
 * the other have to be the same waveform.
 */

let root = '';
const TRACK = 'track-1';
const STEMS = 'stems/track-1/htdemucs';
const RATE = 8000, SECONDS = 2;
const SOURCES = ['drums', 'bass'];

const tone = (hz: number): Float32Array =>
  Float32Array.from({ length: RATE * SECONDS }, (_, i) => 0.6 * Math.sin((2 * Math.PI * hz * i) / RATE));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'mixflow-scans-'));
  await fs.mkdir(path.join(root, STEMS), { recursive: true });
  await fs.writeFile(path.join(root, STEMS, SIDECAR), JSON.stringify({ key: 'abc:htdemucs' }));
  for (const [i, source] of SOURCES.entries())
    await fs.writeFile(path.join(root, STEMS, `${source}.wav`), Buffer.from(wavOf([tone(200 * (i + 1))], RATE)));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('the stems walked as they are separated', () => {
  it('keeps what the window would have measured, source for source', async () => {
    await keepStemScans(root, TRACK, STEMS, SOURCES);
    const held = await readScans(root, TRACK, STEMS);
    expect(Object.keys(held?.sources ?? {})).toEqual(SOURCES);
    const steps = walk({ channels: [tone(200)], sampleRate: RATE, length: RATE * SECONDS, duration: SECONDS });
    let step = steps.next();
    while (!step.done) step = steps.next();
    expect(held?.rate).toBe(SCAN_RATE);
    expect(held?.sources.drums.bins).toBe(step.value.bins);
    expect(Array.from(held!.sources.drums.values)).toEqual(Array.from(step.value.values));
  });

  it('carries across a scan of the original, which no separation invalidates', async () => {
    const full = { bins: 4, values: Float32Array.from({ length: 4 * SCAN_VALUES }, (_, i) => i / 10) };
    await writeScans(root, TRACK, '', SCAN_RATE, { full });
    await keepStemScans(root, TRACK, STEMS, SOURCES);
    const held = await readScans(root, TRACK, STEMS);
    expect(Object.keys(held?.sources ?? {})).toEqual(['full', ...SOURCES]);
    expect(Array.from(held!.sources.full.values)).toEqual(Array.from(full.values));
  });

  it('reports what is already walked, so reused stems are not walked again', async () => {
    expect(await scanned(root, TRACK, STEMS, SOURCES)).toBe(false);
    await keepStemScans(root, TRACK, STEMS, SOURCES);
    expect(await scanned(root, TRACK, STEMS, SOURCES)).toBe(true);
    expect(await scanned(root, TRACK, STEMS, [...SOURCES, 'vocals'])).toBe(false);
    expect(await scanned(root, TRACK, 'stems/track-1/other-model', SOURCES)).toBe(false);
  });

  it('leaves the separation alone when a stem cannot be read', async () => {
    await fs.writeFile(path.join(root, STEMS, 'bass.wav'), 'not audio');
    await expect(keepStemScans(root, TRACK, STEMS, SOURCES)).resolves.toBeUndefined();
    expect(await readScans(root, TRACK, STEMS)).toBeNull();
  });
});
