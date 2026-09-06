import { describe, expect, it } from 'vitest';
import { gridFact, type GridNote, type Track } from './openflow.ts';

/**
 * The rail's second fact is the only place a person can see which of a whole
 * library still needs its beats found, so what it says has to be exactly what
 * is true — including when nobody has been able to say anything at all.
 */

const track = (over: Partial<Track> = {}): Track =>
  ({
    id: 't1',
    file: 'audio/A Song.flac',
    title: 'A Song',
    artist: null,
    album: null,
    art: null,
    bpm: null,
    key: null,
    seconds: 200,
    added: '2026-01-01T00:00:00.000Z',
    model: 'htdemucs',
    sources: ['drums', 'bass', 'other', 'vocals'],
    stems: 'stems/t1/htdemucs',
    ...over,
  }) as Track;

const note = (over: Partial<GridNote> = {}): GridNote => ({
  bpm: null,
  slowest: null,
  fastest: null,
  byHand: false,
  failed: false,
  ...over,
});

describe('what a library row says about the grid', () => {
  it('says the tempo where the beats have been found', () => {
    const fact = gridFact(track(), note({ bpm: 128.05 }), '128.05', true);
    expect(fact.says).toBe('128.05');
    expect(fact.state).toBe('measured');
  });

  it('marks a grid somebody made apart from one a fit measured', () => {
    expect(gridFact(track(), note({ bpm: 128, byHand: true }), '128', true).state).toBe('byHand');
  });

  it('separates a refused fit from a track nobody has opened', () => {
    expect(gridFact(track(), note({ failed: true }), '', true).says).toBe('no fit');
    expect(gridFact(track(), note({ failed: true }), '', true).state).toBe('failed');
    expect(gridFact(track(), note(), '', true).says).toBe('no grid');
    expect(gridFact(track(), note(), '', true).state).toBe('unread');
  });

  it('says the file type where there are no stems to have found beats in', () => {
    const fact = gridFact(track({ sources: [] }), note(), '', true);
    expect(fact.says).toBe('flac');
    expect(fact.state).toBe('none');
  });

  it('claims nothing about a grid nobody has been able to look up', () => {
    // The louder mistake: an unanswered rail reading as `no grid` on every row.
    expect(gridFact(track(), undefined, '', false).says).toBe('flac');
    expect(gridFact(track(), undefined, '', false).state).toBe('none');
  });

  it('keeps the key beside whatever it says', () => {
    expect(gridFact(track({ key: 'Am' }), note({ bpm: 128 }), '128', true).says).toBe('Am · 128');
    expect(gridFact(track({ key: 'Am' }), note({ failed: true }), '', true).says).toBe('Am · no fit');
  });
});
