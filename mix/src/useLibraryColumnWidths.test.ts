// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLibraryColumnWidths } from './useLibraryColumnWidths.ts';
import { useLibraryColumns } from './useLibraryColumns.ts';
const KEY = 'mixflow.library-column-widths.v1';
beforeEach(() => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { saved.set(key, value); }) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('saves immediately and keeps a resized column attached to its ID after reordering and reopening', () => {
  const first = renderHook(() => ({ ...useLibraryColumnWidths(), ...useLibraryColumns(undefined) }));
  act(() => first.result.current.resize('title', 348));
  expect(JSON.parse(localStorage.getItem(KEY)!).title).toBe(348);
  act(() => first.result.current.dropColumn('title', 'artist'));
  first.unmount();
  const reopened = renderHook(() => ({ ...useLibraryColumnWidths(), ...useLibraryColumns(undefined) }));
  expect(reopened.result.current.columns[0]).toBe('title');
  expect(reopened.result.current.widths.title).toBe(348);
  expect(reopened.result.current.widths.artist).toBe(100);
});
it('repairs invalid values, ignores removed IDs and adds defaults for new columns', () => {
  localStorage.setItem(KEY, JSON.stringify({ artist: 3, album: 'wide', title: 320, bpm: 99999, obsolete: 100 }));
  const view = renderHook(useLibraryColumnWidths);
  expect(view.result.current.widths).toEqual({ artist: 72, album: 100, title: 320, bpm: 1200, key: 152, analysis: 80, stems: 60 });
});
it('adopts another window’s widths without echoing, and remains usable when storage fails', () => {
  const view = renderHook(useLibraryColumnWidths);
  const write = vi.spyOn(localStorage, 'setItem').mockClear();
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: '{"artist":240}' })));
  expect(view.result.current.widths.artist).toBe(240);
  expect(write).not.toHaveBeenCalled();
  write.mockImplementation(() => { throw Error('quota'); });
  act(() => view.result.current.resize('artist', 280));
  expect(view.result.current.widths.artist).toBe(280);
});

it('ignores legacy Stems and Analysis overrides without losing other widths', () => {
  localStorage.setItem(KEY, JSON.stringify({ stems: 300, analysis: 420, title: 348, artist: 172 }));
  const view = renderHook(useLibraryColumnWidths);
  expect(view.result.current.widths).toMatchObject({ stems: 60, analysis: 80, title: 348, artist: 172 });
  act(() => view.result.current.resize('stems', 500));
  expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ stems: 60, analysis: 80, title: 348, artist: 172 });
});
