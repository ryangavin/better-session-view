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
 * `analysis/<track>/scan.bin` is the same idea for a deck: every source the
 * deck plays, walked on a clock rather than on the grid, so a track opens on
 * its waveforms instead of reading a hundred million samples again.
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
export const SCAN_FORMAT = 1;
/** Values a scan bin holds, restated from `src/play/overview.ts`. */
export const SCAN_VALUES = 5;

/** The beat map, restated from `src/warp.ts` for the same reason `openflow.ts` restates. */
export interface BeatMap {
  rate: number;
  length: number;
  first: number;
  samples: readonly number[];
  /** The beats a hand set, as indices. Absent from older files and untouched maps. */
  set?: readonly number[];
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
   * A fit that ran over this track's stems and found nothing steady.
   *
   * It rides beside `grid: null` rather than in place of it, because the two
   * say different things and the window needs both: the null is *still owed a
   * grid*, so opening the track measures again, and this is *the last time we
   * looked there was nothing there*, so the header can say so before the
   * stems have finished decoding rather than after.
   *
   * What must never be written is the other thing — a `{ bpm: 120 }` standing
   * in for a failure. That reads back as somebody's decision, and the track
   * opens at 120 forever with nothing on screen admitting where it came from.
   */
  fitFailed?: boolean;
  /**
   * Which algorithm laid this grid — `mix/src/algorithms.ts`'s id — or absent
   * where a hand did, and on every file written before there was a choice.
   *
   * Kept because there is a choice now. Two tracks whose grids sit differently
   * is a question with no answer unless the file says what made each one, and
   * "run the same one again" is not a thing that can be offered otherwise.
   */
  algorithm?: string;
  /**
   * The slices somebody made, in order of bar. Null while nobody has, which
   * the window takes as: read them off the stems again. A file from before
   * there were slices has no field, and reads the same.
   */
  slices?: SliceKept[] | null;
  produced: string;
}

/**
 * What a library row can say about a track's grid without opening it.
 *
 * Three numbers and a flag rather than the map: a rail of two hundred rows
 * would otherwise be two hundred beat maps in the renderer's memory to show
 * two hundred tempos. `src/warp.ts`'s `tempoText` turns these back into the
 * same reading the header gives.
 */
export interface GridNote {
  /** The tempo the grid runs at, or null where the track has none. */
  bpm: number | null;
  /** The ends of a map that moves. Both equal `bpm` for an even ruling. */
  slowest: number | null;
  fastest: number | null;
  /** Whether a hand made or corrected this grid, rather than a fit measuring it. */
  byHand: boolean;
  /** A fit ran and found nothing steady. */
  failed: boolean;
  /** The algorithm that laid it, or null for a hand-made grid or an older file. */
  algorithm: string | null;
}

/** The average tempo of a map, matching `src/warp.ts`'s `tempoOf`. */
function wholeOf(beats: BeatMap): number | null {
  const { samples } = beats;
  if (samples.length < 2 || !(beats.rate > 0)) return null;
  const span = samples[samples.length - 1] - samples[0];
  return span > 0 ? (60 * beats.rate * (samples.length - 1)) / span : null;
}

/** The slowest and fastest a map runs at, matching `src/warp.ts`'s `tempoRange`. */
function endsOf(beats: BeatMap): { slowest: number; fastest: number } {
  let slowest = Infinity;
  let fastest = 0;
  for (let i = 0; i + 1 < beats.samples.length; i++) {
    const bpm = (60 * beats.rate) / (beats.samples[i + 1] - beats.samples[i]);
    if (bpm < slowest) slowest = bpm;
    if (bpm > fastest) fastest = bpm;
  }
  return { slowest, fastest };
}

/** One track's note, from its sidecar. Absent, unreadable and ungridded read alike. */
export async function gridNote(root: string, trackId: string): Promise<GridNote> {
  const held = await readAnalysis(root, trackId);
  const none: GridNote = { bpm: null, slowest: null, fastest: null, byHand: false, failed: false, algorithm: null };
  if (!held) return none;
  const failed = held.fitFailed === true;
  const algorithm = held.algorithm ?? null;
  if (!held.grid) return { ...none, failed };
  const byHand = !held.grid.bpmAuto;
  const map = held.grid.beats;
  if (!map) {
    const { bpm } = held.grid;
    return { bpm, slowest: bpm, fastest: bpm, byHand, failed, algorithm };
  }
  const whole = wholeOf(map);
  if (whole === null) return { ...none, byHand, failed, algorithm };
  const { slowest, fastest } = endsOf(map);
  return {
    bpm: whole,
    slowest: Number.isFinite(slowest) ? slowest : whole,
    fastest: Number.isFinite(fastest) && fastest > 0 ? fastest : whole,
    byHand,
    failed,
    algorithm,
  };
}

/**
 * Every track's note, read together.
 *
 * One small file per track and they are read at once: a library of a few
 * hundred is a few hundred reads of a couple of hundred bytes, which is the
 * same order as the directory listing that named them.
 */
export async function gridNotes(
  root: string,
  trackIds: readonly string[],
): Promise<Record<string, GridNote>> {
  const notes = await Promise.all(trackIds.map((id) => gridNote(root, id)));
  return Object.fromEntries(trackIds.map((id, i) => [id, notes[i]]));
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

/**
 * Every source a deck plays, measured against time. One file rather than one
 * per separation: a track carries a single set of sources at a time, and a
 * separation done again invalidates the original's scan no more than reading
 * it costs — a fraction of a second, against the minutes the separation took.
 */
export interface Scans {
  /** `stems/<track>/<model>` the stems were walked from, or '' for a track with none. */
  stems: string;
  /** The separation's own key, so scans of a redone separation are not trusted. */
  key: string;
  /** Bins a second. */
  rate: number;
  /** Interleaved min, max, low, mid, high per bin, `bins * 5` long, per source. */
  sources: Record<string, { bins: number; values: Float32Array }>;
}

interface ScanHeader {
  openflow: 'mix-scan';
  version: number;
  stems: string;
  key: string;
  rate: number;
  sources: { name: string; bins: number }[];
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

export const scanFile = (trackId: string): string => `${analysisAt(trackId)}/scan.bin`;

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
    // A set list nobody can read costs its map nothing: the beats are where
    // they are, and the next pull stretches from bar 1.
    const set: unknown = held.grid?.beats?.set;
    if (held.grid?.beats && set !== undefined && !(Array.isArray(set) && set.every(Number.isInteger))) {
      held.grid.beats = { ...held.grid.beats, set: undefined };
    }
    if (held.slices != null && !slicesSound(held.slices)) return null;
    if (undecided(held.grid)) return { ...held, grid: null, fitFailed: true, algorithm: undefined };
    return { ...held, fitFailed: held.fitFailed === true };
  } catch {
    return null;
  }
}

/**
 * A grid from before a refused fit had anywhere to be recorded.
 *
 * An even ruling with no map and a tempo nobody measured is the shape the
 * window used to write when a fit found nothing — 120 at sample zero, wearing
 * a decision's clothes. It cannot be anything else: measuring sets `bpmAuto`,
 * and typing a tempo or dragging a beat leaves a map behind, so a grid with
 * neither was never anybody's. Read as the refusal it is, so the track is
 * measured again on its next open instead of opening at 120 for good.
 */
const undecided = (grid: Grid | null): boolean =>
  grid !== null && grid.beats === null && !grid.bpmAuto;

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
  it: { grid: Grid | null; fit: Reading | null; fitFailed?: boolean; algorithm?: string | null; slices?: SliceKept[] | null },
): Promise<void> {
  const analysis: Analysis = {
    openflow: 'mix-analysis',
    version: ANALYSIS_FORMAT,
    track: trackId,
    grid: it.grid,
    fit: it.fit,
    fitFailed: it.fitFailed === true,
    algorithm: it.algorithm ?? undefined,
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

/**
 * The scans of exactly these sources, or null.
 *
 * The header names the stems folder and the separation's key, and both have to
 * match what is there now, for the reason `readPeaks` gives: a separation run
 * again lands in the same folder with different audio in it. A track that has
 * gained or lost stems since fails the same check and is walked again.
 */
export async function readScans(root: string, trackId: string, stems: string): Promise<Scans | null> {
  const held = await readScanFile(root, trackId);
  if (!held) return null;
  return held.stems === stems && held.key === (stems ? await keyOf(root, stems) : '') ? held : null;
}

/**
 * Whatever the file holds, without asking whether it is of these stems.
 *
 * Only the separator wants this. A separation invalidates the stems it wrote
 * over and nothing else, so the scan of the *original* in an older file is
 * still the scan of that original — worth carrying into the file the new
 * separation writes rather than making the next load walk it again.
 */
export async function readScanFile(root: string, trackId: string): Promise<Scans | null> {
  try {
    const bytes = await fsp.readFile(path.join(root, scanFile(trackId)));
    if (bytes.length < 4) return null;
    const headerLength = bytes.readUInt32LE(0);
    const header = JSON.parse(bytes.subarray(4, 4 + headerLength).toString('utf8')) as ScanHeader;
    if (header.openflow !== 'mix-scan' || header.version !== SCAN_FORMAT) return null;
    if (typeof header.stems !== 'string' || typeof header.key !== 'string') return null;
    if (!(header.rate > 0) || !Array.isArray(header.sources)) return null;
    if (header.sources.some((source) => !(source.bins > 0) || typeof source.name !== 'string')) return null;
    const body = 4 + headerLength;
    const total = header.sources.reduce((sum, source) => sum + source.bins * SCAN_VALUES, 0);
    if (bytes.length !== body + total * 4) return null;
    // Read from an aligned copy: the header's length is whatever the JSON came
    // to, and a Float32Array cannot start on an odd byte.
    const aligned = new Uint8Array(bytes.subarray(body));
    const floats = new Float32Array(aligned.buffer, 0, total);
    const sources: Scans['sources'] = {};
    let at = 0;
    for (const source of header.sources) {
      const length = source.bins * SCAN_VALUES;
      sources[source.name] = { bins: source.bins, values: floats.slice(at, at + length) };
      at += length;
    }
    return { stems: header.stems, key: header.key, rate: header.rate, sources };
  } catch {
    return null;
  }
}

export async function writeScans(
  root: string,
  trackId: string,
  stems: string,
  rate: number,
  sources: Record<string, { bins: number; values: Float32Array }>,
): Promise<void> {
  const names = Object.keys(sources);
  for (const name of names) {
    const source = sources[name];
    if (source.values.length !== source.bins * SCAN_VALUES)
      throw new Error(`${name}: ${source.values.length} values for ${source.bins} bins`);
  }
  const header: ScanHeader = {
    openflow: 'mix-scan',
    version: SCAN_FORMAT,
    stems,
    key: stems ? await keyOf(root, stems) : '',
    rate,
    sources: names.map((name) => ({ name, bins: sources[name].bins })),
  };
  const head = Buffer.from(JSON.stringify(header), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(head.length, 0);
  const body = Buffer.concat(
    names.map((name) =>
      Buffer.from(sources[name].values.buffer, sources[name].values.byteOffset, sources[name].bins * SCAN_VALUES * 4),
    ),
  );
  await place(root, scanFile(trackId), Buffer.concat([length, head, body]));
}
