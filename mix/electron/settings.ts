import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The handful of machine-specific facts a portable library cannot hold.
 *
 * Where the library folder is, and where an export goes. Neither belongs in the
 * library itself — one is the answer to *where is it*, and the other is a
 * destination outside it — so both live in this app's own state directory.
 *
 * Split out of `library.ts` when the second one arrived, because that file
 * wrote the whole settings object every time it recorded the first: a `choose`
 * of the library folder rewrote `settings.json` as `{ library }` and silently
 * dropped anything else in it. Reading, patching and writing back is the only
 * correct shape once there are two keys, and it is worth having in one place
 * with a test rather than open-coded twice.
 *
 * The file path is an argument rather than an import so this module can be
 * tested — `app.getPath` needs an electron that is running, and none of what is
 * interesting here does.
 */
/** Named once, the way `manifest.ts` names the library's own file. */
export const SETTINGS = 'settings.json';

/** The file, given this app's state directory — which only electron can say. */
export const settingsIn = (stateDir: string): string => path.join(stateDir, SETTINGS);

export interface Settings {
  /** Absolute path to the library folder, or absent until one is picked. */
  library?: string;
  /** Absolute path an export is written under, or absent for the default. */
  exports?: string;
}

/** Missing, unreadable and unparseable are all the same answer: nothing is set. */
export async function readSettings(file: string): Promise<Settings> {
  try {
    const held = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    return held && typeof held === 'object' ? (held as Settings) : {};
  } catch {
    return {};
  }
}

/** Merge one fact in and keep the rest of the file. */
export async function patchSettings(file: string, patch: Settings): Promise<Settings> {
  const next = { ...(await readSettings(file)), ...patch };
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
