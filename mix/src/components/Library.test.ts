// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Library } from './Library.tsx';
import { listing, type Order } from '../listing.ts';
import { TRACK_DRAG } from '../play/decks.ts';
import type { Track } from '../openflow.ts';
import type { Mix } from '../state.ts';

afterEach(cleanup);

const track = (title: string, artist: string | null, album: string | null = null): Track => ({
  id: title, file: `${title}.wav`, title, artist, album, art: null, bpm: null, key: null,
  seconds: 100, added: '2026-01-01T00:00:00.000Z', model: null, sources: [], stems: null,
});

const TRACKS = [
  track('Vessel', 'Aperture', 'Ceremony'),
  track('Low Tide', 'Aperture', 'Ceremony'),
  track('Demo', 'Aperture', 'Long Division'),
  track('mixdown_v3', null),
];

const CREDITED = [
  track('Bangarang', 'Skrillex'),
  track('Purple Lamborghini', 'Skrillex & Rick Ross'),
];

function rail(order: Order = 'artist', collapsed = new Set<string>(), tracks = TRACKS) {
  const toggleHead = vi.fn();
  const mix = {
    library: { root: 'library', tracks }, songs: tracks, total: tracks.length,
    rows: listing(tracks, order, collapsed), order, setOrder: vi.fn(), collapsed, toggleHead,
    artists: 2, query: '', setQuery: vi.fn(), loading: false, importing: false, selected: null,
    artOf: () => null, coverOf: () => null, notes: null, note: null, noteBad: false,
    select: vi.fn(), importTracks: vi.fn(), chooseFolder: vi.fn(), reveal: vi.fn(),
    setLibraryWidth: vi.fn(), libraryWidth: 0,
  } as unknown as Mix;
  return { toggleHead, ...render(h(Library, { mix })) };
}

describe('the library rail', () => {
  it('draws a heading for the record that earned one, and none for the single cut', () => {
    const view = rail();
    expect([...view.container.querySelectorAll('.mf-heading-name')].map((n) => n.textContent))
      .toEqual(['Aperture', 'Ceremony', 'No artist']);
    expect(view.getByText('Demo').closest('.mf-song')?.getAttribute('data-depth')).toBe('1');
    expect(view.getByText('Vessel').closest('.mf-song')?.getAttribute('data-depth')).toBe('2');
  });

  it('spends no line on the artist a heading has already named', () => {
    const view = rail();
    expect(view.container.querySelector('.mf-song-artist')).toBeNull();
    expect(view.container.querySelector('.mf-song .mf-art')).toBeNull();
  });

  it('gives a track its cover and its artist back where nothing is grouping them', () => {
    const view = rail('added');
    expect([...view.container.querySelectorAll('.mf-song-artist')].map((n) => n.textContent))
      .toEqual(['Aperture', 'Aperture', 'unknown artist', 'Aperture']);
    expect(view.container.querySelector('.mf-heading')).toBeNull();
  });

  it('shuts the one heading on a click and every heading on an Option-click', () => {
    const view = rail();
    const head = view.getByRole('button', { name: /Aperture/ });
    fireEvent.click(head);
    expect(view.toggleHead).toHaveBeenCalledWith('artist:aperture', false);
    fireEvent.click(head, { altKey: true });
    expect(view.toggleHead).toHaveBeenCalledWith('artist:aperture', true);
  });

  it('says a shut heading is shut, and keeps its count where the rows have gone', () => {
    const view = rail('artist', new Set(['artist:aperture']));
    const head = view.getByRole('button', { name: /Aperture/ });
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(head.textContent).toContain('3');
    expect(view.queryByText('Vessel')).toBeNull();
  });

  it('draws one heading for an artist credited two ways, and says who else was on it', () => {
    const view = rail('artist', new Set(), CREDITED);
    expect([...view.container.querySelectorAll('.mf-heading-name')].map((n) => n.textContent)).toEqual(['Skrillex']);
    expect([...view.container.querySelectorAll('.mf-song-with')].map((n) => n.textContent)).toEqual(['& Rick Ross']);
  });

  it('puts the whole stored credit where the hint strip and a hover will find it', () => {
    const view = rail('artist', new Set(), CREDITED);
    expect(view.getByText('Purple Lamborghini').closest('.mf-song')?.getAttribute('title'))
      .toBe('Purple Lamborghini — Skrillex & Rick Ross');
  });

  it('still hands a track to a deck from inside a record', () => {
    const view = rail();
    const store = new Map<string, string>();
    const dataTransfer = { setData: (t: string, v: string) => store.set(t, v), getData: (t: string) => store.get(t) ?? '', effectAllowed: '' };
    fireEvent.dragStart(view.getByText('Vessel').closest('.mf-song')!, { dataTransfer });
    expect(store.get(TRACK_DRAG)).toBe('Vessel');
  });
});
