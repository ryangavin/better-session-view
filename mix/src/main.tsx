import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import { MixTheme } from './Theme.tsx';
import { App } from './App.tsx';

/**
 * The window's API, when there is no window.
 *
 * In the app this is already done: Electron runs `electron/preload.ts` before
 * anything here, and the renderer finds `window.openflow` waiting. A browser
 * tab has no preload, and an app that finds nothing there draws the empty
 * first-run state and never asks again — so the bridge is built here instead,
 * against the loopback port the main process opens whenever it is pointed at a
 * dev server (`desktop/src/reach.ts`).
 *
 * The order is the whole thing. The socket has to be open before the preload
 * runs, because the preload's first act is to describe an API that talks over
 * it; the preload has to have run before `App` is imported for its side of
 * that reason. This is the app's own preload, not a copy — while serving, vite
 * resolves its `electron` import to the browser stand-in, so adding a call to
 * the bridge adds it to the tab for free.
 *
 * `import.meta.env.DEV` is substituted for a literal, so a build drops this
 * whole branch and the imports inside it with it. Nothing in `src/` reaches
 * for electron in anger.
 */
async function bridged(root: HTMLElement): Promise<boolean> {
  if (!import.meta.env.DEV) return true;
  if ((globalThis as { openflow?: unknown }).openflow) return true;
  const [{ attach }, { APPS }, { reachPort }] = await Promise.all([
    import('@openflow/desktop/reach-client.ts'),
    import('@openflow/desktop/apps.ts'),
    import('@openflow/desktop/reach.ts'),
  ]);
  const where = `http://127.0.0.1:${reachPort(APPS.mix, {} as NodeJS.ProcessEnv)}`;
  try {
    await attach(where);
  } catch {
    // Said, rather than drawn as the empty first-run state, which is what a
    // tab used to show and is indistinguishable from an empty library.
    const box = document.createElement('div');
    box.style.cssText =
      'font:13px/1.6 ui-monospace,Menlo,monospace;color:#b8b0a6;background:#0b0a09;padding:24px;height:100vh;white-space:pre-wrap';
    box.textContent = `No app is answering.\n\nNothing is listening on ${where}.\n\nStart the app:\n\n    npm run dev:mix\n\nThe window opens this port whenever it is pointed at a dev server. A packaged build never does.`;
    root.append(box);
    return false;
  }
  await import('../electron/preload.ts');
  return true;
}

const root = document.getElementById('root')!;

if (await bridged(root)) {
  createRoot(root).render(
    <StrictMode>
      <MixTheme><App /></MixTheme>
    </StrictMode>,
  );
}
