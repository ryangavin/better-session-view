import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Who a track is by, and what its cover looks like, asked of a catalogue.
 *
 * The iTunes Search API, which is chosen for two properties and no others: it
 * needs no key and no account, so a build of this app works the day it is
 * installed rather than after somebody registers it; and its coverage of
 * commercial music is the best of the free options. MusicBrainz is the open
 * alternative and was the other candidate — it needs two requests instead of
 * one and thins out badly on anything recent.
 *
 * **What leaves the machine is the guessed title, and nothing else.** No track
 * id, no file, no library path, no identifier that persists between calls.
 * `guess.ts` produces the term from the *filename*, so what is sent is a string
 * a person could have typed into a search box.
 *
 * **A lookup can never fail an import.** Every entry point here answers with
 * nothing rather than throwing: no network at a venue, a catalogue that is
 * down, a rate limit, a bounce nobody has ever released. A track with no artist
 * is an ordinary track, and refusing to import it because Apple was unreachable
 * would be the app deciding that a library is worth less than its metadata.
 */

/** Where covers live inside the library, beside `audio/` and `stems/`. */
export const ART = 'art';

/**
 * How long any one request is allowed to take.
 *
 * Short, because this runs during an import and an import is a thing a person
 * is waiting on. Four seconds is long enough for a slow connection and short
 * enough that a folder of fifty tracks cannot be held for minutes by a
 * catalogue that is simply not answering.
 */
const PATIENCE = 4000;

/**
 * How many lookups run at once.
 *
 * Enough to make importing an album quick, few enough not to read as an
 * attack. The public search endpoint is documented as rate-limited at around
 * twenty calls a minute; four in flight with a real round trip each stays
 * under that in practice, and a 403 is handled like any other failure.
 */
const AT_ONCE = 4;

/** The size iTunes hands back in a search result, and the one worth having. */
const THUMB = '100x100bb';
const FULL = '600x600bb';

/** One candidate, in this app's words rather than in the catalogue's. */
export interface Match {
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  /** Absolute, and Apple's — never written to the manifest, only fetched from. */
  artwork: string | null;
  /**
   * The thumbnail as a `data:` URI, so the window can draw a candidate list
   * without reaching a third party itself.
   *
   * Nothing else in the renderer fetches remotely, and a list of five covers
   * is not the place to start: drawing a row would become a request, five of
   * them fire from merely *looking* at the results, and the page acquires a
   * network reach it has never needed. The main process is already talking to
   * the catalogue, so it carries the pictures back with the words.
   */
  thumb: string | null;
}

interface Result {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
}

/**
 * The artwork at a size worth looking at.
 *
 * A search result names a 100px thumbnail; the same URL with the dimensions
 * swapped serves any size the release has. Undocumented and stable for well
 * over a decade — and if it ever stops being true the URL still resolves, to
 * the small one, which is a worse cover rather than a broken app.
 */
export const bigger = (url: string | undefined): string | null =>
  url ? url.replace(THUMB, FULL) : null;

/** The year alone, from whatever precision the release date came with. */
export const yearOf = (date: string | undefined): number | null => {
  const year = Number(date?.slice(0, 4));
  return Number.isInteger(year) && year > 1900 && year < 2200 ? year : null;
};

/**
 * One search result read as a candidate, or nothing.
 *
 * A result with no track name and no artist is not a match with fields
 * missing; it is a row this app cannot show, and showing it as `undefined —
 * undefined` would be worse than showing four candidates instead of five.
 */
export const matchOf = (result: Result): Match | null => {
  if (!result.trackName || !result.artistName) return null;
  return {
    title: result.trackName,
    artist: result.artistName,
    album: result.collectionName ?? null,
    year: yearOf(result.releaseDate),
    artwork: bigger(result.artworkUrl100),
    thumb: null,
  };
};

/** Lowercase, letters and digits, split — so `Hoppípolla!` and `hoppipolla` agree. */
const words = (text: string): string[] =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * How much of what came back is actually in what was asked for.
 *
 * The catalogue always answers. Search it for `bounce final FINAL` and it will
 * hand back a real song by a real artist with real cover art, and an import
 * that took that would rename somebody's rough mix after a stranger's record —
 * silently, because a filled-in row looks exactly like a correct one.
 *
 * So a match has to be *recognisable in the query*: three quarters of its
 * title's words have to be words that were searched for. That passes
 * `Radiohead Weird Fishes` → `Weird Fishes`, and passes it with the platform's
 * `(Remastered 2016)` still attached, while failing the answers a catalogue
 * invents out of one common word.
 */
export const agrees = (term: string, match: Match): boolean => {
  const asked = new Set(words(term));
  const answered = words(match.title);
  if (answered.length === 0) return false;
  const shared = answered.filter((word) => asked.has(word)).length;
  return shared / answered.length >= 0.75;
};

/** The endpoint, with the term escaped by `URL` rather than by hand. */
export const queryFor = (term: string, limit: number): string => {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', term);
  url.searchParams.set('entity', 'song');
  url.searchParams.set('media', 'music');
  url.searchParams.set('limit', String(limit));
  return url.toString();
};

/** A request that gives up rather than hanging an import on a silent socket. */
async function briefly(url: string): Promise<Response | null> {
  const stop = AbortSignal.timeout(PATIENCE);
  try {
    const answer = await fetch(url, { signal: stop, redirect: 'follow' });
    return answer.ok ? answer : null;
  } catch {
    return null;
  }
}

/**
 * Ask the catalogue, and take nothing badly.
 *
 * An empty list is the answer to every kind of failure — offline, refused,
 * rate-limited, nonsense back — because every one of them means the same thing
 * to a caller: nobody knows what this track is.
 */
export async function lookup(term: string, limit = 5): Promise<Match[]> {
  if (!term.trim()) return [];
  const answer = await briefly(queryFor(term, limit));
  if (!answer) return [];
  let found: Match[];
  try {
    const body = (await answer.json()) as { results?: Result[] };
    found = (body.results ?? []).map(matchOf).filter((match): match is Match => match !== null);
  } catch {
    return [];
  }
  return found;
}

/**
 * The same search, with each candidate's thumbnail carried back inline.
 *
 * Separate from `lookup` because the import path wants neither the pictures
 * nor the four extra round trips: it takes the top match and fetches that one
 * cover at full size. Only a person choosing between candidates needs to see
 * them.
 */
export async function lookupWithThumbs(term: string, limit = 5): Promise<Match[]> {
  const found = await lookup(term, limit);
  await inBatches(found, async (match) => {
    if (!match.artwork) return;
    // The small one: this is a 44px row, and five 600px covers is a megabyte
    // of data URI through an IPC channel to draw postage stamps.
    match.thumb = await dataUri(match.artwork.replace(FULL, THUMB));
  });
  return found;
}

/** One image fetched and inlined, or nothing. Never throws — see the file's note. */
async function dataUri(url: string): Promise<string | null> {
  const answer = await briefly(url);
  if (!answer) return null;
  try {
    const bytes = Buffer.from(await answer.arrayBuffer());
    if (bytes.length < 512) return null;
    const type = answer.headers.get('content-type') ?? 'image/jpeg';
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Fetch one cover into the library, and answer where it went.
 *
 * `art/<id>.jpg`, relative like every other path in the manifest — a library is
 * a folder you can carry to another machine, and a cover stored as an Apple URL
 * would be a library that needs the internet to draw itself. Written to a
 * neighbour and renamed, so a cancelled download leaves no half-image behind.
 */
export async function fetchArt(root: string, id: string, url: string): Promise<string | null> {
  const answer = await briefly(url);
  if (!answer) return null;
  const bytes = Buffer.from(await answer.arrayBuffer());
  // Whatever came back was not an image: an error page, or a redirect to one.
  if (bytes.length < 1024) return null;
  const dir = path.join(root, ART);
  await fs.mkdir(dir, { recursive: true });
  const relative = `${ART}/${id}.jpg`;
  const target = path.join(root, relative);
  const scratch = `${target}.writing`;
  await fs.writeFile(scratch, bytes);
  await fs.rename(scratch, target);
  return relative;
}

/**
 * Run a job over each of many things, a few at a time.
 *
 * A plain loop imports an album in a minute and `Promise.all` fires fifty
 * requests at a rate limit. This is the shape in between, and it is here rather
 * than in a dependency because it is nine lines.
 */
export async function inBatches<T>(
  items: readonly T[],
  each: (item: T) => Promise<void>,
  atOnce = AT_ONCE,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(atOnce, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) await each(items[i]);
  });
  await Promise.all(workers);
}
