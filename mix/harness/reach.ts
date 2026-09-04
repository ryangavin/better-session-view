/**
 * The app itself, in a browser tab, with the real library behind it.
 *
 * Three lines of work in a particular order, and the order is the whole file.
 * The socket has to be open before the preload runs, because the preload's
 * first act is to describe an API that talks over it; the preload has to have
 * run before the app boots, because the app reads `window.openflow` on its way
 * up and an app that finds nothing there renders the empty first-run state and
 * never asks again.
 *
 * `../electron/preload.ts` is the app's own preload, not a copy of it. Vite
 * resolves its `electron` import to the browser stand-in, so the object this
 * builds is the object the window gets, from the same source. Adding a call to
 * the preload adds it here for free, which is the point.
 */
import { attach } from '@openflow/desktop/reach-client.ts';
import { APPS } from '@openflow/desktop/apps.ts';
import { reachPort } from '@openflow/desktop/reach.ts';

const root = document.getElementById('root')!;

const stop = (says: string, detail: string): void => {
  root.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText =
    'font:13px/1.6 ui-monospace,Menlo,monospace;color:#b8b0a6;background:#0b0a09;padding:24px;height:100vh;white-space:pre-wrap';
  box.textContent = `${says}\n\n${detail}`;
  root.append(box);
};

// The port is computed from the registry, the same way the main process
// computes the one it listens on. Neither restates a number.
const where = `http://127.0.0.1:${reachPort(APPS.mix, {} as NodeJS.ProcessEnv)}`;

try {
  await attach(where);
} catch {
  stop(
    'No app is answering.',
    `Nothing is listening on ${where}.\n\nStart the app:\n\n    npm run dev:mix\n\nThe window opens this port whenever it is pointed at a dev server. A packaged build never does.`,
  );
  throw new Error('no app');
}

await import('../electron/preload.ts');
await import('../src/main.tsx');
