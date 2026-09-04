import fs from 'node:fs';
import path from 'node:path';
import { readWav, wavOf } from '../src/audio.ts';
import { DENSITIES, errorsOf, type Every } from '../src/pinned.ts';
import { straightened, type Ruling } from '../src/straighten.ts';
import { resampled, BEATS_PER_BAR } from '../src/warp.ts';
import { destination } from './destination.ts';

/**
 * The stems laid straight at a tempo, into the export folder.
 *
 * What `straighten.ts` is for, reached from the window: every stem of one
 * separation played from 1.1.1 at `to` beats per minute, padded to whole
 * bars, written as float WAVs named for the tempo so Live reads it off the
 * file and a folder of them drops into a set like a sample pack.
 *
 * The stems are named by the manifest's relative path and the source, never
 * by a path the window made up — the library root is this process's to know.
 *
 * Each file name opens with the stem's place in the list the window sent, which
 * is the order the lanes are drawn in, so a folder sorted by name in Finder or
 * dropped into Live lands in the order the app showed rather than alphabetical.
 *
 * **Slices are cut, not rendered again.** Asked for sections, the straightened
 * stem is cut where the slices fall and each span written on its own — the
 * audio is resampled once per stem however many sections come out of it, and a
 * cut is a subarray, so a section boundary is sample-exact against the whole
 * file and two sections butted back together are the record again. Each
 * section gets a numbered folder holding the same numbered stems, because the
 * two orders are different questions — which section, then which stem — and a
 * single flat list of `stems × sections` files answers neither.
 *
 * **The cuts are pinned whether or not the stems are cut there.** A slice is
 * a bar on the grid, and a record laid from its map is pinned at every slice
 * so that each section lands exactly on its bars; how densely it is pinned
 * between them is the ask's `every` — `pinned.ts` — and per beat where the
 * ask says nothing, which is what an export was before it could say.
 */
export interface ExportAsk extends Ruling {
  trackId: string;
  title: string;
  /** `stems/<id>/<model>`, relative to the library root. */
  stems: string;
  sources: string[];
  /**
   * The sections to cut into, in order, or nothing for one file per stem.
   *
   * A bar counts from zero and may be a fraction of one, because that is what
   * the ruler places; each slice runs to the next one, and the last to the end
   * of the record.
   */
  slices?: { bar: number; name: string }[];
}

export interface Written {
  where: string;
  files: string[];
  bars: number;
  seconds: number;
  speed: number;
  /** How many sections each stem was cut into. One means it was not cut. */
  parts: number;
  /** How densely the record was pinned, when it was laid from a map. */
  every?: Every;
  /** How far the worst bar line inside a section landed from the grid, in seconds, when there was a map. */
  worst?: number;
}

/** One span of a straightened stem, and the folder and name it goes out under. */
export interface Cut {
  /** `01 Intro`, or null for the whole record, which needs no folder. */
  label: string | null;
  from: number;
  upto: number;
}

/** A file name Finder and Live will both take: no separators, no colons, one line. */
export const tidy = (text: string): string => text.replace(/[/\\:]+/g, '-').replace(/\s+/g, ' ').trim() || 'untitled';

/** `128`, or `128.055` for a tempo that was kept exact. */
export const tempoLabel = (bpm: number): string => (Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(3));

/**
 * Where a straightened stem is cut, in samples.
 *
 * Slices are placed on the grid, and the grid of a straightened record is a
 * constant number of samples per bar, so a bar is a multiplication — the beat
 * map is not consulted again, because laying the record straight is exactly
 * what took the bend out of it. Cuts are held inside the file and rounded to
 * the sample, so the end of one span is the start of the next with nothing
 * dropped or doubled between them.
 *
 * A slice dragged onto the one after it, or off the end of a record shorter
 * than the grid says, is no samples wide and is not written at all — but it
 * still counts, so the numbers on the sections that follow it do not shuffle
 * up when a cut is emptied.
 */
export function cutsFor(
  slices: readonly { bar: number; name: string }[] | undefined,
  perBar: number,
  total: number,
): Cut[] {
  if (!slices || slices.length === 0) return [{ label: null, from: 0, upto: total }];
  const at = (bar: number): number => Math.min(total, Math.max(0, Math.round(bar * perBar)));
  const cuts: Cut[] = [];
  for (const [index, slice] of slices.entries()) {
    const from = at(slice.bar);
    const next = slices[index + 1];
    const upto = next ? Math.max(from, at(next.bar)) : total;
    if (upto - from < 1) continue;
    cuts.push({ label: `${String(index + 1).padStart(2, '0')} ${tidy(slice.name)}`, from, upto });
  }
  return cuts;
}

export async function exportStems(root: string, ask: ExportAsk): Promise<Written> {
  if (!(ask.bpm > 0) || !(ask.to > 0) || !Number.isFinite(ask.offset)) throw new Error('bad ruling');
  if (!/^stems\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(ask.stems)) throw new Error(`not a stem folder: ${ask.stems}`);
  for (const [index, slice] of (ask.slices ?? []).entries()) {
    if (!(slice.bar >= 0) || !Number.isFinite(slice.bar)) throw new Error(`not a slice: bar ${slice.bar}`);
    if (index > 0 && slice.bar < ask.slices![index - 1].bar) throw new Error('slices out of order');
  }
  if (ask.every !== undefined && !DENSITIES.includes(ask.every)) throw new Error(`not a density: ${ask.every}`);
  const pinnedAt = (ask.slices ?? []).map((slice) => slice.bar);
  const label = tempoLabel(ask.to);
  const where = path.join(await destination(), `${tidy(ask.title)} ${label}bpm`);
  fs.mkdirSync(where, { recursive: true });
  const files: string[] = [];
  let bars = 0;
  let seconds = 0;
  let speed = 1;
  let parts = 1;
  let every: Every | undefined;
  let worst: number | undefined;
  for (const [index, source] of ask.sources.entries()) {
    if (!/^[a-z0-9_-]+$/i.test(source)) throw new Error(`not a source: ${source}`);
    const bytes = fs.readFileSync(path.join(root, ask.stems, `${source}.wav`));
    const read = readWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    if (!read) throw new Error(`${source}.wav: not a wav this reads`);
    const laid = straightened(read.channels, read.rate, { ...ask, cuts: pinnedAt });
    if (laid.pinned && ask.beats) {
      every = laid.pinned.every;
      const errors = errorsOf(resampled(ask.beats, laid.rate, read.channels[0]?.length ?? 0), laid.pinned);
      worst = 0;
      for (let beat = 0; beat < errors.length; beat += BEATS_PER_BAR) worst = Math.max(worst, errors[beat] / laid.rate);
    }
    const total = laid.channels[0]?.length ?? 0;
    const cuts = cutsFor(ask.slices, (BEATS_PER_BAR * 60 * laid.rate) / ask.to, total);
    for (const cut of cuts) {
      const folder = cut.label ? path.join(where, cut.label) : where;
      if (cut.label) fs.mkdirSync(folder, { recursive: true });
      const part = cut.label ? ` - ${cut.label}` : '';
      const file = path.join(folder, `${index + 1} - ${tidy(ask.title)} - ${source}${part} - ${label}bpm.wav`);
      const channels = laid.channels.map((channel) => channel.subarray(cut.from, cut.upto));
      fs.writeFileSync(file, Buffer.from(wavOf(channels, laid.rate)));
      files.push(file);
    }
    bars = laid.bars;
    seconds = laid.seconds;
    speed = laid.speed;
    parts = cuts.length;
  }
  return { where, files, bars, seconds, speed, parts, every, worst };
}
