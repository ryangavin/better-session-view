import { app, dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { addFiles, read, type Track } from './manifest.ts';

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

export async function add(win: BrowserWindow | null, files?: string[]): Promise<Imported> {
  const root = await readRoot();
  if (!root) return { ...(await load()), added: 0, refused: ['no library folder chosen'] };

  let chosen = files;
  if (!chosen) {
    const ask: Electron.OpenDialogOptions = {
      title: 'Import tracks',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['wav', 'flac', 'aiff', 'aif', 'mp3', 'm4a', 'aac', 'ogg', 'opus'] }],
      buttonLabel: 'Import',
    };
    const picked = await (win ? dialog.showOpenDialog(win, ask) : dialog.showOpenDialog(ask));
    if (picked.canceled) return { ...(await load()), added: 0, refused: [] };
    chosen = picked.filePaths;
  }

  const done = await addFiles(root, chosen);
  return { root, tracks: done.manifest.tracks, added: done.added, refused: done.refused };
}

/** Show the folder, for when a person would rather use the Finder than this. */
export async function reveal(): Promise<void> {
  const root = await readRoot();
  if (root) void shell.openPath(root);
}
