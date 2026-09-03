import fs from 'node:fs';
import path from 'node:path';
import { readWav, wavOf } from '../src/audio.ts';
import { straightened, type Ruling } from '../src/straighten.ts';
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
 */
export interface ExportAsk extends Ruling {
  trackId: string;
  title: string;
  /** `stems/<id>/<model>`, relative to the library root. */
  stems: string;
  sources: string[];
}

export interface Written {
  where: string;
  files: string[];
  bars: number;
  seconds: number;
  speed: number;
}

/** A file name Finder and Live will both take: no separators, no colons, one line. */
export const tidy = (text: string): string => text.replace(/[/\\:]+/g, '-').replace(/\s+/g, ' ').trim() || 'untitled';

/** `128`, or `128.055` for a tempo that was kept exact. */
export const tempoLabel = (bpm: number): string => (Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(3));

export async function exportStems(root: string, ask: ExportAsk): Promise<Written> {
  if (!(ask.bpm > 0) || !(ask.to > 0) || !Number.isFinite(ask.offset)) throw new Error('bad ruling');
  if (!/^stems\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(ask.stems)) throw new Error(`not a stem folder: ${ask.stems}`);
  const label = tempoLabel(ask.to);
  const where = path.join(await destination(), `${tidy(ask.title)} ${label}bpm`);
  fs.mkdirSync(where, { recursive: true });
  const files: string[] = [];
  let bars = 0;
  let seconds = 0;
  let speed = 1;
  for (const [index, source] of ask.sources.entries()) {
    if (!/^[a-z0-9_-]+$/i.test(source)) throw new Error(`not a source: ${source}`);
    const bytes = fs.readFileSync(path.join(root, ask.stems, `${source}.wav`));
    const read = readWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    if (!read) throw new Error(`${source}.wav: not a wav this reads`);
    const laid = straightened(read.channels, read.rate, ask);
    const file = path.join(where, `${index + 1} - ${tidy(ask.title)} - ${source} - ${label}bpm.wav`);
    fs.writeFileSync(file, Buffer.from(wavOf(laid.channels, laid.rate)));
    files.push(file);
    bars = laid.bars;
    seconds = laid.seconds;
    speed = laid.speed;
  }
  return { where, files, bars, seconds, speed };
}
