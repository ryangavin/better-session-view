import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_COLUMNS, type Column } from './listing.ts';

export const COLUMN_SIZES: Record<Column, { default: number; min: number }> = {
  artist: { default: 100, min: 72 }, album: { default: 100, min: 72 },
  title: { default: 216, min: 120 }, bpm: { default: 64, min: 64 },
  key: { default: 152, min: 80 }, analysis: { default: 80, min: 80 },
  stems: { default: 60, min: 60 },
};
export const isResizableColumn = (column: Column) => column !== 'stems' && column !== 'analysis';
export const COLUMN_MAX = 1200;
const KEY = 'mixflow.library-column-widths.v1';
type Widths = Record<Column, number>;
export const columnWidth = (column: Column, value: number) =>
  isResizableColumn(column) && Number.isFinite(value) ? Math.round(Math.max(COLUMN_SIZES[column].min, Math.min(COLUMN_MAX, value))) : COLUMN_SIZES[column].default;
function read(raw: string | null): Widths {
  let saved: Record<string, unknown> = {};
  try { const value = JSON.parse(raw ?? '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) saved = value; } catch { /* Defaults repair invalid storage. */ }
  return Object.fromEntries(DEFAULT_COLUMNS.map(column => [column,
    typeof saved[column] === 'number' ? columnWidth(column, saved[column]) : COLUMN_SIZES[column].default])) as Widths;
}

/** Stable IDs preserve widths when columns move; missing/new columns receive their defaults. */
export function useLibraryColumnWidths() {
  const [widths, setWidths] = useState(() => {
    try { return read(localStorage.getItem(KEY)); } catch { return read(null); }
  });
  const current = useRef(widths);
  const resize = useCallback((column: Column, value: number) => {
    const next = { ...current.current, [column]: columnWidth(column, value) };
    current.current = next;
    // A close immediately after pointerup or a key press must not lose the preference.
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Keep resizing usable without storage. */ }
    setWidths(next);
  }, []);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== KEY) return;
      const next = read(event.newValue);
      current.current = next;
      setWidths(next);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  return { widths, resize };
}
