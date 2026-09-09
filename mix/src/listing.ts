import { credits, type Credit, type Reading } from './credits.ts';
import type { Track } from './openflow.ts';

/**
 * The library rail as a list of rows, some of which are headings.
 *
 * The rail is one narrow column that is also a drag source for the decks, and
 * both facts rule out the usual answers. A column browser — artists above,
 * tracks below — spends the scarce dimension on a list of names. A tree
 * collapsed by default puts two clicks in front of every track, which is the
 * wrong thing to do to somebody reaching for the next record mid-set. So this
 * is a flat list with headings in it, and everything below is about making the
 * headings earn their line.
 *
 * **Depth follows the data.** `album` is sparse: import writes it null
 * (`mix/electron/manifest.ts`) and only the catalogue lookup fills it in, for
 * the subset of tracks whose filename gave up an artist. A strict
 * artist → album → track tree over that is mostly a level that says *unknown*,
 * so there is no unknown-album heading at all, and an album earns a heading
 * only once `TOGETHER` of its tracks are here. A library of singles reads as a
 * flat list of artists; a ripped record reads as a record. That one rule is
 * the difference between this and the naive version, which turns five tracks
 * into five headings and five rows.
 *
 * **An artist's loose tracks come before its records.** The renderer wraps
 * each artist and album in a section, bounding sticky headings by the tracks
 * they describe. The domain list remains flat for filtering and counting.
 *
 * **An artist heading is the lead of a credit, not the whole of it.** A folder
 * of dance records credits the same person four ways — `Skrillex`,
 * `Skrillex & Rick Ross`, `Skrillex, Fred again.. & Flowdan` — and filing on
 * the whole string grows a heading for each. `credits.ts` decides where a
 * credit is filed and what is left over; the leftover rides on the row, so
 * nothing about who else played on it is lost by grouping it.
 *
 * Nothing here knows about React. Build the complete listing before search,
 * then use `matchingRows` to retain the headings of matching tracks.
 */

/** How the rail is ordered. Only `artist` has headings; the other two are lists. */
export type Order = 'artist' | 'added' | 'title';

export const ORDERS: readonly { id: Order; label: string }[] = [
  { id: 'artist', label: 'Artist' },
  { id: 'added', label: 'Added' },
  { id: 'title', label: 'Title' },
];

/** How many tracks an album needs here before it is worth a line of its own. */
const TOGETHER = 2;

/** The pile at the bottom: bounces, rough mixes, anything the filename gave nothing for. */
export const NAMELESS = 'artist:';

export interface Head {
  kind: 'artist' | 'album';
  /** Stable across reloads, because the collapsed set is what holds these. */
  key: string;
  name: string;
  /** Every track under it, whether or not it is collapsed. */
  count: number;
  /** A cover, relative to the library root, for the heads that carry one. */
  art: string | null;
}

export interface Line {
  kind: 'track';
  key: string;
  track: Track;
  /** 0 flat, 1 under an artist, 2 under one of its albums. */
  depth: number;
  /** How this track's credit reads, or null where nobody has said who it is by. */
  credit: Credit | null;
}

export type Row = Head | Line;

/** `The Chemical Brothers` files under C, and `Track 2` sorts after `Track 10` does not. */
const sortName = (name: string): string => name.replace(/^the\s+/i, '');
const byName = (a: string, b: string): number =>
  sortName(a).localeCompare(sortName(b), undefined, { sensitivity: 'base', numeric: true });
const byTitle = (a: Track, b: Track): number => byName(a.title, b.title);

/** Newest first. The manifest appends, so its own order buries what you just imported. */
const byAdded = (a: Track, b: Track): number => (b.added ?? '').localeCompare(a.added ?? '') || byTitle(a, b);

const lines = (tracks: readonly Track[], read: Reading, depth = 0): Line[] =>
  tracks.map((track) => ({ kind: 'track', key: track.id, track, depth, credit: read(track.artist) }));

/**
 * Bunch by a name that may be missing or spelled two ways.
 *
 * Keyed lowercase so `Aphex Twin` and `aphex twin` are one artist, displayed
 * as whichever spelling arrived first — a library should not split a bunch
 * over a shift key.
 */
function bunched(tracks: readonly Track[], of: (track: Track) => string | null) {
  const bunches = new Map<string, { name: string; tracks: Track[] }>();
  for (const track of tracks) {
    const name = of(track)?.trim() ?? '';
    const key = name.toLowerCase();
    const bunch = bunches.get(key) ?? { name, tracks: [] };
    bunch.tracks.push(track);
    bunches.set(key, bunch);
  }
  return bunches;
}

/** One artist's heading and everything under it: the loose tracks, then the records. */
function underArtist(key: string, name: string, tracks: readonly Track[], read: Reading, collapsed: ReadonlySet<string>): Row[] {
  const head: Head = { kind: 'artist', key, name, count: tracks.length, art: null };
  if (collapsed.has(key)) return [head];

  const records = [...bunched(tracks, (track) => track.album)]
    .filter(([album, bunch]) => album !== '' && bunch.tracks.length >= TOGETHER)
    .sort(([, a], [, b]) => byName(a.name, b.name));
  const held = new Set(records.flatMap(([, bunch]) => bunch.tracks.map((track) => track.id)));

  const rows: Row[] = [head, ...lines(tracks.filter((track) => !held.has(track.id)).sort(byTitle), read, 1)];
  for (const [album, bunch] of records) {
    const under = `${key}/${album}`;
    rows.push({
      kind: 'album',
      key: under,
      name: bunch.name,
      count: bunch.tracks.length,
      art: bunch.tracks.find((track) => track.art)?.art ?? null,
    });
    if (!collapsed.has(under)) rows.push(...lines([...bunch.tracks].sort(byTitle), read, 2));
  }
  return rows;
}

/**
 * The rows the rail draws, in the order it draws them.
 *
 * `collapsed` holds the keys of headings that are shut; a shut heading keeps
 * its count and drops its rows. Pass an empty set while the filter is on —
 * a search that finds a track inside a shut record has found nothing.
 *
 * **`read` is built from the whole library, not from `tracks`.** It is a
 * parameter for exactly that reason: `credits.ts` decides where a credit files
 * by asking whether the *folder* holds that name on its own, and the rows here
 * are only what survived the filter. Read from the survivors, filtering to
 * `rick ross` would leave one track, take Skrillex out of evidence, and flip
 * the heading above it from `Skrillex` to `Skrillex & Rick Ross` as you typed.
 * The default is there for callers with nothing filtered — the tests, mostly.
 */
export function listing(
  tracks: readonly Track[],
  order: Order,
  collapsed: ReadonlySet<string> = new Set(),
  read: Reading = credits(tracks.map((track) => track.artist)),
): Row[] {
  if (order === 'added') return lines([...tracks].sort(byAdded), read);
  if (order === 'title') return lines([...tracks].sort(byTitle), read);

  const artists = bunched(tracks, (track) => read(track.artist)?.lead ?? null);
  const nameless = artists.get('');
  artists.delete('');
  const rows = [...artists]
    .sort(([, a], [, b]) => byName(a.name, b.name))
    .flatMap(([artist, bunch]) => underArtist(`artist:${artist}`, bunch.name, bunch.tracks, read, collapsed));
  return nameless ? [...rows, ...underArtist(NAMELESS, 'No artist', nameless.tracks, read, collapsed)] : rows;
}

/** Every heading in a listing, for the collapse-all that alt-click asks for. */
export const heads = (rows: readonly Row[]): string[] =>
  rows.filter((row): row is Head => row.kind !== 'track').map((row) => row.key);

/** All words must occur, in any order, across title, full credit and album. */
export function searchTracks(tracks: Track[], query: string): Track[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return tracks;
  return tracks.filter((track) => {
    const text = [track.title, track.artist, track.album].join(' ').toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Filter an expanded listing so album identity survives even a single match. */
export function matchingRows(rows: readonly Row[], ids: ReadonlySet<string>): Row[] {
  const kept: Row[] = [];
  let artistCount = 0, albumCount = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind === 'track') {
      if (!ids.has(row.track.id)) continue;
      kept.push(row);
      artistCount++;
      albumCount++;
    } else if (row.kind === 'album') {
      if (albumCount) kept.push({ ...row, count: albumCount });
      albumCount = 0;
    } else {
      if (artistCount) kept.push({ ...row, count: artistCount });
      artistCount = albumCount = 0;
    }
  }
  return kept.reverse();
}
