/**
 * What a file is, by extension, for whoever is serving it.
 *
 * Its own module for the same reason `within.ts` is: `serve.ts` imports
 * `electron`, so anything that reaches for one of its constants drags a main
 * process along. `reach.ts` serves the same mounts to a browser tab and is read
 * by a vite config under plain Node, where that import is a hard error.
 *
 * The audio list is the interesting half. A library holds what a person
 * imported, and a stem is written as wav — guess wrong and the tag fails to
 * play with nothing said about why.
 */
export const TYPES: Record<string, string> = {
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

