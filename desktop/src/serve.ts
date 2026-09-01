import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { App } from './apps.ts';

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
};

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

/** Then, once ready, the handler itself. `dist` is the directory it answers for. */
export function serve(one: App, dist: string): void {
  protocol.handle(one.name, async (request) => {
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('bad request', { status: 400 });
    }
    if (rel === '/') rel = '/index.html';
    const file = path.join(dist, path.normalize(rel));
    // A scheme handler is a file server, and a file server answers for its root
    // and nothing above it.
    if (file !== dist && !file.startsWith(dist + path.sep)) {
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
