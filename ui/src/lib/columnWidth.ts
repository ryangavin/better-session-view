// Column widths for the grid.
//
// Live's LOM exposes no Session View column widths — `Track.View` is only
// selected_device / device_insert_mode / is_collapsed (arranger, not session),
// and the real widths live in the .als, which this project never parses. So
// they're ours to choose.
//
// One setting drives every column rather than per-column dragging: the point of
// `s` is fitting a wide set on screen at once, which per-column widths actively
// work against.

export type ColumnWidth = 's' | 'm' | 'l';

/** In presentation order — the header control renders straight from this. */
export const COLUMN_WIDTHS: readonly ColumnWidth[] = ['s', 'm', 'l'] as const;

export const DEFAULT_COLUMN_WIDTH: ColumnWidth = 'm';

export interface ColumnMetrics {
  /** One track column, px. */
  col: number;
  /** The scene name column, px. */
  scene: number;
}

// `m` is the width the grid shipped with. `s` is sized so ~26 tracks fit in a
// 1100px viewport; below about 36px a clip name is unreadable and the cell may
// as well be a color chip.
const METRICS: Record<ColumnWidth, ColumnMetrics> = {
  s: { col: 40, scene: 130 },
  m: { col: 74, scene: 210 },
  l: { col: 116, scene: 290 },
};

export function metricsFor(w: ColumnWidth): ColumnMetrics {
  return METRICS[w];
}

/**
 * Total table width for `n` track columns, px. `table-layout: fixed` needs this
 * stated explicitly — see the note in styles.css.
 *
 * border-spacing sits between every column *and* at both table edges, so n + 1
 * track columns (the scene column is the +1) means n + 2 gaps.
 */
export function tableWidth(w: ColumnWidth, trackCount: number, spacing = 2): number {
  const m = metricsFor(w);
  return m.scene + trackCount * m.col + (trackCount + 2) * spacing;
}

const KEY = 'bsv.columnWidth';

export function loadColumnWidth(): ColumnWidth {
  try {
    const v = localStorage.getItem(KEY);
    return isColumnWidth(v) ? v : DEFAULT_COLUMN_WIDTH;
  } catch {
    return DEFAULT_COLUMN_WIDTH;
  }
}

export function saveColumnWidth(w: ColumnWidth): void {
  try {
    localStorage.setItem(KEY, w);
  } catch {
    // Storage can be unavailable (private windows, embedded webviews). A width
    // that doesn't persist is not worth failing a render over.
  }
}

function isColumnWidth(v: unknown): v is ColumnWidth {
  return v === 's' || v === 'm' || v === 'l';
}
