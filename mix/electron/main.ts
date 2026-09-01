import { app, ipcMain } from 'electron';
import path from 'node:path';
import { APPS } from '@openflow/desktop/apps.ts';
import { devUrl } from '@openflow/desktop/dev.ts';
import { scheme, serve } from '@openflow/desktop/serve.ts';
import { state } from '@openflow/desktop/state.ts';
import { updates } from '@openflow/desktop/update.ts';
import { lifecycle, only, open } from '@openflow/desktop/window.ts';
import { ready } from './demucs.ts';

/**
 * mix[flow]: a mix in, four parts out.
 *
 * Stem separation, run locally — the model is Demucs v4, and where it comes
 * from is `demucs.ts`'s open question rather than this file's.
 *
 * This is what an app costs now. Everything a window is —
 * the frame it remembers, the scheme it serves its own build over, the dev
 * loop, the navigation policy, the updater — is `@openflow/desktop`, and what
 * is left here is the two things only mix[flow] does: it asks whether this
 * machine can separate anything, and it refuses to run twice, because two
 * copies would fight over one GPU.
 */

const MIX = APPS.mix;
/** `mix/dist`, from `mix/electron/dist/main.cjs`. */
const DIST = path.resolve(__dirname, '..', '..', 'dist');

const DEV = devUrl(MIX);
/** Where the window opens, and the only address it is allowed to stay on. */
const HOME = DEV || `${MIX.name}://app/`;

// Before anything can read it, which is the whole reason it is this early.
state(MIX);
// And before `whenReady`, which is when a privileged scheme has to be declared.
scheme(MIX);

const window = (): void => {
  open({ app: MIX, home: HOME, dev: DEV, bounds: true, retry: true });
};

/**
 * One instance. A separation is minutes of the GPU, and two of them interleaved
 * is both of them slower — with two windows that each think they are the one
 * doing it.
 */
if (only(app)) {
  ipcMain.handle('openflow:demucs', () => ready());

  void app.whenReady().then(() => {
    serve(MIX, DIST);
    window();
    updates(MIX);
  });
}

lifecycle(app, window);
