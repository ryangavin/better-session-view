import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readWav, wavOf } from '../src/audio.ts';
import { straightened } from '../src/straighten.ts';
import { cutsFor, exportStems, tidy } from './export.ts';

/**
 * The cut is the only new arithmetic in an export, and it is the one a person
 * cannot check by ear: a section that starts a few hundred samples late still
 * sounds like the section. So the spans are read back and pieced together — a
 * cut folder holds the record and nothing else, in the order it was played.
 *
 * Pieced together against what `straighten.ts` returned, never against the
 * file on disk. Straightening is its own step with its own tests, and cutting
 * happens after it: a section is a subarray of the straightened record, so the
 * spans join back into it exactly, and any difference is the cut's own. Held
 * against the source wav instead, this would be marking the resampler's
 * homework and would have to allow for it.
 */

let here = '';
const STEMS = 'stems/track-1/htdemucs';
const RATE = 8000;
/** 120 BPM: a bar is two seconds, so a bar is this many samples. */
const BAR = RATE * 2;

vi.mock('./destination.ts', () => ({ destination: async () => here }));

/**
 * A ramp over the whole file, so every sample says where it came from.
 *
 * No value repeats, which is what makes a reassembled record worth comparing:
 * against a signal that came round again, a span taken from the wrong place
 * would read back as the right one.
 */
const ramp = (length: number): Float32Array =>
  Float32Array.from({ length }, (_, i) => i / length);

const put = (root: string, source: string, samples: Float32Array): void => {
  fs.mkdirSync(path.join(root, STEMS), { recursive: true });
  fs.writeFileSync(path.join(root, STEMS, `${source}.wav`), Buffer.from(wavOf([samples], RATE)));
};

const read = (file: string): Float32Array => {
  const bytes = fs.readFileSync(file);
  const wav = readWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  if (!wav) throw new Error(`not a wav: ${file}`);
  return wav.channels[0];
};

let root = '';

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mixflow-export-'));
  here = await fsp.mkdtemp(path.join(os.tmpdir(), 'mixflow-exports-'));
});

const ask = (extra: Partial<Parameters<typeof exportStems>[1]> = {}) => ({
  trackId: 'track-1',
  title: 'A Song',
  stems: STEMS,
  sources: ['vocals', 'drums'],
  bpm: 120,
  offset: 0,
  to: 120,
  ...extra,
});

describe('cutsFor', () => {
  it('is the whole record when nothing is sliced', () => {
    expect(cutsFor(undefined, 100, 550)).toEqual([{ label: null, from: 0, upto: 550 }]);
    expect(cutsFor([], 100, 550)).toEqual([{ label: null, from: 0, upto: 550 }]);
  });

  it('runs each slice to the next, and the last to the end', () => {
    const cuts = cutsFor([{ bar: 0, name: 'Intro' }, { bar: 4, name: 'Drop' }], 100, 900);
    expect(cuts).toEqual([
      { label: '01 Intro', from: 0, upto: 400 },
      { label: '02 Drop', from: 400, upto: 900 },
    ]);
  });

  it('cuts on a fraction of a bar, leaving no gap between the spans', () => {
    const cuts = cutsFor([{ bar: 0, name: 'A' }, { bar: 1.5, name: 'B' }], 441, 1000);
    expect(cuts[0].upto).toBe(cuts[1].from);
    expect(cuts[1].from).toBe(Math.round(1.5 * 441));
  });

  it('drops an empty slice but keeps the numbers of the ones after it', () => {
    const cuts = cutsFor(
      [{ bar: 0, name: 'A' }, { bar: 4, name: 'B' }, { bar: 4, name: 'C' }],
      100,
      900,
    );
    expect(cuts.map((c) => c.label)).toEqual(['01 A', '03 C']);
  });

  it('holds a slice past the end of a short record inside the file', () => {
    const cuts = cutsFor([{ bar: 0, name: 'A' }, { bar: 40, name: 'B' }], 100, 900);
    expect(cuts).toEqual([{ label: '01 A', from: 0, upto: 900 }]);
  });

  it('takes the separators out of a section name', () => {
    expect(cutsFor([{ bar: 0, name: 'Verse/Chorus' }], 100, 900)[0].label).toBe('01 Verse-Chorus');
  });
});

describe('exportStems', () => {
  it('writes one numbered file per stem when nothing is sliced', async () => {
    put(root, 'vocals', ramp(8 * BAR));
    put(root, 'drums', ramp(8 * BAR));
    const done = await exportStems(root, ask());
    expect(done.parts).toBe(1);
    expect(done.files.map((f) => path.basename(f))).toEqual([
      '1 - A Song - vocals - 120bpm.wav',
      '2 - A Song - drums - 120bpm.wav',
    ]);
  });

  it('writes a numbered folder per section, holding the numbered stems', async () => {
    put(root, 'vocals', ramp(8 * BAR));
    put(root, 'drums', ramp(8 * BAR));
    const done = await exportStems(
      root,
      ask({ slices: [{ bar: 0, name: 'Intro' }, { bar: 4, name: 'Drop' }] }),
    );
    expect(done.parts).toBe(2);
    expect(done.files.length).toBe(4);
    expect(fs.readdirSync(done.where).sort()).toEqual(['01 Intro', '02 Drop']);
    expect(fs.readdirSync(path.join(done.where, '02 Drop')).sort()).toEqual([
      '1 - A Song - vocals - 02 Drop - 120bpm.wav',
      '2 - A Song - drums - 02 Drop - 120bpm.wav',
    ]);
  });

  it('cuts sample-exactly: the sections piece back into the whole record', async () => {
    const whole = ramp(8 * BAR);
    put(root, 'vocals', whole);
    const slices = [
      { bar: 0, name: 'Intro' },
      { bar: 2.5, name: 'Verse' },
      { bar: 6, name: 'Outro' },
    ];
    const done = await exportStems(root, ask({ sources: ['vocals'], slices }));
    const spans = done.files.map(read);
    // Where each cut fell, which is the half of this the joining cannot show:
    // a boundary placed late hands the samples it took to the span before it,
    // and the two still piece back together.
    expect(spans.map((span) => span.length)).toEqual([2.5 * BAR, 3.5 * BAR, 2 * BAR]);
    // And then bit for bit against the record the cut was made in, with
    // nothing dropped or doubled at a join.
    const laid = straightened([whole], RATE, { bpm: 120, offset: 0, to: 120 });
    expect(Float32Array.from(spans.flatMap((span) => [...span]))).toEqual(laid.channels[0]);
  });

  it('pads the last section to the end of the record, not to the last slice', async () => {
    // Seven and a half bars: straightening pads to eight, and the last section
    // is what holds the silence.
    put(root, 'vocals', ramp(7.5 * BAR));
    const done = await exportStems(
      root,
      ask({ sources: ['vocals'], slices: [{ bar: 0, name: 'A' }, { bar: 4, name: 'B' }] }),
    );
    expect(done.bars).toBe(8);
    expect(read(done.files[1]).length).toBe(4 * BAR);
  });

  it('refuses slices that are not in order', async () => {
    put(root, 'vocals', ramp(8 * BAR));
    await expect(
      exportStems(root, ask({ slices: [{ bar: 4, name: 'A' }, { bar: 2, name: 'B' }] })),
    ).rejects.toThrow('out of order');
  });
});

describe('tidy', () => {
  it('leaves a name a file system will take', () => {
    expect(tidy('AC/DC — Back  in Black')).toBe('AC-DC — Back in Black');
    expect(tidy('  ')).toBe('untitled');
  });
});
