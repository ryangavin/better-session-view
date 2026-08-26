import { app, BrowserWindow, protocol, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PORT, WS_PATH } from '@openflow/protocol/index.ts';

/**
 * set[flow]: the session manager, in a window of its own.
 *
 * It used to be a page the Max device served, which meant the device carried
 * 595 kB of base64 web app inside Live's process and the manager was open
 * whenever the device was. Both of those were the wrong way round: the device
 * should bridge Live and nothing else, and a set manager is something you open
 * when you are working on a set — deliberately, and not during a show.
 *
 * The window is the whole of this file's job. Everything about what the app
 * *does* is still the renderer's, and the device is still the only thing that
 * talks to Live.
 */

const SCHEME = 'set';
/** `set/dist`, from `set/electron/dist/main.cjs`. */
const DIST = path.resolve(__dirname, '..', '..', 'dist');

const PORT = Number(process.env.OPENFLOW_PORT) || DEFAULT_PORT;
const BRIDGE = process.env.OPENFLOW_BRIDGE_WS ?? `ws://127.0.0.1:${PORT}${WS_PATH}`;

/**
 * The dev loop, in this window instead of a browser.
 *
 * `OPENFLOW_DEV=1` points the window at the vite dev server rather than at the
 * scheme. It is the only way to get a hot update inside the shell that actually
 * ships: `set://app` is a file server over a `vite build`, and a build has no hot
 * anything in it. `OPENFLOW_DEV_URL` names the address outright, for a dev server
 * somewhere this could not guess.
 *
 * The port is the base every dev server here counts from — set[flow] is the one
 * that sits on it. Restated rather than imported, because a main process cannot
 * load `vite.config.ts`; this is the same restatement the other four configs
 * make, and `set/docs/dev-server.md` is where the set of them is written down.
 */
const DEV_PORT = Number(process.env.OPENFLOW_PORT_BASE) || 5173;
const DEV =
  process.env.OPENFLOW_DEV_URL || (process.env.OPENFLOW_DEV ? `http://localhost:${DEV_PORT}` : '');
/** Where the window opens, and the only address it is allowed to stay on. */
const HOME = DEV || `${SCHEME}://app/`;

/** How long to wait before asking a dev server that isn't up yet a second time. */
const RETRY_MS = 1000;

/**
 * Where this app's own state lives, set **before** anything can read it.
 *
 * An unpackaged Electron app defaults to `~/Library/Application Support/
 * Electron` — a directory shared with visual[flow] and with every other
 * unpackaged Electron app on the machine. That is where `localStorage` goes, so
 * leaving it there would mean two apps sharing one bucket and column widths
 * disappearing the day something else claimed it. Under `~/.openflow` beside the
 * schemes instead, which is the root this project already keeps state in.
 *
 * Moving this later moves the storage, so it is the first line for a reason.
 */
const home = process.env.OPENFLOW_HOME ?? path.join(os.homedir(), '.openflow');
app.setPath('userData', path.join(home, 'set', 'electron'));

/**
 * A scheme of our own rather than `file://`, and it buys two separate things.
 *
 * The built page asks for `/assets/…` and `/logo-white.png` — root-absolute,
 * because until now a server was serving them. Under `file://` both resolve to
 * the filesystem root and 404; under a scheme with `standard: true` they resolve
 * against the origin and work untouched, so the renderer needs no `base` and dev
 * and desktop stay one build.
 *
 * And it is a **stable origin**, which is what `localStorage` is keyed by. Column
 * widths, the song index columns and the allowed-colour migration flag all live
 * there, so `set://app` surviving a rebuild is the difference between settings
 * that persist and settings that evaporate. `file://` is an opaque origin and
 * gives no such promise.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** Window size and place, so the app opens where you left it. */
const boundsFile = () => path.join(app.getPath('userData'), 'window.json');

function remembered(): Electron.Rectangle | null {
  try {
    const held = JSON.parse(fs.readFileSync(boundsFile(), 'utf8')) as Electron.Rectangle;
    const sane = [held.x, held.y, held.width, held.height].every(Number.isFinite);
    return sane && held.width > 200 && held.height > 200 ? held : null;
  } catch {
    return null;
  }
}

function remember(win: BrowserWindow): void {
  try {
    fs.writeFileSync(boundsFile(), `${JSON.stringify(win.getNormalBounds(), null, 2)}\n`);
  } catch {
    // Not worth failing a quit over; the next launch opens at the default size.
  }
}

function serve(): void {
  protocol.handle(SCHEME, async (request) => {
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('bad request', { status: 400 });
    }
    if (rel === '/') rel = '/index.html';
    const file = path.join(DIST, path.normalize(rel));
    // The same guard the device carried while it served this same build: a
    // scheme handler is a file server, and a file server answers for its root.
    if (file !== DIST && !file.startsWith(DIST + path.sep)) {
      return new Response('forbidden', { status: 403 });
    }
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, {
        headers: { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' },
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

/**
 * Whether a URL is still this app.
 *
 * Two cases that cannot share one comparison: under the scheme it is the scheme,
 * and in dev it is the dev server's origin — `set://app` has no origin to compare
 * against, because a non-special scheme reports `null` for it.
 */
const ours = (url: string): boolean =>
  DEV ? new URL(url).origin === new URL(DEV).origin : new URL(url).protocol === `${SCHEME}:`;

function open(): void {
  const win = new BrowserWindow({
    ...(remembered() ?? { width: 1440, height: 900 }),
    title: 'set[flow]',
    // The app's own background, so a cold start is not a white flash on the way
    // to a dark page.
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Nothing in dev, deliberately. `bridgeUrl()` then falls back to the
      // origin the page came from and vite's `/ws` proxy carries it to the
      // device — which is what a browser does, and what keeps a worktree
      // pointed at whatever device its own dev server was configured for
      // instead of at whatever this process guessed.
      additionalArguments: [`--openflow-bridge=${DEV ? '' : BRIDGE}`],
    },
  });

  // The page sets its own `<title>`, which wins over the option above — so a dev
  // window has to say so afterwards, and keep saying it. Two windows that look
  // identical and talk to different things is the confusion the icons exist to
  // avoid.
  if (DEV) {
    win.on('page-title-updated', (event, title) => {
      event.preventDefault();
      win.setTitle(`${title} — dev`);
    });
  }

  // Every link in the app points somewhere that is not the app — there is one,
  // to the project page. Without this it is a dead click, because Electron
  // refuses `window.open` unless something says what to do with it.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // A single-page app never navigates. Anything that tries is a mis-click or a
  // dragged link, and letting it replace the window is how the app disappears.
  win.webContents.on('will-navigate', (event, url) => {
    if (!ours(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // The two lines anyone debugging a blank window needs, and no more. A page
  // that failed to load looks exactly like a page that loaded and drew nothing.
  win.webContents.on('did-finish-load', () => {
    console.log(`set: ${HOME} — bridge ${DEV ? 'through the dev server' : BRIDGE}`);
  });
  win.webContents.on('did-fail-load', (_event, code, why, url, isMainFrame) => {
    console.error(`set: could not load ${url} — ${why} (${code})`);
    // Running this before vite has finished booting is the ordinary way in, and
    // it leaves a window showing a connection error that reads as a broken app.
    // Keep asking instead. -3 is ERR_ABORTED, which is a load that was replaced
    // rather than one that failed, and retrying it is how you get a loop.
    if (DEV && isMainFrame && code !== -3 && !win.isDestroyed()) {
      setTimeout(() => {
        if (!win.isDestroyed()) void win.loadURL(HOME);
      }, RETRY_MS);
    }
  });

  win.on('close', () => remember(win));
  void win.loadURL(HOME);
}

void app.whenReady().then(() => {
  serve();
  open();
  // macOS keeps an app alive with no windows and reopens from the dock. This one
  // is launched deliberately and quit deliberately, so both halves say so.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) open();
  });
});

app.on('window-all-closed', () => app.quit());
