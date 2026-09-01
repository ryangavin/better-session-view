import { shell, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

/**
 * What a window is allowed to become, and it is two questions rather than one.
 *
 * **Where it may go.** A single-page app never navigates. Anything that tries is
 * a mis-click or a dragged link, and letting it replace the window is how the
 * app disappears — so anything that is not this app opens in a browser instead.
 *
 * **What `window.open` means.** Electron refuses it outright unless something
 * says what to do with it, so without a handler the one external link in an app
 * is a dead click. The default is to hand it to the browser; an app that opens
 * real second windows of its own — a wall on a projector — answers `popup` and
 * gets those placed instead.
 */
export interface Policy {
  /** Where the window opens, and the only address it is allowed to stay on. */
  home: string;
  /** The dev server's address, or `''`. */
  dev: string;
  /** This app's own second windows, given the features string `window.open` carried. */
  popup?: (features: string) => BrowserWindowConstructorOptions | null;
}

/**
 * Whether a URL is still this app.
 *
 * Two cases that cannot share one comparison: under a scheme it is the scheme,
 * and in dev it is the dev server's origin — `set://app` has no origin to
 * compare against, because a non-special scheme reports `null` for it.
 */
export const ours = (url: string, { home, dev }: Policy): boolean => {
  const here = new URL(dev || home);
  const there = new URL(url);
  return here.protocol === 'http:' || here.protocol === 'https:'
    ? there.origin === here.origin
    : there.protocol === here.protocol;
};

export function govern(win: BrowserWindow, policy: Policy): void {
  win.webContents.setWindowOpenHandler(({ url, features }) => {
    const mine = policy.popup?.(features);
    if (mine) return { action: 'allow', overrideBrowserWindowOptions: mine };
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (ours(url, policy)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
}
