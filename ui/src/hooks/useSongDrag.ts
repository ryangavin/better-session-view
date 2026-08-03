import { useCallback, useMemo, useRef, useState } from 'react';
import { planSceneMove } from '../../../core/src/sceneMove.js';
import type { BridgeState } from './useBridge.js';

/**
 * Drag a song header to move that whole run of scenes somewhere else.
 *
 * **A drag moves one block, not one song.** A song is a label rather than a
 * range, so it can appear in several runs, and each run has its own header —
 * dragging the header for "part 2 of 2" has to move the part you grabbed.
 * Gathering both runs is a thing `planSceneMove` supports and a thing you can
 * do by dragging one next to the other; doing it as a silent side effect of
 * grabbing one header would move sixty scenes nobody pointed at.
 *
 * This is the only gesture in the app that can destroy work — see
 * core/src/sceneMove.ts. Everything the grid does otherwise is either a view
 * change or a write our own undo reverses.
 */
export function useSongDrag(
  snapshot: BSV.Snapshot | null,
  clearSelection: () => void,
  moveScenes: BridgeState['moveScenes'],
) {
  const [dragBlock, setDragBlock] = useState<{ from: number; to: number } | null>(null);
  /** Where the block would land, as a gap in the current scene numbering. */
  const [dropAt, setDropAt] = useState<number | null>(null);

  const onSongDragStart = useCallback((from: number, to: number) => {
    setDragBlock({ from, to });
    setDropAt(null);
  }, []);

  const onSongDragEnd = useCallback(() => {
    setDragBlock(null);
    setDropAt(null);
  }, []);

  /**
   * `dragover` fires continuously — many times a second, for the whole drag.
   *
   * The identity bail-out is what makes that affordable: the gap only changes
   * when the pointer crosses a boundary, and returning `prev` unchanged lets
   * React skip the render entirely. Without it every mouse move would rebuild
   * all 848 rows' elements.
   */
  const onSongDragOver = useCallback((from: number, to: number, below: boolean) => {
    const gap = below ? to + 1 : from;
    setDropAt((prev) => (prev === gap ? prev : gap));
  }, []);

  const movePlan = useMemo(() => {
    if (!snapshot || !dragBlock || dropAt === null) return null;
    const sources: number[] = [];
    for (let s = dragBlock.from; s <= dragBlock.to; s++) sources.push(s);
    return planSceneMove({
      sceneCount: snapshot.sceneCount,
      sources,
      dest: dropAt,
      clips: snapshot.clips,
      tracks: snapshot.tracks,
    });
  }, [snapshot, dragBlock, dropAt]);

  /**
   * The plan also lives in a ref, and this is not a micro-optimisation.
   *
   * `onSongDrop` is a prop on the memoized `SongHeaderRow`. Closing over
   * `movePlan` would give it a new identity every time the drop gap changes —
   * which is every time the pointer crosses a song boundary — and re-render all
   * hundred headers mid-drag. Same reason `active` and `play.isPlaying` are held
   * in refs; see the note on `Row` in ui/README.md.
   */
  const movePlanRef = useRef(movePlan);
  movePlanRef.current = movePlan;

  const onSongDrop = useCallback(() => {
    const plan = movePlanRef.current;
    // Clear first. The move re-snapshots, and leaving a drop indicator pointing
    // at a scene index that no longer means the same thing is worse than a
    // frame of nothing.
    setDragBlock(null);
    setDropAt(null);
    if (!plan) return;
    // Selection is addressed by (track, scene), and every one of those indexes
    // is about to mean a different row. Keeping it would leave the rail offering
    // to rename scenes the user never picked.
    clearSelection();
    void moveScenes(plan, `move ${plan.scenes} scene${plan.scenes === 1 ? '' : 's'}`);
  }, [clearSelection, moveScenes]);

  return {
    /** First scene of the block being dragged, or -1 — a primitive for the header row. */
    dragFrom: dragBlock?.from ?? -1,
    dropAt,
    movePlan,
    onSongDragStart,
    onSongDragOver,
    onSongDrop,
    onSongDragEnd,
  };
}
