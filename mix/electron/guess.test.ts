import { describe, expect, it } from 'vitest';
import { guess, term } from './guess.ts';

/**
 * What this protects is the difference between a guess and a lie.
 *
 * Every failure here is silent: a wrong artist looks exactly like a right one
 * in a library row, and it is written to the manifest and then searched
 * against a catalogue, so one bad split becomes a wrong title *and* the wrong
 * album art. The cases below are the shapes this app actually receives — a
 * bounce out of a DAW, a numbered rip off a CD, and whatever YouTube called
 * the file.
 */

describe('reading a filename', () => {
  it('splits an artist from a title on the first dash', () => {
    expect(guess('Radiohead - Weird Fishes')).toEqual({
      artist: 'Radiohead',
      title: 'Weird Fishes',
    });
  });

  it('keeps everything after the first dash as the title', () => {
    // The alternative is a title of `Weird Fishes` and a lost `Live`, or an
    // artist of `Radiohead - Weird Fishes`. Both are worse than a long title.
    expect(guess('Radiohead - Weird Fishes - Live at Glastonbury')).toEqual({
      artist: 'Radiohead',
      title: 'Weird Fishes - Live at Glastonbury',
    });
  });

  it('drops a track number without touching a title that is a number', () => {
    expect(guess('01 - Aphex Twin - Xtal')).toEqual({ artist: 'Aphex Twin', title: 'Xtal' });
    expect(guess('07. Fugazi - Waiting Room')).toEqual({ artist: 'Fugazi', title: 'Waiting Room' });
    expect(guess('Bloc Party - 1985')).toEqual({ artist: 'Bloc Party', title: '1985' });
  });

  it('strips the packaging a video platform adds', () => {
    expect(guess('Fontaines D.C. - Starburster (Official Video)')).toEqual({
      artist: 'Fontaines D.C.',
      title: 'Starburster',
    });
    expect(guess('Charli xcx - 360 [Official Audio] [HD]')).toEqual({
      artist: 'Charli xcx',
      title: '360',
    });
  });

  it('drops the video id this app asks yt-dlp to append', () => {
    // `youtube.ts` names its downloads `%(title)s [%(id)s].%(ext)s`, so every
    // fetched track arrives with one. It matches no noise word and never will.
    expect(guess('Fontaines D.C. - Starburster [dQw4w9WgXcQ]')).toEqual({
      artist: 'Fontaines D.C.',
      title: 'Starburster',
    });
    expect(guess('Charli xcx - 360 (Official Video) [aB3_dE5-gH7]').title).toBe('360');
    // Not every trailing bracket is an id. Eleven characters, at the end.
    expect(guess('Neil Young - Ohio [Live]').title).toBe('Ohio [Live]');
  });

  it('keeps a bracket that is part of the name', () => {
    // The whole reason the noise list is a deny-list. Strip every bracket and
    // four different recordings collapse into one title.
    expect(guess('Kendrick Lamar - Poetic Justice (feat. Drake)').title).toBe(
      'Poetic Justice (feat. Drake)',
    );
    expect(guess('Aphex Twin - Windowlicker (Acid Edit)').title).toBe('Windowlicker (Acid Edit)');
    expect(guess('Neil Young - Ohio (Live at Massey Hall)').title).toBe(
      'Ohio (Live at Massey Hall)',
    );
  });

  it('drops what a Topic channel appends to the artist', () => {
    expect(guess('Sufjan Stevens - Topic - Should Have Known Better')).toEqual({
      artist: 'Sufjan Stevens',
      title: 'Should Have Known Better',
    });
  });

  it('gives underscores their spaces back, but only when there are none', () => {
    expect(guess('Boards_of_Canada_-_Roygbiv')).toEqual({
      artist: 'Boards of Canada',
      title: 'Roygbiv',
    });
    // A name that already has spaces owns its underscores.
    expect(guess('rough mix_v2')).toEqual({ artist: null, title: 'rough mix_v2' });
  });

  it('invents no artist when there is no dash', () => {
    // A bounce out of a DAW, which is most of what this app is given. Guessing
    // an artist here would put a wrong name in the manifest and then search a
    // catalogue with it.
    expect(guess('bounce final FINAL')).toEqual({ artist: null, title: 'bounce final FINAL' });
  });

  it('treats a dash with nothing beside it as punctuation', () => {
    expect(guess('- untitled')).toEqual({ artist: null, title: '- untitled' });
  });

  it('never comes back with an empty title', () => {
    expect(guess('(Official Video)').title).toBe('(Official Video)');
    expect(guess('   ').title).toBe('track');
  });
});

describe('the search term', () => {
  it('puts the artist first and drops the dash', () => {
    // A dash in a query is a token the catalogue has to explain away.
    expect(term({ artist: 'Radiohead', title: 'Weird Fishes' })).toBe('Radiohead Weird Fishes');
  });

  it('is the title alone when nobody knows the artist', () => {
    expect(term({ artist: null, title: 'Weird Fishes' })).toBe('Weird Fishes');
  });
});
