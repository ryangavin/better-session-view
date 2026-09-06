import fs from 'node:fs';
import path from 'node:path';
import { readWav, wavOf } from '../src/audio.ts';
import { folderOf, tempoLabel, tidy } from '../src/exportNames.ts';
import { barsOf, DENSITIES, errorsOf, type Every } from '../src/pinned.ts';
import { straightenedPaced, type Ruling } from '../src/straighten.ts';
import { resampled, tempoBetween, BEATS_PER_BAR, type Beats } from '../src/warp.ts';
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
 * *stem* gets a numbered folder holding its sections in order, because that
 * is the shape Live takes: one drag of a stem's folder onto one track lands
 * every section of it as clips in the running order, and a song is four
 * drags rather than one per section. The section number leads the file name
 * so the folder sorts the way the song plays.
 *
 * **Cut into sections with a map, each section is laid at its own tempo.**
 * A record that runs at 128 and then at 140 is not a record at 135: laid
 * there, both halves are warped and neither loops in Live at the tempo on
 * the file. So each section is laid at the whole number nearest the median
 * beat spacing inside it — a steady section warps by nothing at all, which
 * is the least warp there is — and the file carries that tempo in its name,
 * so Live reads the truth off each one. The folder carries the range. A
 * ramp gets the median of its own beats, which is as honest as one number
 * can be about a ramp, and it is not the section anyone loops.
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
  /** How far the worst line landed from the grid, in seconds, when there was a map: the four-bar lines under a loop of 8 or 16 or the sections, the bar lines otherwise. */
  worst?: number;
  /** The tempo each section was laid at, in order, when the stems were cut with a map. */
  tempos?: number[];
}

/** One section to lay on its own: its bars from 1.1.1, its tempo, and the name it goes out under. */
interface Section {
  label: string;
  barA: number;
  barB: number;
  to: number;
}

/** The lines `worst` is read on: what the finer loop would want, as the dialog's sentence says. */
const linesOf = (every: Every | undefined): number => (every === 8 || every === 16 || every === 'section' ? 4 : 1);

/**
 * The sections of a cut record with a map, each at the whole tempo nearest
 * the median beat inside it. An empty section — two slices on one bar, or
 * one past the end — still counts, so the numbers after it do not shuffle.
 */
function sectionsOf(slices: readonly { bar: number; name: string }[], beats: Beats, to: number): Section[] {
  const bars = barsOf(beats, to);
  return slices.map((slice, index) => {
    const barA = Math.min(bars, slice.bar);
    const barB = Math.min(bars, slices[index + 1]?.bar ?? bars);
    const own = barB > barA ? Math.round(tempoBetween(beats, barA * BEATS_PER_BAR, barB * BEATS_PER_BAR)) : to;
    return { label: `${String(index + 1).padStart(2, '0')} ${tidy(slice.name)}`, barA, barB, to: own };
  });
}

/** How far along an export is, sent as it goes: which stem, and the fraction of the whole. */
export interface ExportProgress {
  /** 0 to 1 across every stem asked for. */
  done: number;
  /** *laying drums*, *writing drums*. */
  stage: string;
}

/** One span of a straightened stem, and the folder and name it goes out under. */
export interface Cut {
  /** `01 Intro`, or null for the whole record, which needs no folder or section name. */
  label: string | null;
  from: number;
  upto: number;
}

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

export async function exportStems(root: string, ask: ExportAsk, progress?: (at: ExportProgress) => void): Promise<Written> {
  if (!(ask.bpm > 0) || !(ask.to > 0) || !Number.isFinite(ask.offset)) throw new Error('bad ruling');
  if (!/^stems\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(ask.stems)) throw new Error(`not a stem folder: ${ask.stems}`);
  for (const [index, slice] of (ask.slices ?? []).entries()) {
    if (!(slice.bar >= 0) || !Number.isFinite(slice.bar)) throw new Error(`not a slice: bar ${slice.bar}`);
    if (index > 0 && slice.bar < ask.slices![index - 1].bar) throw new Error('slices out of order');
  }
  if (ask.every !== undefined && !DENSITIES.includes(ask.every)) throw new Error(`not a density: ${ask.every}`);
  // The sections are pinned whether or not the stems are cut at them: the
  // ask may say where the cuts are on their own, for a folder of whole stems
  // that still lands every section on its bars.
  const pinnedAt = ask.cuts ?? (ask.slices ?? []).map((slice) => slice.bar);
  const sections = ask.slices?.length && ask.beats ? sectionsOf(ask.slices, ask.beats, ask.to) : null;
  const tempos = sections ? sections.map((s) => s.to) : [ask.to];
  const where = path.join(await destination(), folderOf(ask.title, Math.min(...tempos), Math.max(...tempos)));
  fs.mkdirSync(where, { recursive: true });
  const files: string[] = [];
  let bars = 0;
  let seconds = 0;
  let speed = 1;
  let parts = 1;
  let every: Every | undefined;
  let worst: number | undefined;
  const lines = linesOf(ask.every);
  for (const [index, source] of ask.sources.entries()) {
    if (!/^[a-z0-9_-]+$/i.test(source)) throw new Error(`not a source: ${source}`);
    const bytes = fs.readFileSync(path.join(root, ask.stems, `${source}.wav`));
    const read = readWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    if (!read) throw new Error(`${source}.wav: not a wav this reads`);
    const length = read.channels[0]?.length ?? 0;
    // A span at a time, the event loop given back between them: the window
    // draws the fraction and stays alive while the stem is laid.
    let told = 0;
    const pace = (from: number, share: number) => async (fraction: number) => {
      const now = Date.now();
      if (now - told >= 50 || fraction === 1) {
        told = now;
        progress?.({ done: (index + from + fraction * share) / ask.sources.length, stage: `laying ${source}` });
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    };
    /** The worst line of the laying, over the bars asked, at the lines the dialog's sentence reads. */
    const judge = (laid: Awaited<ReturnType<typeof straightenedPaced>>, barA: number, barB: number) => {
      if (!laid.pinned || !ask.beats) return;
      every = laid.pinned.every;
      const errors = errorsOf(resampled(ask.beats, laid.rate, length), laid.pinned);
      const step = lines * BEATS_PER_BAR;
      worst ??= 0;
      for (let beat = Math.ceil((barA * BEATS_PER_BAR) / step) * step; beat <= barB * BEATS_PER_BAR && beat < errors.length; beat += step) {
        worst = Math.max(worst, errors[beat] / laid.rate);
      }
    };
    const folder = sections || ask.slices?.length ? path.join(where, `${index + 1} - ${source}`) : where;
    if (folder !== where) fs.mkdirSync(folder, { recursive: true });
    if (sections) {
      // Each section on its own, at its own tempo: only its stretch of the
      // output is laid, and the map is pinned exactly as it would be for the
      // whole record at that tempo, so the section's edges are its bar lines.
      seconds = 0;
      for (const [k, section] of sections.entries()) {
        const perBar = (BEATS_PER_BAR * 60 * read.rate) / section.to;
        const span = { from: Math.round(section.barA * perBar), upto: Math.round(section.barB * perBar) };
        if (span.upto - span.from < 1) continue;
        const laid = await straightenedPaced(read.channels, read.rate, { ...ask, to: section.to, cuts: pinnedAt }, pace(k / sections.length, 1 / sections.length), span);
        judge(laid, section.barA, section.barB);
        const file = path.join(folder, `${section.label} - ${tidy(ask.title)} - ${source} - ${tempoLabel(section.to)}bpm.wav`);
        fs.writeFileSync(file, Buffer.from(wavOf(laid.channels, laid.rate)));
        files.push(file);
        seconds += laid.seconds;
        speed = laid.speed;
      }
      bars = barsOf(ask.beats!, ask.to);
      parts = sections.length;
      progress?.({ done: (index + 1) / ask.sources.length, stage: `writing ${source}` });
      continue;
    }
    const laid = await straightenedPaced(read.channels, read.rate, { ...ask, cuts: pinnedAt }, pace(0, 1));
    progress?.({ done: (index + 1) / ask.sources.length, stage: `writing ${source}` });
    judge(laid, 0, laid.bars);
    const total = laid.channels[0]?.length ?? 0;
    const cuts = cutsFor(ask.slices, (BEATS_PER_BAR * 60 * laid.rate) / ask.to, total);
    const label = tempoLabel(ask.to);
    for (const cut of cuts) {
      const file = path.join(
        folder,
        cut.label
          ? `${cut.label} - ${tidy(ask.title)} - ${source} - ${label}bpm.wav`
          : `${index + 1} - ${tidy(ask.title)} - ${source} - ${label}bpm.wav`,
      );
      const channels = laid.channels.map((channel) => channel.subarray(cut.from, cut.upto));
      fs.writeFileSync(file, Buffer.from(wavOf(channels, laid.rate)));
      files.push(file);
    }
    bars = laid.bars;
    seconds = laid.seconds;
    speed = laid.speed;
    parts = cuts.length;
  }
  return { where, files, bars, seconds, speed, parts, every, worst, tempos: sections ? tempos : undefined };
}
