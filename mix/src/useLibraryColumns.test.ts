// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLibraryColumns } from './useLibraryColumns.ts';
import { columnsFrom } from './listing.ts';
import { remember } from './remember.ts';

const KEY = 'mixflow.library-columns.v1';
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { stored.set(key, value); }) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('saves a drop immediately and restores it on reopen despite a stale session write', () => {
  vi.useFakeTimers();
  try {
    const first = renderHook(() => useLibraryColumns(undefined));
    act(() => first.result.current.dropColumn('stems', 'artist'));
    const wanted = ['stems', 'artist', 'album', 'title', 'bpm', 'key', 'analysis'];
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(wanted);
    first.unmount(); // No debounce timer gets a chance to fire.
    remember({ columns: columnsFrom(undefined), selected: 'another-window' });
    const reopened = renderHook(() => useLibraryColumns(columnsFrom(undefined)));
    expect(reopened.result.current.columns).toEqual(wanted);
  } finally { vi.useRealTimers(); }
});

it('migrates valid legacy positions, deduplicates them and adds new fields without resetting order', () => {
  const view = renderHook(() => useLibraryColumns(['title', 'obsolete', 'title', 'analysis', 'artist']));
  const wanted = ['title', 'analysis', 'stems', 'artist', 'album', 'bpm', 'key'];
  expect(view.result.current.columns).toEqual(wanted);
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(wanted);
});

it('keeps consecutive keyboard moves even before React renders again', () => {
  const view = renderHook(() => useLibraryColumns(undefined));
  act(() => {
    view.result.current.reorderColumn('title', -1);
    view.result.current.reorderColumn('title', -1);
  });
  expect(view.result.current.columns.slice(0, 3)).toEqual(['title', 'artist', 'album']);
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(view.result.current.columns);
});

it('adopts another same-origin window’s saved order without echoing a storage write', () => {
  const view = renderHook(() => useLibraryColumns(undefined));
  const write = vi.spyOn(localStorage, 'setItem').mockClear();
  const next = ['bpm', 'key', 'stems', 'analysis', 'title', 'album', 'artist'];
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify(next) })));
  expect(view.result.current.columns).toEqual(next);
  expect(write).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: '{' })));
  expect(view.result.current.columns).toEqual(next);
});

it('keeps the UI usable when storage writes fail', () => {
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const view = renderHook(() => useLibraryColumns(undefined));
  act(() => view.result.current.dropColumn('title', 'artist'));
  expect(view.result.current.columns[0]).toBe('title');
});
