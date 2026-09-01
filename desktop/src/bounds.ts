import { app as electron, type BrowserWindow, type Rectangle } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Beside the rest of this app's state, which `state()` has already placed. */
const file = (): string => path.join(electron.getPath('userData'), 'window.json');

/**
 * Where the window was last time, or nothing.
 *
 * Sanity-checked rather than trusted: the file is JSON on disk that a crash can
 * truncate and a display change can make nonsense of, and a window restored to
 * 12×4 pixels on a monitor that is no longer there is indistinguishable from an
 * app that failed to start.
 */
export function remembered(): Rectangle | null {
  try {
    const held = JSON.parse(fs.readFileSync(file(), 'utf8')) as Rectangle;
    const sane = [held.x, held.y, held.width, held.height].every(Number.isFinite);
    return sane && held.width > 200 && held.height > 200 ? held : null;
  } catch {
    return null;
  }
}

/** On close, so the app opens where you left it. */
export function remember(win: BrowserWindow): void {
  try {
    fs.writeFileSync(file(), `${JSON.stringify(win.getNormalBounds(), null, 2)}\n`);
  } catch {
    // Not worth failing a quit over; the next launch opens at the default size.
  }
}
