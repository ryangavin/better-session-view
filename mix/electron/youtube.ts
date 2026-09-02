import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addFiles, type Added } from './manifest.ts';

/**
 * A YouTube URL in, its best audio-only stream into the library.
 *
 * The downloader is a pinned official yt-dlp executable carried by the app. It
 * is deliberately not part of the Python separation environment: importing a
 * song should not first install nearly a gigabyte of torch. The executable is
 * fetched and checksum-verified by `tools/prepare.ts`, then signed with the app.
 *
 * yt-dlp writes into a temporary directory and `addFiles` performs the real
 * import. That keeps one owner for the library's collision rules, relative
 * paths and atomic manifest write, regardless of whether bytes began in Finder
 * or on YouTube.
 */

/** `<app>/…`, from `<app>/electron/dist/main.cjs`. */
const inside = (...parts: string[]): string => path.resolve(__dirname, '..', '..', ...parts);

/** The packaged downloader, or the PATH during a source-only test/dev run. */
export const ytDlpPath = (): string => {
  const own = inside('bin', 'yt-dlp');
  return fs.existsSync(own) ? own : 'yt-dlp';
};

/**
 * Reduce every accepted link to the one fact an import needs: its video id.
 *
 * YouTube decorates watch links with playlists, radio seeds, timestamps and
 * tracking parameters. Passing those through changes which yt-dlp extractor
 * claims the URL even with `--no-playlist`; canonicalising first makes
 * `watch?v=…&list=RD…&start_radio=1` the same request as `youtu.be/…`.
 */
export function normaliseYoutubeUrl(text: string): string | null {
  try {
    const url = new URL(text.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const youtube =
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com' ||
      host.endsWith('.youtube-nocookie.com');
    if (!youtube) return null;

    let id = url.searchParams.get('v');
    if (!id) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (host === 'youtu.be') id = parts[0] ?? null;
      else if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) id = parts[1] ?? null;
    }
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  } catch {
    return null;
  }
}

/** Only individual YouTube videos; yt-dlp is not a general network fetcher here. */
export const isYoutubeUrl = (text: string): boolean => normaliseYoutubeUrl(text) !== null;

/**
 * One deterministic run, unaffected by anything in a person's yt-dlp config.
 *
 * `bestaudio` means one audio-only format, so no merge or transcode is needed.
 * The official executable carries yt-dlp-ejs; Electron's own Node is still
 * named explicitly so YouTube's current player challenge has a runtime in an
 * app launched from Finder, where a shell PATH cannot be assumed.
 */
export const downloadArgs = (url: string, into: string, node = process.execPath): string[] => [
  '--ignore-config',
  '--no-plugin-dirs',
  '--no-remote-components',
  '--no-js-runtimes',
  '--js-runtimes',
  `node:${node}`,
  '--use-extractors',
  'youtube',
  '--no-playlist',
  '--match-filter',
  '!is_live',
  '--format',
  'bestaudio',
  '--no-progress',
  '--color',
  'never',
  '--paths',
  into,
  '--output',
  '%(title).180B [%(id)s].%(ext)s',
  '--print',
  'after_move:filepath',
  url,
];

let active: ChildProcess | null = null;
let downloading = false;

/** Stop a download when the app quits rather than orphaning a network process. */
export function stopYoutube(): void {
  if (active?.exitCode === null) active.kill('SIGTERM');
}

/** Last useful, non-ANSI line from yt-dlp's deliberately bounded output. */
export const lastYoutubeLine = (noise: string): string =>
  noise
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .pop()
    ?.replace(/^ERROR:\s*/i, '') ?? 'YouTube audio could not be fetched';

export async function downloadYoutube(
  text: string,
  into: string,
  executable = ytDlpPath(),
  node = process.execPath,
): Promise<string> {
  const url = normaliseYoutubeUrl(text);
  if (!url) throw new Error('enter a YouTube video URL');
  if (downloading) throw new Error('another YouTube import is already running');

  downloading = true;
  try {
    await fsp.mkdir(into, { recursive: true });
    return await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const done = (why?: Error) => {
        if (settled) return;
        settled = true;
        if (why) {
          reject(why);
          return;
        }
        const file = stdout.split('\n').map((line) => line.trim()).filter(Boolean).pop();
        if (!file) {
          reject(new Error('yt-dlp did not return an audio file'));
          return;
        }
        const absolute = path.resolve(file);
        const relative = path.relative(path.resolve(into), absolute);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          reject(new Error('yt-dlp returned a file outside its download folder'));
          return;
        }
        resolve(absolute);
      };

      const child = spawn(executable, downloadArgs(url, into, node), {
        stdio: ['ignore', 'pipe', 'pipe'],
        // Let yt-dlp invoke this signed Electron binary as ordinary Node for its
        // bundled JavaScript challenge solver.
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      active = child;
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = `${stdout}${chunk}`.slice(-4000);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk}`.slice(-4000);
      });
      child.on('error', (why: Error) => done(new Error(`yt-dlp could not start — ${why.message}`)));
      child.on('exit', (code, signal) => {
        if (code === 0) done();
        else if (signal) done(new Error('YouTube import was stopped'));
        else done(new Error(lastYoutubeLine(stderr) || `yt-dlp exited ${code}`));
      });
    });
  } finally {
    active = null;
    downloading = false;
  }
}

export type FetchYoutube = (url: string, into: string) => Promise<string>;

/**
 * Fetch one temporary file, then pass it through the ordinary library import.
 * The temporary bytes are removed whether downloading, copying or writing the
 * manifest succeeds or fails.
 */
export async function addYoutube(
  root: string,
  url: string,
  fetch: FetchYoutube = downloadYoutube,
): Promise<Added> {
  const canonical = normaliseYoutubeUrl(url);
  if (!canonical) throw new Error('enter a YouTube video URL');
  const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'openflow-youtube-'));
  try {
    return await addFiles(root, [await fetch(canonical, scratch)]);
  } finally {
    await fsp.rm(scratch, { recursive: true, force: true });
  }
}
