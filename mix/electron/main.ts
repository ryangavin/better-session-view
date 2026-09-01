import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { APPS } from '@openflow/desktop/apps.ts';
import { devUrl } from '@openflow/desktop/dev.ts';
import { scheme, serve } from '@openflow/desktop/serve.ts';
import { state } from '@openflow/desktop/state.ts';
import { updates } from '@openflow/desktop/update.ts';
import { lifecycle, only, open } from '@openflow/desktop/window.ts';
import { ready } from './runtime.ts';
import { add, choose, load, reveal, root } from './library.ts';
import { MODELS } from './models.ts';
import { recordStems } from './manifest.ts';
import { busy, cancel, separate, stopAll, type Outcome } from './separate.ts';
import type { Progress } from './job.ts';

/**
 * mix[flow]: a mix in, four parts out.
 *
 * Stem separation, run locally — the model is Demucs v4, and the environment it
 * runs in is built on first use by `runtime.ts` rather than shipped inside the
 * bundle.
 *
 * Everything a window is — the frame it remembers, the scheme it serves its
 * own build over, the dev loop, the navigation policy, the updater — is
 * `@openflow/desktop`. What is left here is what only mix[flow] does: it owns a
 * library on disk, it asks whether this machine can separate anything, and it
 * refuses to run twice, because two copies would fight over one GPU and over
 * one manifest.
 */

const MIX = APPS.mix;
/**
 * Where the library is mounted on this app's scheme.
 *
 * Named once and answered to the renderer rather than restated there: the
 * process that decides where files are served from is the process that should
 * say so, and a page that composed the URL itself would be a second place to
 * change when this moves.
 */
const MOUNT = '/library/';
/** `mix/dist`, from `mix/electron/dist/main.cjs`. */
const DIST = path.resolve(__dirname, '..', '..', 'dist');

/**
 * Where the Python engine is built, which is the one path in this app that
 * belongs to the *machine* rather than to the person.
 *
 * Application Support rather than the library folder: the library is theirs and
 * travels — a folder they might carry to another laptop — and half a gigabyte
 * of architecture-specific wheels has no business in it. `runtime.ts` is asked
 * to build it and cannot ask electron for this itself, on purpose, so that it
 * stays testable.
 */
const RUNTIME = path.join(app.getPath('userData'), 'runtime');

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
  ipcMain.handle('openflow:demucs', () => ready(RUNTIME));

  // The library is the main process's, because it is a folder. Everything the
  // renderer knows about it arrives through these four, and the renderer never
  // sees a path it could dereference.
  const window_ = () => BrowserWindow.getAllWindows()[0] ?? null;
  ipcMain.handle('openflow:library', () => load());
  ipcMain.handle('openflow:library-choose', () => choose(window_()));
  ipcMain.handle('openflow:library-add', (_event, files?: string[]) => add(window_(), files));
  ipcMain.handle('openflow:library-reveal', () => reveal());
  ipcMain.handle('openflow:library-base', () => `${MIX.name}://app${MOUNT}`);

  // Separation. The registry is answered rather than restated in the renderer,
  // so what the window offers and what a job will actually run are one list.
  ipcMain.handle('openflow:models', () => MODELS);
  ipcMain.handle('openflow:separating', () => busy());
  ipcMain.handle('openflow:separate-cancel', (_event, trackId?: string) => cancel(trackId));

  /**
   * Progress goes out as an event rather than back as a return value, because
   * it arrives hundreds of times across minutes and there is nothing to reply
   * to. `invoke` resolves once, at the end, with the outcome.
   */
  const push = (channel: string, payload: unknown): void => {
    const win = window_();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  ipcMain.handle(
    'openflow:separate',
    async (_event, ask: { trackId: string; file: string; model: string }): Promise<Outcome> => {
      const where = await root();
      if (!where) {
        return { ok: false, trackId: ask.trackId, says: 'no library folder chosen', cancelled: false };
      }
      const outcome = await separate(
        { root: where, runtime: RUNTIME, trackId: ask.trackId, file: ask.file, model: ask.model },
        {
          progress: (trackId: string, progress: Progress) =>
            push('openflow:separate-progress', { trackId, progress }),
          finished: (done: Outcome) => push('openflow:separate-finished', done),
        },
      );
      // The manifest is written here rather than inside the runner: the runner
      // owns a child process and a directory, and the library is the one thing
      // in this app that must not be written by two owners.
      if (outcome.ok) {
        await recordStems(where, outcome.trackId, {
          model: outcome.model,
          sources: outcome.sources,
          stems: outcome.stems,
          seconds: outcome.sidecar.seconds,
        });
      }
      return outcome;
    },
  );

  // A separation is a child process holding the GPU, and quitting the window
  // that started it is not a reason for it to carry on. Same lesson as
  // `desktop/docs/server.md` records about a server.
  app.on('before-quit', stopAll);

  void app.whenReady().then(() => {
    // The build, and the library folder beside it. `mix://app/library/audio/x.wav`
    // is how the renderer reaches audio a person owns: streamed rather than
    // copied through IPC, and confined to whichever folder is the library right
    // now. Under `npm run dev:mix` the page is on vite's origin instead, which
    // is why the mount answers with an allow-origin header.
    serve(MIX, DIST, { [MOUNT]: root });
    window();
    updates(MIX);
  });
}

lifecycle(app, window);
