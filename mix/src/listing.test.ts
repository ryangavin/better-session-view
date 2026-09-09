import { describe, expect, it } from 'vitest';
import { listing, matchingRows, searchTracks, NAMELESS, type Head, type Row } from './listing.ts';
import { credits } from './credits.ts';
import type { Track } from './openflow.ts';

let n = 0;
const track = (held: Partial<Track>): Track => ({
  id: `t${++n}`, file: 'a.wav', title: 'Untitled', artist: null, album: null, art: null,
  bpm: null, key: null, seconds: null, added: '2026-01-01T00:00:00.000Z', model: null,
  sources: [], stems: null, ...held,
});

/** What the rail actually draws, one row a line, indented the way it indents. */
const drawn = (rows: Row[]): string[] =>
  rows.map((row) => (row.kind === 'track'
    ? `${'  '.repeat(row.depth)}${row.track.title}`
    : `${row.kind === 'album' ? '  ' : ''}[${row.name} ${row.count}]`));

describe('the library rail, ordered by artist', () => {
  it('gives an album a heading once two of its tracks are here, and not before', () => {
    const one = listing([
      track({ title: 'Vessel', artist: 'Aperture', album: 'Ceremony' }),
      track({ title: 'Alone', artist: 'Aperture', album: 'Long Division' }),
    ], 'artist');
    expect(drawn(one)).toEqual(['[Aperture 2]', '  Alone', '  Vessel']);

    const two = listing([
      track({ title: 'Vessel', artist: 'Aperture', album: 'Ceremony' }),
      track({ title: 'Low Tide', artist: 'Aperture', album: 'Ceremony' }),
      track({ title: 'Alone', artist: 'Aperture', album: 'Long Division' }),
    ], 'artist');
    expect(drawn(two)).toEqual(['[Aperture 3]', '  Alone', '  [Ceremony 2]', '    Low Tide', '    Vessel']);
  });

  it('puts an artist loose tracks above its records, so a stuck heading is never lying', () => {
    const rows = listing([
      track({ title: 'Vessel', artist: 'Aperture', album: 'Ceremony' }),
      track({ title: 'Low Tide', artist: 'Aperture', album: 'Ceremony' }),
      track({ title: 'Demo', artist: 'Aperture' }),
    ], 'artist');
    expect(drawn(rows)).toEqual(['[Aperture 3]', '  Demo', '  [Ceremony 2]', '    Low Tide', '    Vessel']);
  });

  it('never draws an unknown-album heading', () => {
    const rows = listing([track({ title: 'Demo', artist: 'Aperture' }), track({ title: 'Bounce', artist: 'Aperture' })], 'artist');
    expect(drawn(rows)).toEqual(['[Aperture 2]', '  Bounce', '  Demo']);
  });

  it('sweeps everything the filename gave no artist for into one pile at the bottom', () => {
    const rows = listing([
      track({ title: 'mixdown_v3' }),
      track({ title: 'Vessel', artist: 'Zodiac' }),
      track({ title: 'bounce', artist: '  ' }),
    ], 'artist');
    expect(drawn(rows)).toEqual(['[Zodiac 1]', '  Vessel', '[No artist 2]', '  bounce', '  mixdown_v3']);
    expect(rows.find((row) => row.kind !== 'track' && row.name === 'No artist')?.kind).toBe('artist');
  });

  it('files an artist under its name rather than under The, and numbers the way a person reads them', () => {
    const rows = listing([
      track({ title: 'b', artist: 'Zodiac' }),
      track({ title: 'a', artist: 'The Chemical Brothers' }),
      track({ title: 'c', artist: 'Aperture' }),
    ], 'artist');
    expect(rows.filter((row) => row.kind !== 'track').map((row) => row.name))
      .toEqual(['Aperture', 'The Chemical Brothers', 'Zodiac']);
  });

  it('keeps one artist together however the shift key went', () => {
    const rows = listing([
      track({ title: 'a', artist: 'Aphex Twin' }),
      track({ title: 'b', artist: 'aphex twin' }),
    ], 'artist');
    expect(drawn(rows)).toEqual(['[Aphex Twin 2]', '  a', '  b']);
  });

  it('takes a records cover from the first track that has one', () => {
    const rows = listing([
      track({ title: 'a', artist: 'Aperture', album: 'Ceremony' }),
      track({ title: 'b', artist: 'Aperture', album: 'Ceremony', art: 'art/t.jpg' }),
    ], 'artist');
    expect(rows.find((row): row is Head => row.kind === 'album')?.art).toBe('art/t.jpg');
  });

  it('shuts a heading without losing what it says is under it', () => {
    const tracks = [
      track({ title: 'Vessel', artist: 'Aperture', album: 'Ceremony' }),
      track({ title: 'Low Tide', artist: 'Aperture', album: 'Ceremony' }),
      track({ title: 'Demo', artist: 'Aperture' }),
      track({ title: 'Solo', artist: 'Zodiac' }),
    ];
    expect(drawn(listing(tracks, 'artist', new Set(['artist:aperture']))))
      .toEqual(['[Aperture 3]', '[Zodiac 1]', '  Solo']);
    expect(drawn(listing(tracks, 'artist', new Set(['artist:aperture/ceremony']))))
      .toEqual(['[Aperture 3]', '  Demo', '  [Ceremony 2]', '[Zodiac 1]', '  Solo']);
  });

  it('shuts the nameless pile by the key it is drawn with', () => {
    expect(drawn(listing([track({ title: 'mixdown_v3' })], 'artist', new Set([NAMELESS])))).toEqual(['[No artist 1]']);
  });
});

describe('an artist credited more than one way', () => {
  const SKRILLEX = [
    track({ title: 'Bangarang', artist: 'Skrillex' }),
    track({ title: 'Raise Your Weapon', artist: 'Skrillex' }),
    track({ title: 'Purple Lamborghini', artist: 'Skrillex & Rick Ross' }),
    track({ title: 'Rumble', artist: 'Skrillex, Fred again.. & Flowdan' }),
    track({ title: 'Group Therapy', artist: 'Above & Beyond' }),
  ];

  it('gets one heading rather than one for every collaborator', () => {
    expect(drawn(listing(SKRILLEX, 'artist')).filter((line) => line.startsWith('[')))
      .toEqual(['[Above & Beyond 1]', '[Skrillex 4]']);
  });

  it('keeps every collaboration under it, in title order', () => {
    expect(drawn(listing(SKRILLEX, 'artist'))).toEqual([
      '[Above & Beyond 1]', '  Group Therapy',
      '[Skrillex 4]', '  Bangarang', '  Purple Lamborghini', '  Raise Your Weapon', '  Rumble',
    ]);
  });

  it('hands the row whoever the heading left out, and the credit as it is stored', () => {
    const rows = listing(SKRILLEX, 'artist');
    const of = (title: string) => rows.find((row) => row.kind === 'track' && row.track.title === title);
    expect(of('Purple Lamborghini')).toMatchObject({ credit: { lead: 'Skrillex', others: '& Rick Ross', full: 'Skrillex & Rick Ross' } });
    expect(of('Rumble')).toMatchObject({ credit: { others: 'Fred again.. & Flowdan' } });
    expect(of('Bangarang')).toMatchObject({ credit: { others: null } });
  });

  it('leaves a band whose name carries an ampersand as its own heading', () => {
    expect(drawn(listing(SKRILLEX, 'artist'))).toContain('[Above & Beyond 1]');
  });

  it('keeps the heading it had when the filter cuts the evidence out from under it', () => {
    // What the rail does: read the whole folder, then list only what survived the box.
    const read = credits(SKRILLEX.map((t) => t.artist));
    const survived = SKRILLEX.filter((t) => t.artist === 'Skrillex & Rick Ross');
    expect(drawn(listing(survived, 'artist', new Set(), read))).toEqual(['[Skrillex 1]', '  Purple Lamborghini']);
    // Without the folder behind it, the same one row would name itself.
    expect(drawn(listing(survived, 'artist'))).toEqual(['[Skrillex & Rick Ross 1]', '  Purple Lamborghini']);
  });
});

describe('the library rail, ordered flat', () => {
  const tracks = [
    track({ title: 'Vessel', artist: 'Aperture', album: 'Ceremony', added: '2026-01-01T00:00:00.000Z' }),
    track({ title: 'Alone', artist: 'Zodiac', added: '2026-06-01T00:00:00.000Z' }),
  ];

  it('puts what was just imported at the top rather than at the bottom', () => {
    expect(drawn(listing(tracks, 'added'))).toEqual(['Alone', 'Vessel']);
  });

  it('draws no headings at all, so a row keeps its own artist and cover', () => {
    expect(drawn(listing(tracks, 'title'))).toEqual(['Alone', 'Vessel']);
    expect(listing(tracks, 'title').every((row) => row.kind === 'track' && row.depth === 0)).toBe(true);
  });
});

describe('searching without losing browsing identity', () => {
  const tracks = [
    track({ title: 'Rumble', artist: 'Skrillex, Fred again.. & Flowdan', album: 'Quest For Fire' }),
    track({ title: 'Hazel Theme', artist: 'Skrillex', album: 'Quest For Fire' }),
    track({ title: 'RATATA', artist: 'Skrillex, Missy Elliott & Mr. Oizo' }),
    track({ title: 'Other', artist: 'Other Artist', album: 'Other Record' }),
    track({ title: 'Second', artist: 'Other Artist', album: 'Other Record' }),
  ];

  it('matches words across fields in any order, including full collaborator credits', () => {
    expect(searchTracks(tracks, '  FLOWDAN   rumble quest ').map(t => t.title)).toEqual(['Rumble']);
    expect(searchTracks(tracks, 'skrillex rumble').map(t => t.title)).toEqual(['Rumble']);
    expect(searchTracks(tracks, 'rumble missy')).toEqual([]);
    expect(searchTracks(tracks, '  ')).toBe(tracks);
  });

  it('retains the album for a single result and counts only matching tracks', () => {
    const matches = searchTracks(tracks, 'flowdan');
    const rows = matchingRows(listing(tracks, 'artist'), new Set(matches.map(t => t.id)));
    expect(drawn(rows)).toEqual(['[Skrillex 1]', '  [Quest For Fire 1]', '    Rumble']);
  });

  it('prunes unrelated albums and artists without assigning loose tracks an album', () => {
    const matches = searchTracks(tracks, 'missy');
    expect(drawn(matchingRows(listing(tracks, 'artist'), new Set(matches.map(t => t.id)))))
      .toEqual(['[Skrillex 1]', '  RATATA']);
    expect(matchingRows(listing(tracks, 'artist'), new Set())).toEqual([]);
  });

  it('preserves the chosen flat sort when filtering', () => {
    const ids = new Set(searchTracks(tracks, 'skrillex').map(t => t.id));
    expect(drawn(matchingRows(listing(tracks, 'title'), ids))).toEqual(['Hazel Theme', 'RATATA', 'Rumble']);
  });
});
