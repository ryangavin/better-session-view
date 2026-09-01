import { BrowserWindow } from 'electron';
import path from 'node:path';
import type { App } from './apps.ts';
import { remember, remembered } from './bounds.ts';
import { markDev } from './dev.ts';
import { govern, type Policy } from './navigate.ts';

/**
 * The window every app in this repo opens, and the four things it always does:
 * a sandboxed preload, a background that is not white, a navigation policy, and
 * a title that admits when it is pointed at a dev server.
 *
 * `contextIsolation` with `sandbox: true` is the arrangement the whole shape
 * rests on — it is why a preload is built to CommonJS, and why what crosses the
 * bridge can stay as small as it does in every app here.
 */
export interface Opening extends Policy {
  app: App;
  /** Opened at, unless a remembered frame says otherwise. */
  width?: number;
  height?: number;
  /** Remember the frame across launches. Off for a window that is always a show. */
  bounds?: boolean;
  /**
   * Chrome's background throttling, which is on by default and right by default.
   *
   * Off for a window that has to keep drawing when nobody is looking at it — a
   * wall behind a console is exactly the case Chrome slows and eventually
   * freezes. `switches()` is the other half of that instruction and belongs
   * beside this one.
   */
  throttle?: boolean;
  /** Handed to the preload as argv, which is the only channel a sandboxed one has. */
  args?: string[];
  /**
   * Ask again when a load fails.
   *
   * Running an app before its dev server has finished booting is the ordinary
   * way in, and it otherwise leaves a window showing a connection error that
   * reads as a broken app. Dev only, and never on `ERR_ABORTED` — that is a load
   * that was replaced rather than one that failed, and retrying it is how you
   * get a loop.
   */
  retry?: boolean;
  /** Appended to the one line logged when the page loads, for what else it took. */
  note?: string;
}

/** How long to wait before asking a dev server that isn't up yet a second time. */
const RETRY_MS = 1000;

/**
 * Bundled beside the main process by `build-electron.ts`, always. `__dirname` is
 * the output directory at runtime — esbuild leaves CommonJS's own globals alone,
 * so every module inside the bundle reads the same one.
 */
export const preload = (): string => path.join(__dirname, 'preload.cjs');

export function open(spec: Opening): BrowserWindow {
  const { app, home, dev } = spec;
  const win = new BrowserWindow({
    width: spec.width ?? 1440,
    height: spec.height ?? 900,
    // After the defaults, deliberately: a remembered frame is the whole point
    // and has to win over the size this app opens at when it has none.
    ...(spec.bounds ? (remembered() ?? {}) : {}),
    title: app.title,
    backgroundColor: app.background,
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: spec.throttle ?? true,
      additionalArguments: spec.args ?? [],
    },
  });

  govern(win, spec);
  if (dev) markDev(win);
  if (spec.bounds) win.on('close', () => remember(win));

  // The two lines anyone debugging a blank window needs, and no more. A page
  // that failed to load looks exactly like a page that loaded and drew nothing.
  win.webContents.on('did-finish-load', () => {
    console.log(`${app.name}: ${home}${spec.note ? ` — ${spec.note}` : ''}`);
  });
  win.webContents.on('did-fail-load', (_event, code, why, url, isMainFrame) => {
    console.error(`${app.name}: could not load ${url} — ${why} (${code})`);
    if (spec.retry && dev && isMainFrame && code !== -3 && !win.isDestroyed()) {
      setTimeout(() => {
        if (!win.isDestroyed()) void win.loadURL(home);
      }, RETRY_MS);
    }
  });

  void win.loadURL(home);
  return win;
}

/**
 * The same instruction as `backgroundThrottling: false`, said to Chromium before
 * it starts, because three of these are process-wide switches and not window
 * options. An app that draws a show needs both halves; forget them and the
 * symptom is a projector that stutters whenever somebody brings another window
 * to the front, which reads as a bug in the renderer.
 *
 * Called before `whenReady`.
 */
export function switches(electron: Electron.App): void {
  for (const flag of [
    'disable-background-timer-throttling',
    'disable-backgrounding-occluded-windows',
    'disable-renderer-backgrounding',
  ]) {
    electron.commandLine.appendSwitch(flag);
  }
}

/**
 * macOS keeps an app alive with no windows and reopens it from the Dock. These
 * are launched deliberately and quit deliberately, so both halves say so.
 */
export function lifecycle(electron: Electron.App, reopen: () => void): void {
  electron.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) reopen();
  });
  electron.on('window-all-closed', () => electron.quit());
}

/**
 * One instance, and a second launch focuses it.
 *
 * It matters most for an app that owns a server: a second instance spawns a
 * second one that dies of `EADDRINUSE` on the spot, leaving a window with
 * nothing behind it. Returns false when this process is the second one and
 * should quit.
 */
export function only(electron: Electron.App): boolean {
  if (!electron.requestSingleInstanceLock()) {
    electron.quit();
    return false;
  }
  electron.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  return true;
}
