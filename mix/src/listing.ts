import { keyFilters, keyLabel } from './key.ts';
import type { GridNote, Track } from './openflow.ts';

/** A flat table: sort the stored fields without inventing artist or album groups. */
export type Order = 'artist' | 'album' | 'added' | 'title' | 'bpm' | 'key';
export interface Sort { order: Order; descending: boolean }

export type Column = Exclude<Order, 'added'> | 'analysis' | 'stems';
export const COLUMN_LABELS: Record<Column, string> = { artist: 'Artist', album: 'Album', title: 'Song', bpm: 'BPM', key: 'Key', analysis: 'Analysis', stems: 'Stems' };
export const DEFAULT_COLUMNS: readonly Column[] = ['artist', 'album', 'title', 'bpm', 'key', 'analysis', 'stems'];

/** Old or malformed preferences must never hide a field or duplicate a column. */
export function columnsFrom(saved: unknown): Column[] {
  const valid = Array.isArray(saved)
    ? [...new Set(saved.filter((column): column is Column => DEFAULT_COLUMNS.includes(column)))]
    : [];
  // Keep valid positions even when old/new builds disagree about available fields.
  const next: Column[] = [...valid, ...DEFAULT_COLUMNS.filter(column => !valid.includes(column) && column !== 'stems' && column !== 'key')];
  if (!next.includes('key')) next.splice(next.indexOf('bpm') + 1, 0, 'key');
  if (!next.includes('stems')) next.splice(next.indexOf('analysis') + 1, 0, 'stems');
  return next;
}

export function moveColumn(columns: readonly Column[], column: Column, step: -1 | 1): Column[] {
  const next = [...columns], from = next.indexOf(column), to = from + step;
  if (from < 0 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Drop into the target heading's position, preserving every other column's relative order. */
export function placeColumn(columns: readonly Column[], column: Column, target: Column): Column[] {
  const from = columns.indexOf(column), to = columns.indexOf(target);
  const next = [...columns];
  if (from < 0 || to < 0 || from === to) return next;
  next.splice(from, 1);
  next.splice(to, 0, column);
  return next;
}

/** A new column starts alphabetically; Added starts newest first. */
export function nextSort(current: Sort, order: Order): Sort {
  return { order, descending: current.order === order ? !current.descending : order === 'added' };
}

/** Ignore a leading article and compare numbers naturally. Missing metadata stays last. */
const byName = (a: string | null, b: string | null): number => {
  const left = a?.trim() ?? '', right = b?.trim() ?? '';
  if (!left || !right) return Number(!left) - Number(!right);
  return left.replace(/^the\s+/i, '').localeCompare(right.replace(/^the\s+/i, ''), undefined,
    { sensitivity: 'base', numeric: true });
};

/** Artist → Album → Song; Album → Artist → Song. Full credits remain intact. */
export function listing(tracks: readonly Track[], order: Order, descending = order === 'added', notes: Record<string, GridNote> | null = null): Track[] {
  const fields: Record<Order, readonly ('artist' | 'album' | 'title' | 'added')[]> = {
    artist: ['artist', 'album', 'title'], album: ['album', 'artist', 'title'],
    bpm: ['title', 'artist', 'album'], key: ['title', 'artist', 'album'], title: ['title', 'artist', 'album'], added: ['added', 'title', 'artist'],
  };
  return [...tracks].sort((a, b) => {
    if (order === 'key') {
      const left = keyLabel(a), right = keyLabel(b);
      const missing = Number(left === 'Unknown') - Number(right === 'Unknown');
      if (missing) return missing;
      const comparison = byName(left, right);
      if (comparison) return comparison * (descending ? -1 : 1);
    }
    if (order === 'bpm') {
      const left = notes?.[a.id]?.bpm, right = notes?.[b.id]?.bpm;
      if (left == null || right == null) {
        const missing = Number(left == null) - Number(right == null);
        if (missing) return missing;
      } else if (left !== right) return (left - right) * (descending ? -1 : 1);
    }
    for (const field of fields[order]) {
      const left = a[field], right = b[field];
      const comparison = byName(left, right);
      // Reverse the chosen column, retaining useful ascending secondary order and blanks last.
      if (comparison) return field === order && descending && left?.trim() && right?.trim()
        ? -comparison : comparison;
    }
    return a.id.localeCompare(b.id);
  });
}

/** All words must occur, in any order, across title, full credit and album. */
export function searchTracks(tracks: Track[], query: string): Track[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return tracks;
  return tracks.filter((track) => {
    const text = [track.title, track.artist, track.album].join(' ').toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export interface Browse { artist: string | null; album: string | null; key?: string | null }
export interface Choice { key: string; name: string }
const metadataKey = (value: string | null): string => (value ?? '').trim().toLocaleLowerCase();

/** Stable metadata lists remain available while typing; only the song results use text search. */
export function browseLibrary(tracks: Track[], query: string, browse: Browse) {
  const choices = (source: Track[], field: 'artist' | 'album'): Choice[] => {
    const names = new Map<string, string>();
    for (const track of source) {
      const key = metadataKey(track[field]);
      if (!names.has(key)) names.set(key, track[field]?.trim() || (field === 'artist' ? 'Unknown artist' : 'No album'));
    }
    return [...names].map(([key, name]) => ({ key, name })).sort((a, b) =>
      !a.key || !b.key ? Number(!a.key) - Number(!b.key) : byName(a.name, b.name));
  };
  const artists = choices(tracks, 'artist');
  const artist = artists.some(choice => choice.key === browse.artist) ? browse.artist : null;
  const byArtist = artist === null ? tracks : tracks.filter(track => metadataKey(track.artist) === artist);
  const albums = choices(byArtist, 'album');
  const album = albums.some(choice => choice.key === browse.album) ? browse.album : null;
  const byAlbum = album === null ? byArtist : byArtist.filter(track => metadataKey(track.album) === album);
  const keys = [...new Set(byAlbum.flatMap(keyFilters))].sort(byName).map(name => ({ key: name, name }));
  const key = keys.some(choice => choice.key === browse.key) ? browse.key ?? null : null;
  const songs = searchTracks(key === null ? byAlbum : byAlbum.filter(track => keyFilters(track).includes(key)), query);
  return { artists, albums, keys, artist, album, key, songs };
}
