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
 * **The depth is the same everywhere.** Every track under an artist sits under
 * a record, including the ones the catalogue never named: `album` is sparse
 * (import writes it null — `mix/electron/manifest.ts`) and the tracks it left
 * empty gather under one **No album** heading rather than floating at the
 * level of the records beside them. A row's indent then means one thing, and
 * a track is always two steps in, so the eye can tell a record from a song
 * without reading either.
 *
 * **A record's tracks come before the unnamed pile.** The renderer wraps each
 * artist and album in a section, bounding sticky headings by the tracks they
 * describe. The domain list remains flat for filtering and counting.
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

/** The pile at the bottom: bounces, rough mixes, anything the filename gave nothing for. */
export const NAMELESS = 'artist:';

/** What the tracks an artist has no record for are gathered under. */
export const NO_ALBUM = 'No album';

export interface Head {
  kind: 'artist' | 'album';
  /** Stable across reloads, because the collapsed set is what holds these. */
  key: string;
  name: string;
  /** Every track under it, whether or not it is collapsed. */
  count: number;
  /** A cover, relative to the library root, for the heads that carry one. */
  art: string | null;
  /** Set on the album heading that stands in for a record nobody named. */
  loose?: true;
}

export interface Line {
  kind: 'track';
  key: string;
  track: Track;
  /** 0 flat, 2 under one of an artist's records. */
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

/** One artist's heading, then each of its records, then whatever it has no record for. */
function underArtist(key: string, name: string, tracks: readonly Track[], read: Reading, collapsed: ReadonlySet<string>): Row[] {
  const head: Head = { kind: 'artist', key, name, count: tracks.length, art: null };
  if (collapsed.has(key)) return [head];

  const bunches = [...bunched(tracks, (track) => track.album)];
  const records = bunches.filter(([album]) => album !== '').sort(([, a], [, b]) => byName(a.name, b.name));
  const loose = bunches.find(([album]) => album === '');

  const rows: Row[] = [head];
  for (const [album, bunch] of loose ? [...records, loose] : records) {
    const under = `${key}/${album}`;
    rows.push({
      kind: 'album',
      key: under,
      name: album === '' ? NO_ALBUM : bunch.name,
      count: bunch.tracks.length,
      art: bunch.tracks.find((track) => track.art)?.art ?? null,
      ...(album === '' ? { loose: true as const } : {}),
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
