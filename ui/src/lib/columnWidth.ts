// Column widths for the grid.
//
// Live's LOM exposes no Session View column widths — `Track.View` is only
// selected_device / device_insert_mode / is_collapsed (arranger, not session),
// and the real widths live in the .als, which this project never parses. So
// they're ours to choose.
//
// One setting drives every track column rather than per-column dragging. The
// pixel presets are predictable; the viewport layouts divide the available
// grid width among either all rendered tracks, one 8-track hardware bank, or
// two banks. It moves the track columns only — the scene name is the row's
// label, and a setting about how many tracks fit shouldn't cost you the thing
// you read the rows by.

export type ColumnWidthPreset = 'm' | 'l';
export type ViewportColumnWidth = 'auto' | '8' | '16';
export type ColumnWidth = ColumnWidthPreset | ViewportColumnWidth;

/** In presentation order — the header control renders straight from this. */
export const COLUMN_WIDTHS: readonly ColumnWidth[] = [
  'm',
  'l',
  'auto',
  '8',
  '16',
] as const;

export const DEFAULT_COLUMN_WIDTH: ColumnWidth = 'm';

/**
 * The scene metadata and name column, px. Fixed, not a preset.
 *
 * The setting is about how many *tracks* fit on screen. A scene name is the
 * same length whatever that answer is, and shrinking the column to match `s`
 * only truncated names that were already the row's label — you lose the thing
 * you navigate by to gain one more track column. Its fixed width also keeps
 * the scene-number, BPM, key and role slots aligned in every mode.
 */
export const SCENE_COL_W = 316;

/**
 * The role chip that leads a scene name, px.
 *
 * Sized to its *content* rather than scaled with the grid: nine characters
 * covers nearly every role, and a wider chip is only more whitespace inside it.
 * Longer roles ellipsis.
 */
export const ROLE_CHIP_W = 62;

export interface ColumnMetrics {
  /** One track column, px. */
  col: number;
}

// `m` is the narrow width the grid shipped with. Narrower fixed columns make
// both clip names and mixer controls unusable, so the fixed presets begin here.
const METRICS: Record<ColumnWidthPreset, ColumnMetrics> = {
  m: { col: 74 },
  l: { col: 116 },
};

export function metricsFor(w: ColumnWidthPreset): ColumnMetrics {
  return METRICS[w];
}

/**
 * Total table width for `n` track columns, px. `table-layout: fixed` needs this
 * stated explicitly — see the note in ClipGrid/ClipGrid.css.
 *
 * border-spacing sits between every column *and* at both table edges, so n + 1
 * track columns (the scene column is the +1) means n + 2 gaps.
 */
export function tableWidth(
  w: ColumnWidthPreset,
  trackCount: number,
  spacing = 2,
): number {
  const m = metricsFor(w);
  return SCENE_COL_W + trackCount * m.col + (trackCount + 2) * spacing;
}

export interface ViewportColumnLayout {
  /** Width shared by every rendered track column. */
  col: number;
  /** Exact width of the full table, including columns beyond the viewport bank. */
  table: number;
}

export function isViewportColumnWidth(w: ColumnWidth): w is ViewportColumnWidth {
  return w === 'auto' || w === '8' || w === '16';
}

/**
 * Lay track columns out against the available grid viewport.
 *
 * Auto shares the width among the rendered tracks and stops at Narrow's 74px
 * readability floor. The 8/16 modes instead size one or two hardware banks
 * exactly; any tracks beyond that bank make the full table scroll.
 */
export function viewportColumnLayout(
  mode: ViewportColumnWidth,
  trackCount: number,
  availableWidth: number,
  spacing = 2,
): ViewportColumnLayout {
  const count = Math.max(0, Math.floor(trackCount));
  if (count === 0) return { col: METRICS.m.col, table: tableWidth('m', 0, spacing) };

  const target = mode === 'auto' ? count : Number(mode);
  const targetGutters = (target + 2) * spacing;
  const trackSpace = Math.max(0, availableWidth - SCENE_COL_W - targetGutters);
  const fitted = trackSpace / target;
  const col = mode === 'auto' ? Math.max(METRICS.m.col, fitted) : Math.max(1, fitted);
  return {
    col,
    table: SCENE_COL_W + count * col + (count + 2) * spacing,
  };
}

const KEY = 'bsv.columnWidth';

export function loadColumnWidth(): ColumnWidth {
  try {
    const v = localStorage.getItem(KEY);
    // Small was removed once the mixer controls outgrew a useful 44px track.
    // Preserve existing browser preferences by moving it to Narrow.
    if (v === 's') return 'm';
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
  return (
    v === 'm' || v === 'l' || v === 'auto' || v === '8' || v === '16'
  );
}
