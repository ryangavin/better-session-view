import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { App } from './apps.ts';
import { within } from './within.ts';

/**
 * An app's own build, served over a scheme of its own rather than `file://`.
 *
 * It buys two separate things, and an app that skips it loses both.
 *
 * A built page asks for `/assets/…` and whatever else sits in `public/` —
 * root-absolute, because a server was serving them. Under `file://` those
 * resolve to the filesystem root and 404; under a scheme with `standard: true`
 * they resolve against the origin and work untouched, so the renderer needs no
 * `base` and dev and desktop stay one build.
 *
 * And it is a **stable origin**, which is what `localStorage` is keyed by.
 * Everything an app remembers about how it looked lives there, so `set://app`
 * surviving a rebuild is the difference between settings that persist and
 * settings that evaporate. `file://` is an opaque origin and promises nothing.
 *
 * An app whose own server is already answering on a port — visual[flow] — needs
 * none of this: it has a real origin already.
 *
 * It can also answer for directories that are **not** the build, which is how a
 * renderer reaches a file a person owns. mix[flow] plays the stems it wrote, and
 * they live in a library folder somewhere on the disk: passing them through IPC
 * would be several hundred megabytes copied for every track, and `file://` is a
 * different origin the page cannot fetch from. A mount is neither — the same
 * origin the page is already on, streamed by the same handler.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
};

/**
 * Extra directories this scheme answers for, by URL prefix.
 *
 * A function rather than a path because the directory is not known when the
 * handler is registered and can change while the app runs — mix[flow]'s library
 * is a folder the person picks, and picks again. Returning null is "there isn't
 * one", which answers 404 rather than throwing.
 */
export type Mounts = Record<string, () => string | null | Promise<string | null>>;

/**
 * Declared before `app.whenReady()`, which Electron requires and does not
 * forgive: registering late fails silently and the window loads nothing.
 */
export function scheme(one: App): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: one.name,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
}

const send = async (file: string, cors: boolean): Promise<Response> => {
  try {
    const body = await fs.promises.readFile(file);
    const headers: Record<string, string> = {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    };
    // Only mounts, and only because of the dev loop: a `vite` session puts the
    // page on `http://localhost` while this handler still owns the files, so
    // the fetch is cross-origin. The build itself is always same-origin and has
    // no business advertising otherwise.
    if (cors) headers['access-control-allow-origin'] = '*';
    return new Response(body, { headers });
  } catch {
    return new Response('not found', { status: 404 });
  }
};

/**
 * Then, once ready, the handler itself.
 *
 * `dist` is the build it answers for. `mounts` are directories outside it, by
 * URL prefix — checked first, so a mount cannot be shadowed by a file that
 * happens to share its name in the build.
 */
export function serve(one: App, dist: string, mounts: Mounts = {}): void {
  protocol.handle(one.name, async (request) => {
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('bad request', { status: 400 });
    }

    for (const [prefix, where] of Object.entries(mounts)) {
      if (!rel.startsWith(prefix)) continue;
      const root = await where();
      if (!root) return new Response('not found', { status: 404 });
      const file = within(root, rel.slice(prefix.length));
      return file ? send(file, true) : new Response('forbidden', { status: 403 });
    }

    if (rel === '/') rel = '/index.html';
    // A scheme handler is a file server, and a file server answers for its root
    // and nothing above it.
    const file = within(dist, rel);
    return file ? send(file, false) : new Response('forbidden', { status: 403 });
  });
}
