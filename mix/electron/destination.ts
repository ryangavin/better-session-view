import { app, dialog, type BrowserWindow } from 'electron';
import path from 'node:path';
import { patchSettings, readSettings, settingsIn } from './settings.ts';

/**
 * Where an export lands, and how it gets moved.
 *
 * Not the library, and deliberately not inside it. The library is this app's
 * own folder — copies of the imports, the stems it made, a manifest that keeps
 * the whole thing portable — and an export is the opposite kind of thing: files
 * you are handing to something else, which is usually a DAW's project folder or
 * a drive going to a studio. Writing them into the library would mean every
 * export had to be dug back out of it.
 *
 * The default is `~/Music/mixflow`, because Music is where the OS already says
 * audio for a person goes, and one folder under it keeps a year of exports from
 * being loose among their albums. It is a *default*, not a fallback: nothing is
 * written to `settings.json` until somebody picks somewhere else, so a person
 * who never opens this dialog never has a stale absolute path recorded.
 *
 * The renderer picks by opening this dialog, never by handing a path over —
 * that is the rule `preload.ts` states, and it is what keeps the page unable to
 * name a folder it was not given.
 */

const settingsFile = (): string => settingsIn(app.getPath('userData'));

/** The default, which is only ever this. */
export const fallback = (): string => path.join(app.getPath('music'), 'mixflow');

/** Where the next export goes: what was picked, or the default. */
export const destination = async (): Promise<string> =>
  (await readSettings(settingsFile())).exports ?? fallback();

/**
 * Pick it. Creating a folder in the dialog is allowed, because the folder you
 * want to export into is very often one that does not exist yet.
 *
 * Cancelling answers with where it already was rather than with null: the
 * caller is filling in a line that has to say something either way, and *the
 * same place as before* is the truthful thing for it to say.
 */
export async function chooseDestination(win: BrowserWindow | null): Promise<string> {
  const picked = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options));
  if (picked.canceled || !picked.filePaths[0]) return destination();
  await patchSettings(settingsFile(), { exports: picked.filePaths[0] });
  return destination();
}

const options: Electron.OpenDialogOptions = {
  title: 'Choose where exports go',
  message: 'Each export writes a folder named after the track here.',
  properties: ['openDirectory', 'createDirectory'],
  buttonLabel: 'Export here',
};
