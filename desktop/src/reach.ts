import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { uiPort, type App } from './apps.ts';
import { TYPES } from './mime.ts';
import { within } from './within.ts';
import type { Mounts } from './serve.ts';

/**
 * The same reach a preload has, offered to a browser tab.
 *
 * A tab pointed at the dev server runs the app's own bundle and sees none of
 * its state: everything a person owns is held by the main process, the renderer
 * asks for it over IPC, and IPC arrives through a preload that only a
 * `BrowserWindow` gets. So a tab shows the empty first-run app, correctly and
 * uselessly, and the browser is no use for working on anything past it.
 *
 * What is missing is not the window — it is the transport. `preload.ts` is
 * written entirely in terms of `invoke`, `on` and `off`, so pointing those at a
 * socket instead of at Electron's channel gives a tab the identical
 * `window.openflow`, built from the identical source. That is the whole idea
 * here: one preload, two transports, and no second description of the API to
 * keep in step with the first.
 *
 * This is the half that lives in the main process. It answers `invoke` over
 * POST and events over SSE — request/response and a one-way stream are what
 * those two things already are, so neither needs a protocol invented for it or
 * a dependency added to carry it. It serves the mounts too, because a tab
 * cannot resolve the privileged scheme the window reads its audio through.
 *
 * It is open exactly when the window is pointed at a dev server, and it binds to
 * loopback only. Tying it to that rather than to a switch of its own is the
 * whole reason it can be relied on: a door you have to remember to open is one
 * you find shut at the moment you wanted it, and there is no version of working
 * on this app in a browser that does not want it. A packaged app sets no such
 * variable and so opens no port.
 *
 * Be clear about what it is, all the same: the window's entire API, on a port,
 * with no Chromium between it and whatever else is on this machine. That is
 * worth having in a dev loop and has no business anywhere else.
 */

/** Handlers take Electron's event first; a tab's calls pass the marker below. */
type Handler = (event: unknown, ...args: unknown[]) => unknown;

/** What a handler is handed instead of an `IpcMainInvokeEvent`, for a tab. */
const FROM_TAB = Symbol.for('openflow.reach.tab');

interface Ipc {
  handle(channel: string, fn: Handler): void;
}

export interface Reach {
  /** Fan an event out to every attached tab, alongside the window's own copy. */
  push(channel: string, payload: unknown): void;
  /** Close the port. Nothing in an app calls this; a test cannot do without it. */
  stop(): void;
  /**
   * Where this caller should fetch a mount from.
   *
   * The window reads audio through the app's privileged scheme; a tab has no
   * such scheme and must be told an http origin instead. One handler, two
   * honest answers, decided by who is asking rather than by a second channel.
   */
  origin(event: unknown, fallback: string): string;
}

/**
 * The port a tab reaches this app on: `+4000` on its own dev server.
 *
 * Derived rather than declared, so one rule covers every app and a worktree that
 * moves `OPENFLOW_PORT_BASE` takes its reach with it exactly as it takes the
 * dev servers. The 5xxx family is dense — the two benches sit between the apps —
 * and nothing lives up here, so the whole set fits with no table of per-app
 * numbers to keep in step.
 */
export function reachPort(one: App, env: NodeJS.ProcessEnv = process.env): number {
  return uiPort(one, env) + 4000;
}

/**
 * A dev run, which is the same question as whether a tab may reach this app.
 *
 * The two are deliberately one variable. `dev.ts` already decides what
 * `OPENFLOW_DEV` means — a window on a vite server rather than on a build — and
 * a tab is only ever useful against that same server.
 */
export function reaching(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPENFLOW_DEV || env.OPENFLOW_DEV_URL);
}

/** The one origin allowed to call: this app's own dev server, never `*`. */
export function reachOrigin(one: App, env: NodeJS.ProcessEnv = process.env): string {
  return `http://localhost:${uiPort(one, env)}`;
}

const nothing: Reach = {
  push: () => {},
  stop: () => {},
  origin: (_event, fallback) => fallback,
};

/**
 * Record what the app registers, and answer it over a socket as well.
 *
 * Wrapping `ipcMain.handle` rather than asking twenty-five call sites to
 * register themselves twice is deliberate: a handler that exists for the window
 * and not for a tab is a bug nobody would see until that one feature was tried,
 * and the wrap makes the two lists the same list by construction.
 *
 * Call it before the handlers register, and pass the same `mounts` the scheme
 * gets, so what a tab may fetch and what the window may fetch are one
 * description.
 */
export function reach(
  one: App,
  what: { ipcMain: Ipc; mounts?: Mounts; env?: NodeJS.ProcessEnv },
): Reach {
  const env = what.env ?? process.env;
  if (!reaching(env)) return nothing;

  const handlers = new Map<string, Handler>();
  const real = what.ipcMain.handle.bind(what.ipcMain);
  what.ipcMain.handle = (channel: string, fn: Handler) => {
    handlers.set(channel, fn);
    real(channel, fn);
  };

  const port = reachPort(one, env);
  const allowed = reachOrigin(one, env);
  const mounts = what.mounts ?? {};
  const listening = new Set<http.ServerResponse>();

  const cors = (res: http.ServerResponse): void => {
    res.setHeader('access-control-allow-origin', allowed);
    res.setHeader('access-control-allow-headers', 'content-type');
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    cors(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    // The API, as it already is: one call, one reply.
    if (url.pathname === '/reach/invoke' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        void (async () => {
          res.setHeader('content-type', 'application/json');
          try {
            const { channel, args } = JSON.parse(Buffer.concat(chunks).toString()) as {
              channel: string;
              args: unknown[];
            };
            const handler = handlers.get(channel);
            if (!handler) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ says: `no handler for ${channel}` }));
            }
            const value = await handler({ [FROM_TAB]: true }, ...(args ?? []));
            res.end(JSON.stringify({ value: value ?? null }));
          } catch (cause) {
            // The renderer's contract is a rejected promise, not a dead socket.
            res.statusCode = 500;
            res.end(JSON.stringify({ says: String(cause) }));
          }
        })();
      });
      return;
    }

    // Progress, the other way, for as long as the tab is open.
    if (url.pathname === '/reach/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'access-control-allow-origin': allowed,
      });
      res.write('\n');
      listening.add(res);
      req.on('close', () => listening.delete(res));
      return;
    }

    // The mounts, over http, because a tab cannot resolve `mix://app/…`. The
    // same confinement the scheme handler uses, for the same reason: this is a
    // folder full of somebody's music, named in a URL the page composes.
    void (async () => {
      for (const [prefix, where] of Object.entries(mounts)) {
        if (!url.pathname.startsWith(prefix)) continue;
        const root = await where();
        if (!root) {
          res.statusCode = 404;
          return res.end('not found');
        }
        const file = within(root, decodeURIComponent(url.pathname.slice(prefix.length)));
        if (!file) {
          res.statusCode = 403;
          return res.end('forbidden');
        }
        try {
          const body = await fs.promises.readFile(file);
          res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
          return res.end(body);
        } catch {
          res.statusCode = 404;
          return res.end('not found');
        }
      }
      res.statusCode = 404;
      res.end('not found');
    })();
  });

  // Loopback, said out loud. The default would take every interface on the
  // machine, and this is the whole API with no Chromium in front of it.
  server.listen(port, '127.0.0.1', () => {
    console.log(`[reach] ${one.name}: http://127.0.0.1:${port} — for ${allowed}`);
  });

  return {
    stop: () => {
      for (const res of listening) res.end();
      server.close();
    },
    push: (channel, payload) => {
      const line = `data: ${JSON.stringify({ channel, payload })}\n\n`;
      for (const res of listening) res.write(line);
    },
    origin: (event, fallback) =>
      event && (event as Record<symbol, unknown>)[FROM_TAB]
        ? `http://127.0.0.1:${port}`
        : fallback,
  };
}
