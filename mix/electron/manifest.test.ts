import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AUDIO, MANIFEST, addFiles, editTrack, empty, read, recordStems, tidy, write } from './manifest.ts';

/**
 * This is the file that owns a person's library, so it is the one that gets
 * tests. Everything here is a way a library could be quietly damaged — an index
 * that disagrees with the audio beside it, a manifest replaced because it did
 * not parse, an import that overwrote the track you already had.
 *
 * It runs against a real temporary directory rather than a mocked `fs`: the
 * behaviour under test is `rename` being atomic and `copyFile` refusing to
 * clobber, and a mock would be asserting that I remember what those do.
 */

let root = '';
let source = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'mixflow-lib-'));
  source = await fs.mkdtemp(path.join(os.tmpdir(), 'mixflow-src-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(source, { recursive: true, force: true });
});

/** A file with the right extension and some bytes in it. */
const drop = async (name: string, body = 'RIFF'): Promise<string> => {
  const at = path.join(source, name);
  await fs.writeFile(at, body);
  return at;
};

const exists = async (at: string): Promise<boolean> =>
  fs
    .access(at)
    .then(() => true)
    .catch(() => false);

describe('reading', () => {
  it('treats a folder with no manifest as a new library, not a broken one', async () => {
    expect(await read(root)).toEqual(empty());
  });

  it('refuses a manifest that is not ours rather than replacing it', async () => {
    await fs.writeFile(path.join(root, MANIFEST), JSON.stringify({ tracks: [] }));
    await expect(read(root)).rejects.toThrow(/not a mix\[flow\] library/);
  });

  it('refuses a manifest with no track list', async () => {
    await fs.writeFile(
      path.join(root, MANIFEST),
      JSON.stringify({ openflow: 'mix-library', version: 1 }),
    );
    await expect(read(root)).rejects.toThrow(/no track list/);
  });

  it('fills in fields a version that wrote the file did not have', async () => {
    // A field added later reads as `undefined`, and a `Track` that claims
    // `art: string | null` while holding `undefined` is a type that lies —
    // every reader would then need to know which version wrote the file.
    await fs.writeFile(
      path.join(root, MANIFEST),
      JSON.stringify({
        openflow: 'mix-library',
        version: 1,
        tracks: [{ id: 'one', file: 'audio/a.wav', title: 'A' }],
      }),
    );
    const [track] = (await read(root)).tracks;
    expect(track.stems).toBe(null);
    expect(track.album).toBe(null);
    expect(track.art).toBe(null);
  });

  it('refuses a manifest that is not JSON at all', async () => {
    await fs.writeFile(path.join(root, MANIFEST), 'not json');
    await expect(read(root)).rejects.toThrow();
  });
});

describe('writing', () => {
  it('round-trips what it was given', async () => {
    const manifest = empty();
    manifest.tracks.push({
      id: 'one',
      file: 'audio/a.wav',
      title: 'A',
      artist: null,
      album: null,
      art: null,
      bpm: null,
      key: null,
      seconds: null,
      added: '2026-09-01T00:00:00.000Z',
      model: null,
      sources: [],
      stems: null,
    });
    await write(root, manifest);
    expect(await read(root)).toEqual(manifest);
  });

  it('leaves no scratch file behind', async () => {
    await write(root, empty());
    expect(await exists(`${path.join(root, MANIFEST)}.writing`)).toBe(false);
  });
});

describe('importing', () => {
  it('copies the file in and records it relative to the root', async () => {
    const done = await addFiles(root, [await drop('Nightcrawler.wav')]);
    expect(done.added).toBe(1);
    expect(done.manifest.tracks[0].file).toBe('audio/Nightcrawler.wav');
    expect(await exists(path.join(root, AUDIO, 'Nightcrawler.wav'))).toBe(true);
  });

  it('reads the filename as an artist and a title', async () => {
    // The only metadata an import ever brings. `guess.ts` owns the reading;
    // what is pinned here is that the reading is actually applied.
    const done = await addFiles(root, [await drop('Radiohead - Weird Fishes.wav')]);
    expect(done.manifest.tracks[0].title).toBe('Weird Fishes');
    expect(done.manifest.tracks[0].artist).toBe('Radiohead');
  });

  it('hands back the tracks it made, for whatever runs next', async () => {
    const done = await addFiles(root, [await drop('a.wav'), await drop('notes.pdf'), await drop('b.mp3')]);
    expect(done.ids).toHaveLength(2);
    expect(done.manifest.tracks.map((t) => t.id)).toEqual(expect.arrayContaining(done.ids));
  });

  it('never records an absolute path, which is the whole portability claim', async () => {
    const done = await addFiles(root, [await drop('a.wav'), await drop('b.flac')]);
    for (const track of done.manifest.tracks) {
      expect(path.isAbsolute(track.file)).toBe(false);
      expect(track.file.startsWith('..')).toBe(false);
      expect(track.file).toContain('/');
      expect(track.file).not.toContain('\\');
    }
  });

  it('leaves the original where it was', async () => {
    const at = await drop('a.wav');
    await addFiles(root, [at]);
    expect(await exists(at)).toBe(true);
  });

  it('refuses one file without refusing the batch', async () => {
    const done = await addFiles(root, [
      await drop('notes.pdf'),
      await drop('a.wav'),
      await drop('.DS_Store'),
      await drop('b.mp3'),
    ]);
    expect(done.added).toBe(2);
    expect(done.refused).toHaveLength(2);
    expect(done.refused.join(' ')).toContain('not an audio file');
  });

  it('never overwrites a track already in the folder', async () => {
    await addFiles(root, [await drop('a.wav', 'first')]);
    await fs.writeFile(path.join(source, 'a.wav'), 'second');
    const done = await addFiles(root, [path.join(source, 'a.wav')]);

    expect(done.manifest.tracks.map((t) => t.file)).toEqual(['audio/a.wav', 'audio/a-2.wav']);
    expect(await fs.readFile(path.join(root, AUDIO, 'a.wav'), 'utf8')).toBe('first');
    expect(await fs.readFile(path.join(root, AUDIO, 'a-2.wav'), 'utf8')).toBe('second');
  });

  it('appends rather than replacing on a second import', async () => {
    await addFiles(root, [await drop('a.wav')]);
    const done = await addFiles(root, [await drop('b.wav')]);
    expect(done.manifest.tracks).toHaveLength(2);
    expect((await read(root)).tracks).toHaveLength(2);
  });

  it('does not write a manifest when nothing was added', async () => {
    const done = await addFiles(root, [await drop('notes.pdf')]);
    expect(done.added).toBe(0);
    expect(await exists(path.join(root, MANIFEST))).toBe(false);
  });

  it('gives a track a title it can show before anything has read its tags', async () => {
    const done = await addFiles(root, [await drop('Copper Wire.flac')]);
    expect(done.manifest.tracks[0].title).toBe('Copper Wire');
    expect(done.manifest.tracks[0].bpm).toBeNull();
    expect(done.manifest.tracks[0].artist).toBeNull();
  });

  it('takes the extension however it was cased', async () => {
    const done = await addFiles(root, [await drop('Loud.WAV')]);
    expect(done.added).toBe(1);
  });
});

describe('tidy', () => {
  it('keeps a name a person would recognise', () => {
    expect(tidy('Two Doors Down')).toBe('Two Doors Down');
  });

  it('takes out what a filesystem would refuse', () => {
    expect(tidy('AC/DC: back*slash?')).toBe('AC-DC- back-slash-');
  });

  it('will not produce a dotfile or an empty name', () => {
    expect(tidy('...')).toBe('track');
    expect(tidy('   ')).toBe('track');
    expect(tidy('.hidden')).toBe('hidden');
  });
});

describe('recording a separation', () => {
  /** One imported track, which is what a separation is always run against. */
  const imported = async (): Promise<string> => {
    await addFiles(root, [await drop('song.wav')]);
    return (await read(root)).tracks[0].id;
  };

  it('records where the stems are and what made them, together', async () => {
    const id = await imported();
    await recordStems(root, id, {
      model: 'htdemucs_ft',
      sources: ['drums', 'bass', 'other', 'vocals'],
      stems: `stems/${id}/htdemucs_ft`,
    });
    const track = (await read(root)).tracks[0];
    expect(track.model).toBe('htdemucs_ft');
    expect(track.stems).toBe(`stems/${id}/htdemucs_ft`);
    expect(track.sources).toEqual(['drums', 'bass', 'other', 'vocals']);
  });

  it('keeps the stem path relative, because a library travels', async () => {
    const id = await imported();
    await recordStems(root, id, { model: 'htdemucs', sources: ['vocals'], stems: `stems/${id}/htdemucs` });
    const track = (await read(root)).tracks[0];
    expect(path.isAbsolute(track.stems!)).toBe(false);
    expect(track.stems).not.toContain('..');
    expect(track.stems).not.toContain('\\');
  });

  it('fills in the length the separator measured, since nothing else had', async () => {
    const id = await imported();
    expect((await read(root)).tracks[0].seconds).toBeNull();
    await recordStems(root, id, {
      model: 'htdemucs',
      sources: ['vocals'],
      stems: 's',
      seconds: 240.43,
    });
    expect((await read(root)).tracks[0].seconds).toBe(240);
  });

  it('does not overwrite a length something else already established', async () => {
    const id = await imported();
    const manifest = await read(root);
    manifest.tracks[0].seconds = 187;
    await write(root, manifest);
    await recordStems(root, id, { model: 'htdemucs', sources: [], stems: 's', seconds: 240.43 });
    expect((await read(root)).tracks[0].seconds).toBe(187);
  });

  it('leaves the other tracks alone', async () => {
    await addFiles(root, [await drop('one.wav'), await drop('two.wav')]);
    const [first, second] = (await read(root)).tracks;
    await recordStems(root, first.id, { model: 'htdemucs', sources: ['vocals'], stems: 's' });
    expect((await read(root)).tracks[1]).toEqual(second);
  });

  it('writes nothing for a track somebody deleted while it was separating', async () => {
    await imported();
    const before = await read(root);
    await recordStems(root, 'a-track-that-is-gone', {
      model: 'htdemucs',
      sources: ['vocals'],
      stems: 's',
    });
    expect(await read(root)).toEqual(before);
  });

  it('replaces the previous separation rather than accumulating them', async () => {
    const id = await imported();
    await recordStems(root, id, { model: 'htdemucs', sources: ['vocals', 'other'], stems: 'a' });
    await recordStems(root, id, { model: 'htdemucs_6s', sources: ['piano'], stems: 'b' });
    const tracks = (await read(root)).tracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0].model).toBe('htdemucs_6s');
    expect(tracks[0].stems).toBe('b');
  });
});

describe('correcting a track', () => {
  const oneTrack = async (): Promise<string> => {
    const done = await addFiles(root, [await drop('a.wav')]);
    return done.manifest.tracks[0].id;
  };

  it('writes the fields a person may correct', async () => {
    const id = await oneTrack();
    await editTrack(root, id, { title: 'Xtal', artist: 'Aphex Twin', album: 'Selected Ambient Works' });
    const [track] = (await read(root)).tracks;
    expect(track.title).toBe('Xtal');
    expect(track.artist).toBe('Aphex Twin');
    expect(track.album).toBe('Selected Ambient Works');
  });

  it('leaves the facts about the disk alone', async () => {
    // The reason `Edits` is its own type rather than a `Partial<Track>`: these
    // three are written by whatever put the files there, and a window that
    // could rewrite them could point a track at somebody else's stems.
    const id = await oneTrack();
    await recordStems(root, id, { model: 'htdemucs', sources: ['bass'], stems: 'stems/x/htdemucs' });
    await editTrack(root, id, { title: 'Xtal' } as never);
    const [track] = (await read(root)).tracks;
    expect(track.file).toBe('audio/a.wav');
    expect(track.model).toBe('htdemucs');
    expect(track.stems).toBe('stems/x/htdemucs');
  });

  it('refuses to leave a track with no name', async () => {
    const id = await oneTrack();
    await editTrack(root, id, { title: '   ' });
    expect((await read(root)).tracks[0].title).toBe('a');
  });

  it('clears an artist rather than storing an empty one', async () => {
    const id = await oneTrack();
    await editTrack(root, id, { artist: 'Aphex Twin' });
    await editTrack(root, id, { artist: '  ' });
    expect((await read(root)).tracks[0].artist).toBe(null);
  });

  it('says nothing about a track that is not there', async () => {
    // Edited from a window while the row was deleted somewhere else. Writing a
    // row back for a track somebody removed would be worse than doing nothing.
    await oneTrack();
    const before = await read(root);
    expect(await editTrack(root, 'gone', { title: 'X' })).toEqual(before);
  });
});
