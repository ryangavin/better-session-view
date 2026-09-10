import { useCallback, useEffect, useRef, useState } from 'react';
import { columnsFrom, moveColumn, placeColumn, type Column } from './listing.ts';

const KEY = 'mixflow.library-columns.v1';

function read(saved: string | null): Column[] | null {
  try {
    const parsed: unknown = saved === null ? null : JSON.parse(saved);
    return Array.isArray(parsed) ? columnsFrom(parsed) : null;
  } catch { return null; }
}

/** Column moves are discrete preferences, independent of the debounced audio session. */
export function useLibraryColumns(legacy: unknown) {
  const [columns, setColumns] = useState(() => {
    try { return read(localStorage.getItem(KEY)) ?? columnsFrom(legacy); }
    catch { return columnsFrom(legacy); }
  });
  const current = useRef(columns);
  const change = useCallback((move: (columns: Column[]) => Column[]) => {
    const next = move(current.current);
    current.current = next;
    // Save before returning from the drop/key handler, even if the app closes next.
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { /* Storage may be unavailable; the controls still work in this window. */ }
    setColumns(next);
  }, []);
  const reorderColumn = useCallback((column: Column, step: -1 | 1) =>
    change(was => moveColumn(was, column, step)), [change]);
  const dropColumn = useCallback((column: Column, target: Column) =>
    change(was => placeColumn(was, column, target)), [change]);

  useEffect(() => {
    // Migrate the legacy order once; never replace a preference another window saved.
    try {
      const stored = read(localStorage.getItem(KEY));
      if (stored) {
        current.current = stored;
        setColumns(stored);
      } else localStorage.setItem(KEY, JSON.stringify(current.current));
    } catch { /* Same in-memory fallback as a failed move write. */ }
    const changed = (event: StorageEvent) => {
      if (event.key !== KEY) return;
      const next = read(event.newValue);
      if (!next) return;
      current.current = next;
      setColumns(next);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  return { columns, reorderColumn, dropColumn };
}
