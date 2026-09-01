import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The library on disk: a folder, the audio in it, and one manifest that makes
 * the pair portable.
 *
 * **Everything in the manifest is relative to the manifest.** That is the whole
 * design. A library is a folder you can put on an external drive, carry to the
 * machine at the venue and open there — which it cannot be if it holds a single
 * absolute path. So `library.json` sits at the root, tracks name their audio as
 * `audio/…`, and nothing in here records where the folder happens to be today.
 *
 * No `electron` import, deliberately: this is the code that owns a person's
 * library, so it is the code that has to be testable without a window. The
 * dialogs and the "where is the folder" setting are `library.ts`'s.
 */

/** Bumped when the shape changes in a way a reader has to notice. */
export const FORMAT = 1;
export const MANIFEST = 'library.json';
export const AUDIO = 'audio';

/** What ffmpeg can open and demucs is happy to be handed. */
export const SOUND = ['.wav', '.flac', '.aiff', '.aif', '.mp3', '.m4a', '.aac', '.ogg', '.opus'];

export interface Track {
  id: string;
  /** Relative to the library root, with posix separators. Never absolute. */
  file: string;
  title: string;
  artist: string | null;
  /** Null until something detects it, and drawn as unknown rather than as zero. */
  bpm: number | null;
  key: string | null;
  seconds: number | null;
  /** ISO 8601, so a manifest sorts and diffs sensibly by hand. */
  added: string;
  /** Which model produced the stems on disk, and which sources it produced. */
  model: string | null;
  sources: string[];
  /**
   * Where those stems are, relative to the root — `stems/<id>/<model>`.
   *
   * Relative like everything else here, and separate from `model` because the
   * two answer different questions: `model` is what produced them and this is
   * where to find them. A sidecar in that directory holds the rest, including
   * the source hash it was made from, so a stale stem folder can be recognised
   * as stale rather than believed.
   */
  stems: string | null;
}

export interface Manifest {
  openflow: 'mix-library';
  version: number;
  tracks: Track[];
}

export const empty = (): Manifest => ({ openflow: 'mix-library', version: FORMAT, tracks: [] });

export const manifestPath = (root: string): string => path.join(root, MANIFEST);

/**
 * Read it, or say why not.
 *
 * A folder with no manifest is a *new* library rather than a broken one — that
 * is what choosing an empty folder means — so it reads as empty and the file
 * appears on the first import. A manifest that will not parse is a different
 * thing entirely and throws, because replacing it with an empty one would turn
 * a typo into data loss.
 */
export async function read(root: string): Promise<Manifest> {
  let text: string;
  try {
    text = await fs.readFile(manifestPath(root), 'utf8');
  } catch {
    return empty();
  }
  const held = JSON.parse(text) as Manifest;
  if (held.openflow !== 'mix-library') throw new Error(`${MANIFEST} is not a mix[flow] library`);
  if (!Array.isArray(held.tracks)) throw new Error(`${MANIFEST} has no track list`);
  // A field added after a library was written reads as `undefined`, and a
  // `Track` that claims `stems: string | null` while holding `undefined` is a
  // type that lies. Filling it here rather than at every use is what keeps the
  // rest of this app from having to know which version wrote the file.
  return {
    ...held,
    version: held.version ?? FORMAT,
    tracks: held.tracks.map((track) => ({ ...track, stems: track.stems ?? null })),
  };
}

/**
 * Written to a neighbouring file and renamed over the top.
 *
 * `rename` within a directory is atomic on every filesystem this will meet, so
 * a crash mid-write leaves the previous manifest intact rather than a truncated
 * one. This file *is* the library — the audio beside it is worth little without
 * the index — so it is the one write here that deserves the ceremony.
 */
export async function write(root: string, manifest: Manifest): Promise<void> {
  const target = manifestPath(root);
  const scratch = `${target}.writing`;
  await fs.writeFile(scratch, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.rename(scratch, target);
}

/** Safe on every filesystem, and still recognisable to a person browsing the folder. */
export function tidy(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || 'track';
}

/** `name.wav`, `name-2.wav`, `name-3.wav`. Never overwrite something already there. */
export async function freeName(dir: string, base: string, ext: string): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? `${base}${ext}` : `${base}-${n}${ext}`;
    try {
      await fs.access(path.join(dir, candidate));
    } catch {
      return candidate;
    }
  }
  throw new Error(`too many files named ${base}`);
}

export interface Added {
  manifest: Manifest;
  added: number;
  /** Files that were not audio, or could not be copied, each with its reason. */
  refused: string[];
}

/**
 * Record a finished separation against one track.
 *
 * Read, change one track, write the whole thing back — the same atomic write
 * every other change here uses, because two facts have to land together or
 * neither should: where the stems are, and which model made them. A manifest
 * naming a model with no directory beside it is the one state the window cannot
 * render honestly.
 *
 * `seconds` arrives from the separation because the separator is the first
 * thing in this app that has actually decoded the file. Until then a track's
 * length is null and is drawn as unknown rather than as zero; after one, it is
 * measured rather than estimated.
 */
export async function recordStems(
  root: string,
  id: string,
  found: { model: string; sources: string[]; stems: string; seconds?: number | null },
): Promise<Manifest> {
  const manifest = await read(root);
  const track = manifest.tracks.find((t) => t.id === id);
  // A track deleted from the library while its separation was running. The
  // stems are on disk and orphaned, which is untidy; writing a row back for a
  // track somebody removed would be worse.
  if (!track) return manifest;
  track.model = found.model;
  track.sources = found.sources;
  track.stems = found.stems;
  if (found.seconds != null && track.seconds == null) track.seconds = Math.round(found.seconds);
  await write(root, manifest);
  return manifest;
}

/**
 * Copy files in, and record them.
 *
 * The manifest is written **once**, after every copy has either worked or
 * failed. Writing per file would leave a half-updated index if the disk filled
 * on the ninth of ten, and an index that disagrees with the audio beside it is
 * the one state this is meant never to reach.
 *
 * A refusal is per file rather than for the batch: dragging a folder in means a
 * stray `.DS_Store` or a PDF, and one of those must not stop the eleven WAVs
 * beside it.
 */
export async function addFiles(root: string, files: readonly string[]): Promise<Added> {
  const manifest = await read(root);
  const audio = path.join(root, AUDIO);
  await fs.mkdir(audio, { recursive: true });

  const refused: string[] = [];
  let added = 0;

  for (const source of files) {
    const ext = path.extname(source).toLowerCase();
    if (!SOUND.includes(ext)) {
      refused.push(`${path.basename(source)} — not an audio file`);
      continue;
    }
    try {
      const base = tidy(path.basename(source, path.extname(source)));
      const name = await freeName(audio, base, ext);
      // `copyFile` rather than a stream: it lets the OS clone on APFS, which
      // makes importing a folder of WAVs off the same volume nearly instant.
      await fs.copyFile(source, path.join(audio, name));
      manifest.tracks.push({
        id: crypto.randomUUID(),
        // Posix separators whatever platform wrote it, so a library written on
        // one reads on another.
        file: `${AUDIO}/${name}`,
        title: base,
        artist: null,
        bpm: null,
        key: null,
        seconds: null,
        added: new Date().toISOString(),
        model: null,
        sources: [],
        stems: null,
      });
      added += 1;
    } catch (why) {
      refused.push(`${path.basename(source)} — ${(why as Error).message}`);
    }
  }

  if (added > 0) await write(root, manifest);
  return { manifest, added, refused };
}
