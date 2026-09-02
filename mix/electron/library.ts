import { app, dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { agrees, fetchArt, inBatches, lookup, lookupWithThumbs, type Match } from './art.ts';
import { guess, term } from './guess.ts';
import { addFiles, editTrack, read, type Edits, type Track } from './manifest.ts';
import { addYoutube } from './youtube.ts';

/**
 * The library, as the window sees it: pick a folder, import into it, read it
 * back.
 *
 * Everything that touches the folder's contents is `manifest.ts`, which imports
 * no electron and is tested. What is here is the two things that need a window:
 * the dialogs, and the one machine-specific fact a portable library cannot hold
 * — where the folder is right now. That lives in this app's own state
 * directory, because a library cannot tell you where to find it.
 *
 * Importing **copies**. A library that referenced files where they already sat
 * would break the first time someone tidied their Downloads folder, and the
 * point of a library is that it still works next year.
 *
 * An import also *looks up* what it just copied — `art.ts`. A track arrives
 * with nothing but a filename, and a row called `01_bounce_final_FINAL` with no
 * artist and no cover is a library you cannot scan. The lookup is bounded and
 * cannot fail an import: no network, no matter, and the guess from the filename
 * stands.
 */

export interface Library {
  /** Absolute, for showing a person. Nothing inside the folder records it. */
  root: string | null;
  tracks: Track[];
  /** Why there is nothing here, when there is nothing here. */
  problem?: string;
}

export interface Imported extends Library {
  added: number;
  refused: string[];
}

const settingsFile = (): string => path.join(app.getPath('userData'), 'settings.json');

async function readRoot(): Promise<string | null> {
  try {
    const held = JSON.parse(await fs.readFile(settingsFile(), 'utf8')) as { library?: string };
    return held.library ?? null;
  } catch {
    return null;
  }
}

async function writeRoot(root: string): Promise<void> {
  await fs.writeFile(settingsFile(), `${JSON.stringify({ library: root }, null, 2)}\n`);
}

/**
 * Where the library is, for the parts of this app that work in the folder
 * rather than on the index — which is separation, and nothing else so far.
 */
export const root = (): Promise<string | null> => readRoot();

export async function load(): Promise<Library> {
  const root = await readRoot();
  if (!root) return { root: null, tracks: [] };
  try {
    await fs.access(root);
  } catch {
    return { root, tracks: [], problem: 'that folder is not there any more' };
  }
  try {
    return { root, tracks: (await read(root)).tracks };
  } catch (why) {
    return { root, tracks: [], problem: (why as Error).message };
  }
}

/** Pick the folder. Creating one in the dialog is allowed: a new library is a folder. */
export async function choose(win: BrowserWindow | null): Promise<Library> {
  const picked = await (win
    ? dialog.showOpenDialog(win, options)
    : dialog.showOpenDialog(options));
  if (picked.canceled || !picked.filePaths[0]) return load();
  await writeRoot(picked.filePaths[0]);
  return load();
}

const options: Electron.OpenDialogOptions = {
  title: 'Choose a library folder',
  message: 'Tracks you import are copied here, beside a manifest that keeps it portable.',
  properties: ['openDirectory', 'createDirectory'],
  buttonLabel: 'Use this folder',
};

/**
 * Fill in what the catalogue knows about tracks that were just imported.
 *
 * **Two guards, and both exist because this writes without being asked.**
 *
 * A track whose filename gave up no artist is left alone entirely. That is the
 * bounce out of a DAW — `mixdown_v3` — and searching a catalogue for it returns
 * a real song by a real artist with real cover art, every time. Renaming
 * somebody's rough mix after a stranger's record is the worst thing this
 * feature could do, and the filename already said it does not know.
 *
 * The rest have to be recognisable in what was searched for — `agrees`. Past
 * both, the artist and the album are taken and the *title is not*: a filename
 * that said `Artist - Title` is a better source than a search's first result,
 * which for a remix or a live take is confidently the studio version.
 *
 * Every failure is silent and per track, because the alternative is an import
 * that refuses a folder of WAVs because a search endpoint was unreachable.
 */
async function enrich(root: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const manifest = await read(root);
  const tracks = manifest.tracks.filter((track) => ids.includes(track.id) && track.artist);

  await inBatches(tracks, async (track) => {
    try {
      const asked = term({ title: track.title, artist: track.artist });
      const [found] = await lookup(asked, 1);
      if (!found || !agrees(asked, found)) return;
      const edits: Edits = { artist: found.artist, album: found.album };
      if (found.artwork) edits.art = await fetchArt(root, track.id, found.artwork);
      await editTrack(root, track.id, edits);
    } catch {
      // A track keeps the name its file gave it. That is the whole fallback.
    }
  });
}

/** Ask the catalogue about one track, for a person who wants to choose. */
export async function matches(text: string): Promise<Match[]> {
  return lookupWithThumbs(text.trim(), 5);
}

/** What the separation screen would search for, before anybody types anything. */
export const guessFrom = guess;

/**
 * Apply a person's corrections, and answer with the whole library.
 *
 * The library rather than the track, because the window holds one list and a
 * reply that changed one row would leave it to splice — which is a second
 * place for the two to disagree.
 */
export async function edit(id: string, edits: Edits): Promise<Library> {
  const root = await readRoot();
  if (!root) return load();
  await editTrack(root, id, edits);
  return load();
}

/**
 * Take one candidate's cover into the library and record it against a track.
 *
 * The URL is fetched here rather than in the window: the page never reaches
 * the network for a picture it is about to store in a folder, and the only
 * thing that lands on disk is what this wrote.
 */
export async function artwork(id: string, url: string): Promise<Library> {
  const root = await readRoot();
  if (!root) return load();
  const at = await fetchArt(root, id, url);
  if (at) await editTrack(root, id, { art: at });
  return load();
}

export async function add(win: BrowserWindow | null, files?: string[]): Promise<Imported> {
  const root = await readRoot();
  if (!root) return { ...(await load()), added: 0, refused: ['no library folder chosen'] };

  let chosen = files;
  if (!chosen) {
    const ask: Electron.OpenDialogOptions = {
      title: 'Import tracks',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['wav', 'flac', 'aiff', 'aif', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'webm'] }],
      buttonLabel: 'Import',
    };
    const picked = await (win ? dialog.showOpenDialog(win, ask) : dialog.showOpenDialog(ask));
    if (picked.canceled) return { ...(await load()), added: 0, refused: [] };
    chosen = picked.filePaths;
  }

  const done = await addFiles(root, chosen);
  await enrich(root, done.ids);
  return { ...(await load()), added: done.added, refused: done.refused };
}

/** Fetch one YouTube video's best audio stream, then import it like any other file. */
export async function youtube(url: string): Promise<Imported> {
  const root = await readRoot();
  if (!root) return { ...(await load()), added: 0, refused: ['no library folder chosen'] };
  try {
    const done = await addYoutube(root, url);
    await enrich(root, done.ids);
    return { ...(await load()), added: done.added, refused: done.refused };
  } catch (why) {
    return { ...(await load()), added: 0, refused: [(why as Error).message] };
  }
}

/** Show the folder, for when a person would rather use the Finder than this. */
export async function reveal(): Promise<void> {
  const root = await readRoot();
  if (root) void shell.openPath(root);
}
