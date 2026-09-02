import { describe, expect, it } from 'vitest';
import { agrees, bigger, inBatches, matchOf, queryFor, yearOf } from './art.ts';

/**
 * What this protects is an import that finishes.
 *
 * The failures worth pinning are the quiet ones: a term that reaches the
 * catalogue mangled, a candidate list with holes in it that the window then
 * draws as `undefined`, and a batch runner that either serialises fifty
 * requests or fires all fifty at a rate limit. The network itself is not
 * tested here — `lookup` and `fetchArt` answer with nothing for every kind of
 * failure, which is the contract the callers are written against.
 */

describe('the query', () => {
  it('escapes the term rather than pasting it into a URL', () => {
    const url = new URL(queryFor('Sigur Rós — Hoppípolla & co', 5));
    expect(url.origin + url.pathname).toBe('https://itunes.apple.com/search');
    expect(url.searchParams.get('term')).toBe('Sigur Rós — Hoppípolla & co');
    expect(url.searchParams.get('entity')).toBe('song');
    expect(url.searchParams.get('limit')).toBe('5');
  });
});

describe('reading a result', () => {
  it('asks for the cover at a size worth looking at', () => {
    expect(bigger('https://is1.mzstatic.com/image/thumb/x.jpg/100x100bb.jpg')).toBe(
      'https://is1.mzstatic.com/image/thumb/x.jpg/600x600bb.jpg',
    );
    expect(bigger(undefined)).toBe(null);
  });

  it('takes the year and refuses nonsense', () => {
    expect(yearOf('1997-05-21T07:00:00Z')).toBe(1997);
    expect(yearOf(undefined)).toBe(null);
    expect(yearOf('')).toBe(null);
    expect(yearOf('nope')).toBe(null);
  });

  it('drops a result it could not show', () => {
    // A row with no name and no artist is not a match with fields missing —
    // it is `undefined — undefined` in the window.
    expect(matchOf({ artistName: 'Radiohead' })).toBe(null);
    expect(matchOf({ trackName: 'Weird Fishes' })).toBe(null);
  });

  it('keeps a result whose album and cover are missing', () => {
    // The two facts that matter are there. A single without a collection is an
    // ordinary release, not a broken result.
    expect(matchOf({ trackName: 'Weird Fishes', artistName: 'Radiohead' })).toEqual({
      title: 'Weird Fishes',
      artist: 'Radiohead',
      album: null,
      year: null,
      artwork: null,
      thumb: null,
    });
  });
});

describe('whether an answer belongs to the question', () => {
  const found = (title: string) => ({ title, artist: 'x', album: null, year: null, artwork: null, thumb: null });

  it('accepts the track that was asked for', () => {
    expect(agrees('Radiohead Weird Fishes', found('Weird Fishes'))).toBe(true);
  });

  it('accepts it with the platform decoration still attached', () => {
    // A catalogue answers `Weird Fishes/Arpeggi (Remastered)` to a plain query
    // and that is the right record — three quarters is what lets it through.
    expect(agrees('Radiohead Weird Fishes Arpeggi', found('Weird Fishes / Arpeggi'))).toBe(true);
  });

  it('ignores accents and punctuation on both sides', () => {
    expect(agrees('Sigur Ros Hoppipolla', found('Hoppípolla'))).toBe(true);
  });

  it('refuses the record a catalogue invented out of one common word', () => {
    // The failure this exists for: a rough mix called `bounce final FINAL` gets
    // a real song with real art, and a filled-in row looks exactly like a
    // correct one.
    expect(agrees('bounce final FINAL', found('Bounce Back'))).toBe(false);
    expect(agrees('mixdown v3 master', found('Master of Puppets'))).toBe(false);
  });

  it('refuses a result with no title left after normalising', () => {
    expect(agrees('anything', found('!!!'))).toBe(false);
  });
});

describe('running a batch', () => {
  it('does every item exactly once', async () => {
    const items = Array.from({ length: 23 }, (_unused, i) => i);
    const done: number[] = [];
    await inBatches(items, async (i) => {
      done.push(i);
    });
    expect(done.sort((a, b) => a - b)).toEqual(items);
  });

  it('never has more than the limit in flight', async () => {
    let live = 0;
    let most = 0;
    await inBatches(
      Array.from({ length: 20 }, (_unused, i) => i),
      async () => {
        live += 1;
        most = Math.max(most, live);
        await new Promise((wake) => setTimeout(wake, 1));
        live -= 1;
      },
      4,
    );
    expect(most).toBe(4);
  });

  it('starts nothing when there is nothing to do', async () => {
    let ran = 0;
    await inBatches([], async () => {
      ran += 1;
    });
    expect(ran).toBe(0);
  });
});
