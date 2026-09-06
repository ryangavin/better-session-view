import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SIDECAR } from './job.ts';
import {
  ANALYSIS_FILE,
  analysisAt,
  gridNotes,
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

describe('a fit that found nothing', () => {
  it('is kept as a refusal rather than as a grid', async () => {
    await writeAnalysis(root, TRACK, { grid: null, fit: null, fitFailed: true });
    const held = await readAnalysis(root, TRACK);
    expect(held?.grid).toBeNull();
    expect(held?.fitFailed).toBe(true);
  });

  it('reads an older build\'s 120 fallback as the refusal it was', async () => {
    await writeAnalysis(root, TRACK, {
      grid: { bpm: 120, bpmAuto: false, offset: 0, beats: null },
      fit: null,
    });
    const held = await readAnalysis(root, TRACK);
    expect(held?.grid).toBeNull();
    expect(held?.fitFailed).toBe(true);
  });

  it('leaves a measured grid and a hand-made map alone', async () => {
    await writeAnalysis(root, TRACK, {
      grid: { bpm: 128.05, bpmAuto: true, offset: 0.35, beats: null },
      fit: null,
    });
    expect((await readAnalysis(root, TRACK))?.grid?.bpm).toBe(128.05);

    const map = { rate: 48000, length: 480000, first: 0, samples: [0, 22500, 45000] };
    await writeAnalysis(root, 'track-2', {
      grid: { bpm: 128, bpmAuto: false, offset: 0, beats: map },
      fit: null,
    });
    const byHand = await readAnalysis(root, 'track-2');
    expect(byHand?.grid?.beats).toEqual(map);
    expect(byHand?.fitFailed).toBe(false);
  });

  it('is measured again on the next open, because the grid is still null', async () => {
    await writeAnalysis(root, TRACK, { grid: null, fit: null, fitFailed: true });
    // What the window keys `wantFit` on: a null grid is a track still owed one.
    expect((await readAnalysis(root, TRACK))?.grid).toBeNull();
  });
});

describe('the note a library row reads', () => {
  const map = (rate: number, samples: number[]) => ({ rate, length: rate * 20, first: 0, samples });

  it('gives one tempo for a steady map and its ends for a bent one', async () => {
    await writeAnalysis(root, TRACK, {
      grid: { bpm: 120, bpmAuto: true, offset: 0, beats: map(48000, [0, 22500, 45000, 67500]) },
      fit: null,
    });
    const steady = (await gridNotes(root, [TRACK]))[TRACK];
    expect(steady.bpm).toBeCloseTo(128, 5);
    expect(steady.slowest).toBeCloseTo(128, 5);
    expect(steady.fastest).toBeCloseTo(128, 5);
    expect(steady.byHand).toBe(false);
    expect(steady.failed).toBe(false);

    await writeAnalysis(root, 'bent', {
      grid: { bpm: 120, bpmAuto: true, offset: 0, beats: map(48000, [0, 24000, 45000, 67000]) },
      fit: null,
    });
    const bent = (await gridNotes(root, ['bent'])).bent;
    expect(bent.slowest).toBeLessThan(bent.bpm as number);
    expect(bent.fastest).toBeGreaterThan(bent.bpm as number);
  });

  it('says the ruling of an even grid, and who ruled it', async () => {
    await writeAnalysis(root, TRACK, {
      grid: { bpm: 128.05, bpmAuto: false, offset: 0, beats: map(48000, [0, 22500]) },
      fit: null,
    });
    const note = (await gridNotes(root, [TRACK]))[TRACK];
    expect(note.byHand).toBe(true);
  });

  it('separates a refused fit from a track nobody has opened', async () => {
    await writeAnalysis(root, 'refused', { grid: null, fit: null, fitFailed: true });
    const notes = await gridNotes(root, ['refused', 'never']);
    expect(notes.refused).toEqual({ bpm: null, slowest: null, fastest: null, byHand: false, failed: true });
    expect(notes.never).toEqual({ bpm: null, slowest: null, fastest: null, byHand: false, failed: false });
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

describe('the slices', () => {
  const grid = { bpm: 120, bpmAuto: true, offset: 0, beats: null };

  it('keeps the slices somebody made beside the grid', async () => {
    const slices = [
      { bar: 0, name: 'Intro' },
      { bar: 16.5, name: 'Drop' },
    ];
    await writeAnalysis(root, TRACK, { grid, fit: null, slices });
    expect((await readAnalysis(root, TRACK))?.slices).toEqual(slices);
  });

  it('writes null where nobody has made any, and reads a file from before there were any the same', async () => {
    await writeAnalysis(root, TRACK, { grid, fit: null });
    expect((await readAnalysis(root, TRACK))?.slices).toBeNull();
    const at = path.join(root, analysisAt(TRACK), ANALYSIS_FILE);
    await fs.writeFile(at, JSON.stringify({ openflow: 'mix-analysis', version: 1, track: TRACK, grid: null }));
    expect((await readAnalysis(root, TRACK))?.slices).toBeUndefined();
  });

  it('refuses slices out of order or without a bar', async () => {
    const at = path.join(root, analysisAt(TRACK), ANALYSIS_FILE);
    await fs.mkdir(path.dirname(at), { recursive: true });
    const file = (slices: unknown) =>
      fs.writeFile(at, JSON.stringify({ openflow: 'mix-analysis', version: 1, track: TRACK, grid: null, slices }));
    await file([{ bar: 8, name: 'b' }, { bar: 0, name: 'a' }]);
    expect(await readAnalysis(root, TRACK)).toBeNull();
    await file([{ name: 'a' }]);
    expect(await readAnalysis(root, TRACK)).toBeNull();
  });
});
