import { app as electron } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import type { App } from './apps.ts';

/**
 * An app's own server, run as a child and kept alive.
 *
 * **It is a child rather than this process**, and no longer for the reason it
 * first was. Electron's main process is a Node process, so hosting the server
 * here would work and would save a socket hop. It stays a child for three
 * reasons that outlast that: the server remains a program you can run bare, in a
 * test or on a second machine; a renderer crash cannot take it with it; and what
 * this supervises is byte-for-byte what everything else runs.
 *
 * It is run by **Electron's own Node** rather than the one on your PATH. A
 * packaged `.app` has no source tree to run an entry point from — and, launched
 * from Finder, no `node` either: a GUI process inherits `/usr/bin:/bin`, not
 * whatever a shell profile added. `ELECTRON_RUN_AS_NODE` turns this same binary
 * into that Node, so the app carries its own.
 *
 * Both layouts are the same on purpose — `electron/dist/server.mjs` beside a
 * `dist/` two levels up — so the repo and the bundle need no branch.
 */

/** How long to wait before bringing the server back, so a hard failure cannot spin. */
const RESTART_MS = 1000;
/** How long to wait for the port to answer before giving up on the window. */
const READY_MS = 20_000;
/** Long enough for a port already in use to have failed. */
const SETTLE_MS = 400;
/** Between polls while waiting for it. */
const POLL_MS = 150;

export interface Supervised {
  /** Whether the child is up. Read while waiting, and after it has given up. */
  readonly running: boolean;
  /** Waits for something to answer on `port`, and says whether anything did. */
  answered(port: number, host?: string): Promise<boolean>;
}

export interface Supervising {
  app: App;
  /** Handed to the child on top of this process's own environment. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Where the renderer's build sits from inside the bundle — `electron/dist/` up
 * two to the module, then `dist/`. The same in the repo and in a packaged app,
 * which is why neither needs a branch. A server that serves the renderer is told
 * this because it otherwise works its own location out from `import.meta.url`,
 * and that no longer sits one hop from the renderer once it is bundled.
 */
export const rendererDist = (): string => path.resolve(__dirname, '..', '..', 'dist');

/**
 * Starts it, restarts it, and takes it down with the app.
 *
 * The restart policy is the one `tools/visuals.ts` established and is not
 * arbitrary: a clean exit is the server's own shutdown path, and status **2** is
 * the one it emits specifically so a supervisor can tell "the port is taken"
 * from "it fell over". Nothing frees a port by trying again, so neither is
 * relaunched into — the app quits and lets the server's own message stand.
 */
export function supervise(spec: Supervising): Supervised {
  const server = path.join(__dirname, 'server.mjs');
  let child: ChildProcess | null = null;
  let stopping = false;

  const start = (): void => {
    child = spawn(process.execPath, [server], {
      stdio: 'inherit',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ...spec.env,
      },
    });
    child.on('exit', (code, signal) => {
      child = null;
      const done =
        stopping || signal === 'SIGINT' || signal === 'SIGTERM' || code === 0 || code === 2;
      if (done) {
        if (!stopping) electron.quit();
        return;
      }
      console.error(
        `${spec.app.name}: the server exited (${signal ?? code}) — restarting in ${RESTART_MS}ms`,
      );
      setTimeout(start, RESTART_MS);
    });
  };

  /**
   * The server must not outlive the app. An orphan holding the port makes the
   * *next* launch die with status 2, which is the most likely bug in any of
   * this and the one that bites at the worst time.
   */
  electron.on('before-quit', () => {
    stopping = true;
    child?.kill('SIGTERM');
  });

  start();

  return {
    get running() {
      return child !== null;
    },
    async answered(port: number, host = '127.0.0.1') {
      // A beat before the first look. If something else is already on the port,
      // the very first poll succeeds — against *that* — and a window opens onto
      // somebody else's server a moment before ours dies of EADDRINUSE.
      await new Promise((wake) => setTimeout(wake, SETTLE_MS));
      const waited = Date.now() + READY_MS;
      while (child && Date.now() < waited) {
        if (await listening(port, host)) return true;
        await new Promise((wake) => setTimeout(wake, POLL_MS));
      }
      return child ? await listening(port, host) : false;
    },
  };
}

/** Whether anything is listening yet. A window must not open on a refusal. */
export function listening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (yes: boolean) => {
      socket.destroy();
      resolve(yes);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

/**
 * The same wait, for a dev server this app does not own and must not settle for
 * — opening onto what is already there is the entire point in dev.
 */
export async function waitFor(port: number, host: string): Promise<boolean> {
  const waited = Date.now() + READY_MS;
  while (Date.now() < waited) {
    if (await listening(port, host)) return true;
    await new Promise((wake) => setTimeout(wake, POLL_MS));
  }
  return false;
}
