import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildColumns } from '../../../core/src/trackColumns.js';

/**
 * The rendered column order, and which track groups are collapsed.
 *
 * Columns live here rather than in ClipGrid because keyboard movement needs
 * them too: stepping left or right walks the rendered column order, so a
 * collapsed group has to be invisible to the arrow keys as well as to the eye.
 */
export function useTrackColumns(snapshot: BSV.Snapshot | null) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());

  // Seed the collapsed groups from Live's own fold state on every snapshot; a
  // snapshot is a resync with Live, so it wins over local toggles made since
  // the last one. Collapsing here never writes back — LOM writes don't
  // participate in Live's undo, and this is a view operation.
  useEffect(() => {
    if (!snapshot) return;
    setCollapsed(
      new Set(snapshot.tracks.filter((t) => t.isGroup && t.isFolded).map((t) => t.i)),
    );
  }, [snapshot]);

  const columns = useMemo(
    () => (snapshot ? buildColumns(snapshot.tracks, collapsed) : []),
    [snapshot, collapsed],
  );

  /** Just the visible track indexes, which is all the movement helpers need. */
  const trackColumns = useMemo(
    () => columns.flatMap((c) => (c.kind === 'track' ? [c.track.i] : [])),
    [columns],
  );

  const onToggleGroup = useCallback((trackIndex: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(trackIndex)) next.add(trackIndex);
      return next;
    });
  }, []);

  return { columns, trackColumns, onToggleGroup };
}
