// @vitest-environment happy-dom
import { createElement as h, useState } from 'react';
import { render, fireEvent, cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Library } from './Library.tsx';
import { browseLibrary, columnsFrom, listing, moveColumn, nextSort, placeColumn, type Browse, type Sort } from '../listing.ts';
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

function rail(tracks = TRACKS) {
  const select = vi.fn(), onShowPrep = vi.fn();
  function Harness() {
    const [sort, setSort] = useState<Sort>({ order: 'artist', descending: false });
    const [columns, setColumns] = useState(() => columnsFrom(undefined));
    const [query, setQuery] = useState('');
    const [browse, setBrowse] = useState<Browse>({ artist: null, album: null, key: null });
    const libraryBrowser = browseLibrary(tracks, query, browse);
    const songs = libraryBrowser.songs;
    const mix = {
      libraryBrowser,
      browseArtist: (artist: string | null) => setBrowse({ artist, album: null }),
      browseKey: (key: string | null) => setBrowse(was => ({ ...was, key })),
      browseAlbum: (album: string | null) => setBrowse(was => ({ ...was, album })),
      resetLibraryFilters: () => { setBrowse({ artist: null, album: null, key: null }); setQuery(''); },
      library: { root: 'library', tracks }, songs, total: tracks.length,
      rows: listing(songs, sort.order, sort.descending), ...sort, columns,
      dropColumn: (column: typeof columns[number], target: typeof columns[number]) => setColumns(was => placeColumn(was, column, target)),
      reorderColumn: (column: typeof columns[number], step: -1 | 1) => setColumns(was => moveColumn(was, column, step)),
      sortBy: (order: Sort['order']) => setSort(was => nextSort(was, order)),
      query, setQuery, loading: false, importing: false, selected: 'Vessel',
      artOf: () => 'art/cover.jpg', notes: null, note: null, noteBad: false,
      select, importTracks: vi.fn(), chooseFolder: vi.fn(), reveal: vi.fn(),
      setLibraryWidth: vi.fn(), libraryWidth: 0,
    } as unknown as Mix;
    return h(Library, { mix, onShowPrep });
  }
  return { select, onShowPrep, ...render(h(Harness)) };
}

const rowTitles = (container: HTMLElement) => [...container.querySelectorAll('.mf-song-title')].map(n => n.textContent);

describe('the flat library table', () => {
  it('keeps each song, artwork, full artist and album on one row with meaningful headers', () => {
    const view = rail();
    expect(view.getAllByRole('columnheader').map(n => n.textContent?.trim())).toEqual(['Artist ↑', 'Album', 'Song', 'BPM', 'Key', 'Analysis', 'Stems']);
    const rows = view.container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
    expect(view.container.querySelectorAll('.mf-song .mf-art img')).toHaveLength(4);
    const vessel = view.getByText('Vessel', { selector: '.mf-song-title' }).closest('tr')!;
    expect(within(vessel).getByText('Aperture')).toBeTruthy();
    expect(within(vessel).getByText('Ceremony')).toBeTruthy();
    expect(view.container.querySelector('[aria-expanded]')).toBeNull();
  });

  it('changes real row order from column buttons and exposes the active direction', () => {
    const view = rail();
    fireEvent.click(view.getByRole('button', { name: 'Song' }));
    expect(rowTitles(view.container)).toEqual(['Demo', 'Low Tide', 'mixdown_v3', 'Vessel']);
    fireEvent.click(view.getByRole('button', { name: 'Song' }));
    expect(rowTitles(view.container)).toEqual(['Vessel', 'mixdown_v3', 'Low Tide', 'Demo']);
    expect(view.getByRole('columnheader', { name: /Song/ }).getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(view.getByRole('button', { name: 'Album' }));
    expect(rowTitles(view.container)).toEqual(['Low Tide', 'Vessel', 'Demo', 'mixdown_v3']);
    expect(view.getByRole('columnheader', { name: /Album/ }).getAttribute('aria-sort')).toBe('ascending');
  });

  it('filters across columns and restores rows with Escape or Clear', () => {
    const view = rail();
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'aperture vessel ceremony' } });
    expect(rowTitles(view.container)).toEqual(['Vessel']);
    fireEvent.keyDown(view.getByRole('textbox'), { key: 'Escape' });
    expect(rowTitles(view.container)).toHaveLength(4);
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'nothing matches' } });
    expect(view.getByText('Nothing matches that.')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Clear library search' }));
    expect(rowTitles(view.container)).toHaveLength(4);
  });

  it('selects from any cell and keeps a native song button for keyboard access', () => {
    const view = rail();
    const row = view.getByText('Vessel', { selector: '.mf-song-title' }).closest('tr')!;
    fireEvent.click(within(row).getByText('Ceremony'));
    fireEvent.click(within(row).getByRole('button', { name: 'Vessel — Aperture' }));
    expect(view.select.mock.calls).toEqual([['Vessel'], ['Vessel']]);
    expect(within(row).getByRole('button', { name: 'Vessel — Aperture' }).getAttribute('aria-pressed')).toBe('true');
    expect(row.title).toContain('Original audio; no separated stems');
  });

  it('reorders actual columns while keeping artwork with Song and sorting by field', () => {
    const view = rail();
    const songHeader = view.getByRole('columnheader', { name: 'Song' });
    const albumHeader = view.getByRole('columnheader', { name: 'Album' });
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(songHeader, { dataTransfer });
    fireEvent.dragOver(albumHeader, { dataTransfer });
    fireEvent.drop(albumHeader, { dataTransfer });
    fireEvent.dragEnd(songHeader);
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-mix-library-column', 'title');
    expect(view.getAllByRole('columnheader').map(n => n.textContent?.trim())).toEqual(['Artist ↑', 'Song', 'Album', 'BPM', 'Key', 'Analysis', 'Stems']);
    const vessel = view.getByText('Vessel', { selector: '.mf-song-title' }).closest('tr')!;
    expect(vessel.children[1].querySelector('img')).not.toBeNull();
    expect(vessel.children[0].textContent).toBe('Aperture');
    fireEvent.click(view.getByRole('button', { name: 'Song' }));
    expect(rowTitles(view.container)).toEqual(['Low Tide', 'Vessel', 'Demo', 'mixdown_v3']);
    fireEvent.pointerDown(view.getByRole('button', { name: 'Song' }));
    fireEvent.click(view.getByRole('button', { name: 'Song' }));
    expect(rowTitles(view.container)).toEqual(['Demo', 'Low Tide', 'mixdown_v3', 'Vessel']);
    fireEvent.keyDown(view.getByRole('button', { name: 'Song' }), { key: 'ArrowLeft', altKey: true });
    expect(view.getAllByRole('columnheader').map(n => n.textContent?.trim())).toEqual(['Song ↑', 'Artist', 'Album', 'BPM', 'Key', 'Analysis', 'Stems']);
    expect(view.getByText('Vessel', { selector: '.mf-song-title' }).closest('tr')!.children[0].querySelector('img')).not.toBeNull();
  });

  it('combines artist, album and text filters and recovers from empty results', () => {
    const view = rail();
    const artists = view.getByRole('listbox', { name: 'Artists' });
    const albums = view.getByRole('listbox', { name: 'Albums' });
    fireEvent.change(artists, { target: { value: '1' } });
    expect(rowTitles(view.container)).toEqual(['Low Tide', 'Vessel', 'Demo']);
    fireEvent.change(albums, { target: { value: '1' } });
    expect(rowTitles(view.container)).toEqual(['Low Tide', 'Vessel']);
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'vessel' } });
    expect(rowTitles(view.container)).toEqual(['Vessel']);
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'absent' } });
    expect(view.getByText('Nothing matches that.')).toBeTruthy();
    expect(within(artists).getByRole('option', { name: 'Aperture' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Reset filters' }));
    expect(rowTitles(view.container)).toHaveLength(4);
    expect((artists as HTMLSelectElement).value).toBe('0');
    expect((albums as HTMLSelectElement).value).toBe('0');
  });

  it('clears album selection when switching artist and lets All restore the scope', () => {
    const view = rail();
    const artists = view.getByRole('listbox', { name: 'Artists' });
    const albums = view.getByRole('listbox', { name: 'Albums' });
    fireEvent.change(artists, { target: { value: '1' } });
    fireEvent.change(albums, { target: { value: '1' } });
    fireEvent.change(artists, { target: { value: '2' } });
    expect(rowTitles(view.container)).toEqual(['mixdown_v3']);
    expect((albums as HTMLSelectElement).value).toBe('0');
    expect(within(albums).queryByRole('option', { name: 'Ceremony' })).toBeNull();
    fireEvent.change(artists, { target: { value: '0' } });
    expect(rowTitles(view.container)).toHaveLength(4);
  });

  it('hands the same track ID to a deck after sorting and filtering', () => {
    const view = rail();
    fireEvent.click(view.getByRole('button', { name: 'Album' }));
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'vessel' } });
    const store = new Map<string, string>();
    const dataTransfer = { setData: (type: string, value: string) => store.set(type, value), effectAllowed: '' };
    fireEvent.dragStart(view.getByText('Vessel', { selector: '.mf-song-title' }).closest('.mf-song')!, { dataTransfer });
    expect(store.get(TRACK_DRAG)).toBe('Vessel');
  });
});

it('renders Key in its own sortable, movable cell while retaining the Keys filter', () => {
  const view = rail([{ ...track('Zeta', 'Artist'), key: 'C minor' }, { ...track('Alpha', 'Artist'), key: 'G major' }, track('Missing', 'Artist')]);
  const zeta = view.getByRole('button', { name: 'Zeta — Artist' });
  expect(zeta.textContent).not.toContain('C minor');
  expect(within(zeta.closest('tr')!).getByRole('cell', { name: 'C minor' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'Key' }));
  expect(rowTitles(view.container)).toEqual(['Zeta', 'Alpha', 'Missing']);
  fireEvent.click(view.getByRole('button', { name: 'Key' }));
  expect(rowTitles(view.container)).toEqual(['Alpha', 'Zeta', 'Missing']);
  fireEvent.keyDown(view.getByRole('button', { name: 'Key' }), { key: 'ArrowLeft', altKey: true });
  expect(view.getAllByRole('columnheader').map(n => n.textContent?.trim())).toEqual(['Artist', 'Album', 'Song', 'Key ↓', 'BPM', 'Analysis', 'Stems']);
  fireEvent.change(view.getByRole('listbox', { name: 'Keys' }), { target: { value: '1' } });
  expect(rowTitles(view.container)).toEqual(['Zeta']);
});

it('resizes without sorting or moving columns, keeps widths through reorder and resets by keyboard', () => {
  const view = rail();
  const table = view.getByRole('table', { name: 'Library songs' });
  const headers = () => [...table.querySelectorAll('th')].map(th => th.querySelector('button')!.textContent);
  const before = headers();
  const handle = view.getByRole('separator', { name: 'Artist column width' });
  Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() });
  Object.defineProperty(handle, 'releasePointerCapture', { value: vi.fn() });
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 164 });
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: 164 });
  fireEvent.click(handle);
  expect(handle.getAttribute('aria-valuenow')).toBe('164');
  expect(headers()).toEqual(before);
  const transfer = { setData: vi.fn() };
  fireEvent.dragStart(handle, { dataTransfer: transfer });
  expect(transfer.setData).not.toHaveBeenCalled();
  fireEvent.keyDown(view.getByRole('button', { name: /Artist/ }), { key: 'ArrowRight', altKey: true });
  expect(table.querySelectorAll('col')[1].getAttribute('style')).toContain('164px');
  fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  expect(handle.getAttribute('aria-valuenow')).toBe('156');
  fireEvent.keyDown(handle, { key: 'Home' });
  expect(handle.getAttribute('aria-valuenow')).toBe('100');
  fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 100 });
  fireEvent.pointerMove(handle, { pointerId: 2, clientX: -500 });
  expect(handle.getAttribute('aria-valuenow')).toBe('72');
  fireEvent.pointerCancel(handle, { pointerId: 2 });
  fireEvent.pointerMove(handle, { pointerId: 2, clientX: 500 });
  expect(handle.getAttribute('aria-valuenow')).toBe('72');
  fireEvent.doubleClick(handle);
  expect(handle.getAttribute('aria-valuenow')).toBe('100');
  fireEvent.pointerDown(view.getByRole('button', { name: /Artist/ }));
  fireEvent.click(view.getByRole('button', { name: /Artist/ }));
  expect(view.getByRole('button', { name: /Artist/ }).closest('th')!.getAttribute('aria-sort')).toBe('descending');
});

it('keeps display columns movable but fixed and puts shared Reset filters in the top toolbar', () => {
  const view = rail();
  expect(view.queryByRole('separator', { name: 'Stems column width' })).toBeNull();
  expect(view.queryByRole('separator', { name: 'Analysis column width' })).toBeNull();
  expect(view.getByRole('separator', { name: 'Song column width' })).toBeTruthy();
  fireEvent.keyDown(view.getByRole('button', { name: 'Stems' }), { key: 'ArrowLeft', altKey: true });
  expect(view.getAllByRole('columnheader').at(-2)!.getAttribute('aria-label')).toBe('Stems');
  const reset = view.getByRole('button', { name: 'Reset filters' }) as HTMLButtonElement;
  expect(reset.closest('.mf-library-tools')).toBeTruthy();
  expect(reset.closest('.wdg-button')).toBeTruthy();
  expect(reset.textContent).toBe('↻');
  expect([...reset.closest('.mf-library-tools')!.children].map(node => node.className)).toEqual(['mf-library-search', 'wdg wdg-button', 'wdg wdg-toggle', 'wdg wdg-button']);
  expect(view.container.querySelector('.mf-library-browser')!.children).toHaveLength(3);
  expect(reset.disabled).toBe(true);
  fireEvent.change(view.getByRole('textbox'), { target: { value: 'vessel' } });
  expect(reset.disabled).toBe(false);
  fireEvent.click(reset);
  expect(reset.disabled).toBe(true);
  expect(rowTitles(view.container)).toHaveLength(4);
});

it('opens separation preparation for the requested track without activating its row drag',()=>{
  const view=rail();const button=view.getByRole('button',{name:'Generate stems for Low Tide'});
  fireEvent.click(button);
  expect(view.select).toHaveBeenCalledExactlyOnceWith('Low Tide');expect(view.onShowPrep).toHaveBeenCalledOnce();
  const setData=vi.fn();expect(fireEvent.dragStart(button,{dataTransfer:{setData}})).toBe(false);
  expect(setData).not.toHaveBeenCalled();
  expect(button.tagName).toBe('BUTTON');expect(button.getAttribute('type')).toBe('button');
});

it('moves the header with body horizontal scrolling without replacing song rows', () => {
  const view=rail(),table=view.getByRole('table',{name:'Library songs'});
  const body=table.querySelector('tbody')!,row=body.querySelector('tr');
  body.scrollLeft=140;
  fireEvent.scroll(body);
  expect(table.querySelector('thead tr')!.getAttribute('style')).toContain('translateX(-140px)');
  expect(body.querySelector('tr')).toBe(row);
});
