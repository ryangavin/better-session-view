import fsp from 'node:fs/promises';
import path from 'node:path';
import { SIDECAR } from './job.ts';

/**
 * What the window worked out about a track, kept in the library beside it.
 *
 * Live keeps an `.asd` next to every clip: the warp markers a person set, and
 * the waveform overview so the clip draws before it is read. This is that
 * file. Without it the grid lived in the window's own `localStorage` — on this
 * machine, under this build — and the peaks were walked again from forty
 * million samples every time a track was opened. Both are facts *about the
 * audio*, and the audio is in the folder, so this is where they go.
 *
 * `analysis/<track>/analysis.json` is the grid: what was decided, and what
 * was measured. `analysis/<track>/peaks.<model>.bin` is the drawing of one
 * separation's stems, binary because nine thousand columns of four stems is a
 * megabyte of digits as JSON and a quarter of that as floats.
 *
 * Both are **derived**. `job.ts` has the rule: a derived file that will not
 * parse is redone, never reported. A grid nobody can read is re-measured, and
 * peaks nobody can read are re-walked; neither is worth a dialog. The one
 * exception is the grid a hand made, which cannot be redone — so the grid is
 * written atomically, the way `manifest.ts` writes the library, and a write
 * that dies halfway leaves the last good one in place.
 */

export const ANALYSIS = 'analysis';
export const ANALYSIS_FILE = 'analysis.json';
export const ANALYSIS_FORMAT = 1;
export const PEAKS_FORMAT = 1;

/** The beat map, restated from `src/warp.ts` for the same reason `openflow.ts` restates. */
export interface BeatMap {
  rate: number;
  length: number;
  first: number;
  samples: readonly number[];
}

/** The grid as it stands: an even ruling from `bpm` and `offset`, or the map. */
export interface Grid {
  bpm: number;
  /** Whether the tempo on screen was measured rather than typed. */
  bpmAuto: boolean;
  /** Seconds from the top of the file to the downbeat of bar 1. */
  offset: number;
  beats: BeatMap | null;
}

/** What the last fit read, kept so the header can still say where the tempo came from. */
export interface Reading {
  bpm: number;
  offset: number;
  agreement: number;
  tracked?: number;
  slowest?: number;
  fastest?: number;
}

/** A span of the song with a name, starting at a bar of the grid. `src/slices.ts`. */
export interface SliceKept {
  bar: number;
  name: string;
}

export interface Analysis {
  openflow: 'mix-analysis';
  version: number;
  track: string;
  /** Null when nothing has been decided, which is the same as the file not being there. */
  grid: Grid | null;
  fit: Reading | null;
  /**
   * The slices somebody made, in order of bar. Null while nobody has, which
   * the window takes as: read them off the stems again. A file from before
   * there were slices has no field, and reads the same.
   */
  slices?: SliceKept[] | null;
  produced: string;
}

/** The drawing of one separation's stems, one column per `Peak` of `src/audio.ts`. */
export interface Peaks {
  /** `stems/<track>/<model>`, the folder these were walked from. */
  stems: string;
  /** The separation's own key, so peaks of a redone separation are not trusted. */
  key: string;
  columns: number;
  /** Interleaved min, max per column, `columns * 2` long, per source. */
  sources: Record<string, Float32Array>;
}

interface PeaksHeader {
  openflow: 'mix-peaks';
  version: number;
  stems: string;
  key: string;
  columns: number;
  sources: string[];
}

export const analysisAt = (trackId: string): string => `${ANALYSIS}/${trackId}`;

const modelOf = (stems: string): string => stems.slice(stems.lastIndexOf('/') + 1);

export const peaksFile = (trackId: string, stems: string): string =>
  `${analysisAt(trackId)}/peaks.${modelOf(stems)}.bin`;

/** Written beside, then renamed over: a reader never sees half a file. */
async function place(root: string, at: string, body: Buffer | string): Promise<void> {
  const to = path.join(root, at);
  await fsp.mkdir(path.dirname(to), { recursive: true });
  const writing = `${to}.writing`;
  await fsp.writeFile(writing, body);
  await fsp.rename(writing, to);
}

export async function readAnalysis(root: string, trackId: string): Promise<Analysis | null> {
  try {
    const held = JSON.parse(
      await fsp.readFile(path.join(root, analysisAt(trackId), ANALYSIS_FILE), 'utf8'),
    ) as Analysis;
    if (held.openflow !== 'mix-analysis' || held.version !== ANALYSIS_FORMAT) return null;
    if (held.track !== trackId) return null;
    if (held.grid && !(held.grid.bpm > 0 && Number.isFinite(held.grid.offset))) return null;
    if (held.grid?.beats && !Array.isArray(held.grid.beats.samples)) return null;
    if (held.slices != null && !slicesSound(held.slices)) return null;
    return held;
  } catch {
    return null;
  }
}

/** Slices the window can draw: a list in bar order, each a finite bar and a name. */
const slicesSound = (slices: unknown): slices is SliceKept[] =>
  Array.isArray(slices) &&
  slices.every(
    (s, i) =>
      typeof s === 'object' &&
      s !== null &&
      Number.isFinite((s as SliceKept).bar) &&
      typeof (s as SliceKept).name === 'string' &&
      (i === 0 || (s as SliceKept).bar >= (slices[i - 1] as SliceKept).bar),
  );

export async function writeAnalysis(
  root: string,
  trackId: string,
  it: { grid: Grid | null; fit: Reading | null; slices?: SliceKept[] | null },
): Promise<void> {
  const analysis: Analysis = {
    openflow: 'mix-analysis',
    version: ANALYSIS_FORMAT,
    track: trackId,
    grid: it.grid,
    fit: it.fit,
    slices: it.slices ?? null,
    produced: new Date().toISOString(),
  };
  await place(root, `${analysisAt(trackId)}/${ANALYSIS_FILE}`, JSON.stringify(analysis));
}

/** The separation's key, or empty where there is no sidecar to ask. */
async function keyOf(root: string, stems: string): Promise<string> {
  try {
    const held = JSON.parse(await fsp.readFile(path.join(root, stems, SIDECAR), 'utf8')) as {
      key?: unknown;
    };
    return typeof held.key === 'string' ? held.key : '';
  } catch {
    return '';
  }
}

/**
 * Peaks for exactly this separation, or null.
 *
 * The header names the stems folder and the separation's key, and both have to
 * match what is there now: a separation run again under the same model lands
 * in the same folder with a different key, and peaks of the old one would draw
 * a waveform the audio no longer has.
 */
export async function readPeaks(root: string, trackId: string, stems: string): Promise<Peaks | null> {
  try {
    const bytes = await fsp.readFile(path.join(root, peaksFile(trackId, stems)));
    if (bytes.length < 4) return null;
    const headerLength = bytes.readUInt32LE(0);
    const header = JSON.parse(bytes.subarray(4, 4 + headerLength).toString('utf8')) as PeaksHeader;
    if (header.openflow !== 'mix-peaks' || header.version !== PEAKS_FORMAT) return null;
    if (header.stems !== stems || header.key !== (await keyOf(root, stems))) return null;
    if (!(header.columns > 0) || !Array.isArray(header.sources)) return null;
    // Floats are read from an aligned copy: the header's length is whatever
    // the JSON came to, and a Float32Array cannot start on an odd byte.
    const per = header.columns * 2;
    const body = 4 + headerLength;
    if (bytes.length !== body + header.sources.length * per * 4) return null;
    const aligned = new Uint8Array(bytes.subarray(body));
    const floats = new Float32Array(aligned.buffer, 0, header.sources.length * per);
    const sources: Record<string, Float32Array> = {};
    header.sources.forEach((source, i) => {
      sources[source] = floats.slice(i * per, (i + 1) * per);
    });
    return { stems, key: header.key, columns: header.columns, sources };
  } catch {
    return null;
  }
}

export async function writePeaks(
  root: string,
  trackId: string,
  stems: string,
  columns: number,
  sources: Record<string, Float32Array>,
): Promise<void> {
  const names = Object.keys(sources);
  const per = columns * 2;
  for (const name of names) {
    if (sources[name].length !== per) throw new Error(`${name}: ${sources[name].length} values for ${columns} columns`);
  }
  const header: PeaksHeader = {
    openflow: 'mix-peaks',
    version: PEAKS_FORMAT,
    stems,
    key: await keyOf(root, stems),
    columns,
    sources: names,
  };
  const head = Buffer.from(JSON.stringify(header), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(head.length, 0);
  const body = Buffer.concat(
    names.map((name) => Buffer.from(sources[name].buffer, sources[name].byteOffset, per * 4)),
  );
  await place(root, peaksFile(trackId, stems), Buffer.concat([length, head, body]));
}
