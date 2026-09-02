import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUDIO, read } from './manifest.ts';
import {
  addYoutube,
  downloadArgs,
  downloadYoutube,
  isYoutubeUrl,
  lastYoutubeLine,
  normaliseYoutubeUrl,
} from './youtube.ts';

let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'mixflow-youtube-test-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('YouTube URLs', () => {
  it('accepts ordinary, short, music and privacy-enhanced YouTube links', () => {
    expect(isYoutubeUrl('https://www.youtube.com/watch?v=abcdefghijk')).toBe(true);
    expect(isYoutubeUrl('https://youtu.be/abcdefghijk')).toBe(true);
    expect(isYoutubeUrl('https://music.youtube.com/watch?v=abcdefghijk')).toBe(true);
    expect(isYoutubeUrl('https://www.youtube-nocookie.com/embed/abcdefghijk')).toBe(true);
  });

  it('strips radio, playlist, timestamp and tracking parameters down to the video id', () => {
    expect(
      normaliseYoutubeUrl(
        'https://www.youtube.com/watch?v=4iwHb189X84&list=RD4iwHb189X84&start_radio=1&t=20',
      ),
    ).toBe('https://www.youtube.com/watch?v=4iwHb189X84');
    expect(normaliseYoutubeUrl('https://youtu.be/4iwHb189X84?si=tracking&t=20')).toBe(
      'https://www.youtube.com/watch?v=4iwHb189X84',
    );
  });

  it('does not turn yt-dlp into a general URL or local-file fetcher', () => {
    expect(isYoutubeUrl('https://example.com/youtube.com/watch?v=one')).toBe(false);
    expect(isYoutubeUrl('https://youtube.com.example.com/watch?v=one')).toBe(false);
    expect(isYoutubeUrl('file:///tmp/song.wav')).toBe(false);
    expect(isYoutubeUrl('not a url')).toBe(false);
    expect(isYoutubeUrl('https://www.youtube.com/@openflow')).toBe(false);
  });
});

describe('the yt-dlp run', () => {
  it('asks for one non-live best-audio item without user config or plugins', () => {
    const args = downloadArgs('https://www.youtube.com/watch?v=abcdefghijk', '/tmp/target', '/Applications/mix');
    expect(args).toContain('bestaudio');
    expect(args).toContain('--no-playlist');
    expect(args).not.toContain('--max-downloads');
    expect(args).toContain('!is_live');
    expect(args).toContain('--ignore-config');
    expect(args).toContain('--no-plugin-dirs');
    expect(args).toContain('node:/Applications/mix');
    expect(args.at(-1)).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  });

  it('turns yt-dlp noise into one useful line', () => {
    expect(lastYoutubeLine('warning\nERROR: Video unavailable\n')).toBe('Video unavailable');
  });

  it('returns the file yt-dlp reports after a successful download', async () => {
    const executable = path.join(root, 'fake-yt-dlp');
    await fs.writeFile(
      executable,
      [
        '#!/bin/sh',
        'while [ "$1" != "--paths" ]; do shift; done',
        'shift',
        'printf audio > "$1/Fetched.webm"',
        'printf "%s/Fetched.webm\\n" "$1"',
      ].join('\n'),
      { mode: 0o755 },
    );
    const into = path.join(root, 'download');

    const file = await downloadYoutube('https://youtu.be/abcdefghijk', into, executable, '/bin/false');

    expect(file).toBe(path.join(into, 'Fetched.webm'));
    expect(await fs.readFile(file, 'utf8')).toBe('audio');
  });

  it('reports the useful yt-dlp failure instead of only its exit code', async () => {
    const executable = path.join(root, 'failing-yt-dlp');
    await fs.writeFile(
      executable,
      '#!/bin/sh\nprintf "WARNING: detail\\nERROR: Video unavailable\\n" >&2\nexit 1\n',
      { mode: 0o755 },
    );

    await expect(
      downloadYoutube('https://youtu.be/abcdefghijk', path.join(root, 'download'), executable),
    ).rejects.toThrow('Video unavailable');
  });

  it('does not trust a downloader path outside its temporary directory', async () => {
    const executable = path.join(root, 'escaping-yt-dlp');
    await fs.writeFile(executable, '#!/bin/sh\nprintf "/tmp/elsewhere.webm\\n"\n', { mode: 0o755 });

    await expect(
      downloadYoutube('https://youtu.be/abcdefghijk', path.join(root, 'download'), executable),
    ).rejects.toThrow(/outside its download folder/);
  });
});

describe('importing fetched audio', () => {
  it('passes downloaded WebM audio through the ordinary portable import', async () => {
    let temporary = '';
    const fetch = vi.fn(async (_url: string, into: string) => {
      temporary = path.join(into, 'Night Drive [abc].webm');
      await fs.writeFile(temporary, 'audio');
      return temporary;
    });

    const done = await addYoutube(root, 'https://youtu.be/abcdefghijk', fetch);

    expect(done.added).toBe(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abcdefghijk',
      expect.any(String),
    );
    expect(done.manifest.tracks[0].file).toBe('audio/Night Drive [abc].webm');
    expect(await fs.readFile(path.join(root, AUDIO, 'Night Drive [abc].webm'), 'utf8')).toBe('audio');
    await expect(fs.access(temporary)).rejects.toThrow();
  });

  it('rejects a non-YouTube URL before calling the fetcher or touching the manifest', async () => {
    const fetch = vi.fn();
    await expect(addYoutube(root, 'https://example.com/a', fetch)).rejects.toThrow(/YouTube video URL/);
    expect(fetch).not.toHaveBeenCalled();
    expect((await read(root)).tracks).toHaveLength(0);
  });
});
