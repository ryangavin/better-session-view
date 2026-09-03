import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SIDECAR } from './job.ts';
import {
  ANALYSIS_FILE,
  analysisAt,
  peaksFile,
  readAnalysis,
  readPeaks,
  writeAnalysis,
  writePeaks,
} from './analysis.ts';

/**
 * The grid a hand made cannot be re-measured, so the file that holds it gets
 * the same care as the manifest: a write that lands whole, a read that refuses
 * what it cannot trust. The peaks are cheaper to lose but must never be wrong
 * — a drawing of stems that were since separated again is a lie in every lane.
 */

let root = '';
const TRACK = 'track-1';
const STEMS = 'stems/track-1/htdemucs';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'mixflow-analysis-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const sidecar = async (key: string): Promise<void> => {
  await fs.mkdir(path.join(root, STEMS), { recursive: true });
  await fs.writeFile(path.join(root, STEMS, SIDECAR), JSON.stringify({ key }));
};

const ramp = (columns: number, scale: number): Float32Array => {
  const out = new Float32Array(columns * 2);
  for (let i = 0; i < columns; i++) {
    out[i * 2] = (-i / columns) * scale;
    out[i * 2 + 1] = (i / columns) * scale;
  }
  return out;
};

describe('the grid', () => {
  it('is nothing until something is written', async () => {
    expect(await readAnalysis(root, TRACK)).toBeNull();
  });

  it('comes back as it was written', async () => {
    const grid = {
      bpm: 128,
      bpmAuto: true,
      offset: 0.35,
      beats: { rate: 44100, length: 441000, first: 0, samples: [15435, 36105, 56775] },
    };
    const fit = { bpm: 128.05, offset: 0.35, agreement: 0.9, tracked: 0.8, slowest: 127, fastest: 129 };
    await writeAnalysis(root, TRACK, { grid, fit });
    const held = await readAnalysis(root, TRACK);
    expect(held?.grid).toEqual(grid);
    expect(held?.fit).toEqual(fit);
    expect(held?.track).toBe(TRACK);
    expect(held?.produced).toMatch(/^\d{4}-/);
  });

  it('leaves nothing half-written beside the last good one', async () => {
    await writeAnalysis(root, TRACK, { grid: { bpm: 120, bpmAuto: false, offset: 0, beats: null }, fit: null });
    const listing = await fs.readdir(path.join(root, analysisAt(TRACK)));
    expect(listing).toEqual([ANALYSIS_FILE]);
  });

  it('refuses a file it cannot trust rather than reporting it', async () => {
    const at = path.join(root, analysisAt(TRACK), ANALYSIS_FILE);
    await fs.mkdir(path.dirname(at), { recursive: true });
    await fs.writeFile(at, '{not json');
    expect(await readAnalysis(root, TRACK)).toBeNull();
    await fs.writeFile(at, JSON.stringify({ openflow: 'mix-analysis', version: 1, track: 'other', grid: null }));
    expect(await readAnalysis(root, TRACK)).toBeNull();
    await fs.writeFile(
      at,
      JSON.stringify({ openflow: 'mix-analysis', version: 1, track: TRACK, grid: { bpm: 0, offset: 0 } }),
    );
    expect(await readAnalysis(root, TRACK)).toBeNull();
  });
});

describe('the peaks', () => {
  it('come back as floats, per source, in the order they went in', async () => {
    await sidecar('abc:htdemucs');
    const drums = ramp(1000, 1);
    const bass = ramp(1000, 0.5);
    await writePeaks(root, TRACK, STEMS, 1000, { drums, bass });
    const held = await readPeaks(root, TRACK, STEMS);
    expect(held?.columns).toBe(1000);
    expect(held?.key).toBe('abc:htdemucs');
    expect(Object.keys(held?.sources ?? {})).toEqual(['drums', 'bass']);
    expect(Array.from(held!.sources.drums)).toEqual(Array.from(drums));
    expect(Array.from(held!.sources.bass)).toEqual(Array.from(bass));
  });

  it('are named for the separation that made them', () => {
    expect(peaksFile(TRACK, STEMS)).toBe('analysis/track-1/peaks.htdemucs.bin');
  });

  it('are not trusted once the separation has been run again', async () => {
    await sidecar('first');
    await writePeaks(root, TRACK, STEMS, 10, { drums: ramp(10, 1) });
    expect(await readPeaks(root, TRACK, STEMS)).not.toBeNull();
    await sidecar('second');
    expect(await readPeaks(root, TRACK, STEMS)).toBeNull();
  });

  it('are not trusted when cut short', async () => {
    await sidecar('k');
    await writePeaks(root, TRACK, STEMS, 10, { drums: ramp(10, 1) });
    const at = path.join(root, peaksFile(TRACK, STEMS));
    const bytes = await fs.readFile(at);
    await fs.writeFile(at, bytes.subarray(0, bytes.length - 8));
    expect(await readPeaks(root, TRACK, STEMS)).toBeNull();
  });

  it('refuse a source of the wrong length', async () => {
    await expect(writePeaks(root, TRACK, STEMS, 10, { drums: ramp(9, 1) })).rejects.toThrow('drums');
  });
});
