import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildColumns } from '../../../core/src/trackColumns.js';
import type { BridgeState } from './useBridge.js';

/**
 * The rendered column order, and which track groups are folded.
 *
 * Columns live here rather than in ClipGrid because keyboard movement needs
 * them too: stepping left or right walks the rendered column order, so a
 * folded group's members have to be invisible to the arrow keys as well as to
 * the eye.
 */
export function useTrackColumns(snapshot: BSV.Snapshot | null, setFold: BridgeState['setFold']) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());

  // Seed the folded groups from Live's own fold state on every snapshot; a
  // snapshot is a resync with Live, so it wins over local toggles made since
  // the last one. That's only safe because toggling writes back — before it
  // did, every write silently undid whatever you had folded.
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

  /**
   * Just the visible *non-group* track indexes, which is all the movement and
   * selection helpers need. A group column is deliberately absent: its slots
   * hold no clip, so there is nothing there to select, name or color, and the
   * arrow keys step over it the way they step over a folded group's members.
   */
  const trackColumns = useMemo(
    () => columns.flatMap((c) => (c.kind === 'track' ? [c.track.i] : [])),
    [columns],
  );

  // Local state moves first and Live is told after: this redraws columns, and
  // waiting a round trip to redraw a fold you just clicked is the one place
  // that would feel slow. If Live rejects it, the next snapshot puts it back.
  //
  // The message is sent out here rather than from inside the updater, which
  // has to stay pure — StrictMode runs updaters twice, and a send in there
  // would fold Live, unfold it, and leave the grid disagreeing with the set.
  const onToggleGroup = useCallback(
    (trackIndex: number) => {
      const folded = !collapsed.has(trackIndex);
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (folded) next.add(trackIndex);
        else next.delete(trackIndex);
        return next;
      });
      setFold(trackIndex, folded);
    },
    [collapsed, setFold],
  );

  return { columns, trackColumns, onToggleGroup };
}
