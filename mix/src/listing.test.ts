import { describe, expect, it } from 'vitest';
import { browseLibrary, columnsFrom, listing, moveColumn, nextSort, placeColumn, searchTracks } from './listing.ts';
import type { Track } from './openflow.ts';
import { KEY_DETECTION_VERSION, KEYFINDER_CONFIG, KEYFINDER_VERSION, type KeyDetection } from './keyDetection.ts';

let n = 0;
const track = (held: Partial<Track>): Track => ({
  id: `t${++n}`, file: 'a.wav', title: 'Untitled', artist: null, album: null, art: null,
  bpm: null, key: null, seconds: null, added: '2026-01-01T00:00:00.000Z', model: null,
  sources: [], stems: null, ...held,
});

const titles = (tracks: Track[]) => tracks.map((track) => track.title);

describe('the library table', () => {
  it('sorts Artist by Album then Song, leaving missing metadata last', () => {
    const tracks = [
      track({ title: 'Unknown' }),
      track({ title: 'Solo', artist: 'Zodiac' }),
      track({ title: 'Demo', artist: 'Aperture' }),
      track({ title: 'Alone', artist: 'Aperture', album: 'Long Division' }),
      track({ title: 'Vessel', artist: 'Aperture', album: 'Ceremony' }),
      track({ title: 'Low Tide', artist: 'aperture', album: 'Ceremony' }),
    ];
    expect(titles(listing(tracks, 'artist'))).toEqual(['Low Tide', 'Vessel', 'Alone', 'Demo', 'Solo', 'Unknown']);
    expect(titles(listing(tracks, 'artist', true))).toEqual(['Solo', 'Low Tide', 'Vessel', 'Alone', 'Demo', 'Unknown']);
    expect(tracks[0].title).toBe('Unknown');
  });

  it('sorts Album by Artist then Song without changing full credits or IDs', () => {
    const tracks = [
      track({ title: 'Last', artist: 'Zodiac', album: 'Ceremony' }),
      track({ title: 'Later', artist: 'Aperture', album: 'Long Division' }),
      track({ title: 'Vessel', artist: 'Aperture & Friend', album: 'Ceremony' }),
      track({ title: 'Low Tide', artist: 'Aperture', album: 'Ceremony' }),
    ];
    const result = listing(tracks, 'album');
    expect(titles(result)).toEqual(['Low Tide', 'Vessel', 'Last', 'Later']);
    expect(result[1]).toBe(tracks[2]);
    expect(result[1].artist).toBe('Aperture & Friend');
  });

  it('ignores leading articles and compares numbers naturally', () => {
    expect(titles(listing([
      track({ title: 'The Track 10' }), track({ title: 'Track 2' }), track({ title: 'Another' }),
    ], 'title'))).toEqual(['Another', 'Track 2', 'The Track 10']);
  });

  it('starts Recent newest first, with alphabetic ties', () => {
    const tracks = [track({ title: 'Old' }),
      track({ title: 'Z', added: '2026-06-01' }), track({ title: 'A', added: '2026-06-01' })];
    expect(titles(listing(tracks, 'added'))).toEqual(['A', 'Z', 'Old']);
    expect(titles(listing(tracks, 'added', false))).toEqual(['Old', 'A', 'Z']);
  });

  it('reverses a repeated column click and resets direction for a new column', () => {
    expect(nextSort({ order: 'artist', descending: false }, 'artist')).toEqual({ order: 'artist', descending: true });
    expect(nextSort({ order: 'artist', descending: true }, 'album')).toEqual({ order: 'album', descending: false });
    expect(nextSort({ order: 'album', descending: false }, 'added')).toEqual({ order: 'added', descending: true });
  });

  it('matches every query word across title, full credit and album before sorting', () => {
    const tracks = [
      track({ title: 'Rumble', artist: 'Skrillex, Fred again.. & Flowdan', album: 'Quest For Fire' }),
      track({ title: 'Hazel Theme', artist: 'Skrillex', album: 'Quest For Fire' }),
    ];
    expect(titles(searchTracks(tracks, '  FLOWDAN rumble QUEST  '))).toEqual(['Rumble']);
    expect(searchTracks(tracks, 'rumble missy')).toEqual([]);
    expect(searchTracks(tracks, '  ')).toBe(tracks);
    expect(titles(listing(searchTracks(tracks, 'quest'), 'title', true))).toEqual(['Rumble', 'Hazel Theme']);
  });
});

it('retains valid saved column positions and bounds moves at the edges', () => {
  expect(columnsFrom(undefined)).toEqual(['artist', 'album', 'title', 'bpm', 'key', 'analysis', 'stems']);
  expect(columnsFrom(['title', 'title', 'album'])).toEqual(['title', 'album', 'artist', 'bpm', 'key', 'analysis', 'stems']);
  expect(columnsFrom(['title', 'artist', 'other'])).toEqual(['title', 'artist', 'album', 'bpm', 'key', 'analysis', 'stems']);
  const saved = columnsFrom(['title', 'artist', 'album', 'bpm', 'key', 'analysis', 'stems']);
  expect(saved).toEqual(['title', 'artist', 'album', 'bpm', 'key', 'analysis', 'stems']);
  expect(moveColumn(saved, 'title', -1)).toEqual(saved);
  expect(moveColumn(saved, 'title', 1)).toEqual(['artist', 'title', 'album', 'bpm', 'key', 'analysis', 'stems']);
  expect(saved).toEqual(['title', 'artist', 'album', 'bpm', 'key', 'analysis', 'stems']);
});

it('sorts BPM numerically, keeping missing readings last in either direction', () => {
  const tracks = [track({ title: 'Unknown' }), track({ title: 'Fast' }), track({ title: 'Slow' })];
  const note = (bpm: number) => ({ bpm, slowest: bpm, fastest: bpm, byHand: false, failed: false, algorithm: null });
  const notes = { [tracks[1].id]: note(140), [tracks[2].id]: note(90) };
  expect(titles(listing(tracks, 'bpm', false, notes))).toEqual(['Slow', 'Fast', 'Unknown']);
  expect(titles(listing(tracks, 'bpm', true, notes))).toEqual(['Fast', 'Slow', 'Unknown']);
});

it('sorts the displayed key, honoring manual overrides and keeping Unknown last', () => {
  const file=track({}).file;
  const evidence:KeyDetection={version:KEY_DETECTION_VERSION,algorithm:'libkeyfinder',detectorVersion:KEYFINDER_VERSION,source:{file,hash:'original'},config:{...KEYFINDER_CONFIG},status:'key',label:'C major',confidence:'provisional',analyzedAt:''};
  const tracks=[track({title:'Unknown'}),track({title:'Manual',key:'G minor',keyDetection:evidence}),track({title:'Estimated',keyDetection:evidence})];
  expect(titles(listing(tracks, 'key'))).toEqual(['Estimated', 'Manual', 'Unknown']);
  expect(titles(listing(tracks, 'key', true))).toEqual(['Manual', 'Estimated', 'Unknown']);
});

it('inserts Key after BPM without moving existing personal column positions', () => {
  const old = ['stems', 'bpm', 'title', 'analysis', 'album', 'artist'];
  const next = columnsFrom(old);
  expect(next).toEqual(['stems', 'bpm', 'key', 'title', 'analysis', 'album', 'artist']);
  expect(next.filter(c => c !== 'key')).toEqual(old);
  expect(columnsFrom(['key', ...old])).toEqual(['key', ...old]);
});

it('browses stored credits and album names without splitting collaborators or losing missing metadata', () => {
  const tracks = [track({ title: 'One', artist: 'Artist', album: 'Record' }),
    track({ title: 'Two', artist: 'artist', album: 'record' }),
    track({ title: 'Collab', artist: 'Artist & Friend', album: 'Other' }), track({ title: 'Demo' })];
  const all = browseLibrary(tracks, '', { artist: null, album: null });
  expect(all.artists.map(choice => choice.name)).toEqual(['Artist', 'Artist & Friend', 'Unknown artist']);
  expect(all.albums.map(choice => choice.name)).toEqual(['Other', 'Record', 'No album']);
  const narrowed = browseLibrary(tracks, 'two record', { artist: 'artist', album: 'record' });
  expect(titles(narrowed.songs)).toEqual(['Two']);
  expect(narrowed.albums.map(choice => choice.name)).toEqual(['Record']);
  expect(titles(browseLibrary(tracks, '', { artist: '', album: '' }).songs)).toEqual(['Demo']);
  expect(browseLibrary(tracks, 'absent', { artist: 'artist', album: 'record' }).songs).toEqual([]);
  expect(browseLibrary([], '', { artist: 'deleted', album: 'deleted' })).toEqual({ artists: [], albums: [], keys: [], artist: null, album: null, key: null, songs: [] });
});

it('adds Stems beside Analysis in an existing personal arrangement', () => {
  expect(columnsFrom(['analysis', 'artist', 'album', 'title', 'bpm', 'key']))
    .toEqual(['analysis', 'stems', 'artist', 'album', 'title', 'bpm', 'key']);
});

it('moves a dropped column in either direction without losing other columns', () => {
  const columns = columnsFrom(undefined);
  expect(placeColumn(columns, 'title', 'artist')).toEqual(['title', 'artist', 'album', 'bpm', 'key', 'analysis', 'stems']);
  expect(placeColumn(columns, 'artist', 'stems')).toEqual(['album', 'title', 'bpm', 'key', 'analysis', 'stems', 'artist']);
  expect(placeColumn(columns, 'title', 'title')).toEqual(columns);
});
