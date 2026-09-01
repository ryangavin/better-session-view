import type { BrowserWindow } from 'electron';
import { uiPort, type App } from './apps.ts';

/**
 * The dev loop, in the window that ships instead of in a browser.
 *
 * `OPENFLOW_DEV=1` points a window at the vite dev server rather than at the
 * build, which is the only way to get a hot update inside the real shell — what
 * an app serves in production is a `vite build`, and a build has no hot anything
 * in it. `OPENFLOW_DEV_URL` names the address outright, for a dev server
 * somewhere this could not guess.
 *
 * Returns `''` when this is not a dev run, which every caller then reads as the
 * question "am I in dev" as well as the answer "and it is there".
 */
export function devUrl(one: App, env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPENFLOW_DEV_URL) return env.OPENFLOW_DEV_URL;
  return env.OPENFLOW_DEV ? `http://localhost:${uiPort(one, env)}` : '';
}

/**
 * ` — dev` after the title, and it has to keep saying it.
 *
 * The page sets its own `<title>`, which wins over the `BrowserWindow` option,
 * so a dev window has to correct it on every update. Two windows that look
 * identical and talk to different things is the confusion the icons exist to
 * avoid.
 */
export function markDev(win: BrowserWindow): void {
  win.on('page-title-updated', (event, title) => {
    event.preventDefault();
    win.setTitle(`${title} — dev`);
  });
}
