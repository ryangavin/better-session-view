import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cellsInBlock, type ActiveCell } from '../../../core/src/gridRange.js';
import { clipKey, toggle } from '../lib/selection.js';
import type { CellClick } from '../lib/keys.js';
import type { BridgeState } from './useBridge.js';

/** One identity, so clearing an already-empty scene selection changes nothing. */
const EMPTY_SCENES: ReadonlySet<number> = new Set();

interface Args {
  trackColumns: number[];
  /** Visible scene indexes — see useSongLayout. */
  rows: number[];
  isOccupied: (c: { t: number; s: number }) => boolean;
  launch: BridgeState['launch'];
  stop: BridgeState['stop'];
  openRail: () => void;
}

/**
 * The clip selection, the scene selection, and the active cell.
 *
 * Plain click replaces, shift extends a block from the active cell, ⌥ toggles.
 * ⌥ rather than the usual ⌘ because ⌘ means "fire this" everywhere in the app.
 *
 * Blocks only ever pick up cells that hold a clip. An empty slot has no name
 * and no color, so sweeping over 4,000 of them would make the Selected count
 * a lie and hand `apply` thousands of ops it can only skip.
 */
export function useGridSelection({
  trackColumns,
  rows,
  isOccupied,
  launch,
  stop,
  openRail,
}: Args) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Scenes selected *as scenes*, which is not the same as "the scenes the clip
  // selection touches" and can't be derived from it: a scene with no clips
  // contributes no cells, and it still needs to be assignable a role. Set only
  // by the scene-name column, and cleared by a clip click, so "which scenes am
  // I about to tag" is never a guess.
  const [selectedScenes, setSelectedScenes] = useState<ReadonlySet<number>>(new Set());
  const [active, setActive] = useState<ActiveCell | null>(null);

  // The active cell is read by the grid's click handlers and by the keyboard
  // effect, and it moves constantly. Keeping it out of their dependency arrays
  // is not a micro-optimisation: `onClip` is a prop on a memoized Row, so a new
  // identity for it re-renders all 848 scenes on every arrow press. The ref is
  // written by `goActive` rather than during render so two keystrokes in one
  // frame can't both read the same stale value.
  const activeRef = useRef<ActiveCell | null>(null);
  const goActive = useCallback((next: ActiveCell | null) => {
    activeRef.current = next;
    setActive(next);
  }, []);

  const selectCells = useCallback(
    (cells: Array<{ t: number; s: number }>, add: boolean) => {
      const keys = cells.map((c) => clipKey(c.t, c.s));
      setSelected((prev) => (add ? new Set([...prev, ...keys]) : new Set(keys)));
    },
    [],
  );

  const onClip = useCallback(
    (t: number, s: number, m: CellClick) => {
      if (m.launch) return launch({ kind: 'clip', t, s });
      openRail();

      const from = activeRef.current;
      setSelectedScenes(EMPTY_SCENES);
      if (m.add) {
        setSelected((prev) => toggle(prev, clipKey(t, s)));
        goActive({ on: 'clip', t, s });
        return;
      }
      if (m.extend && from?.on === 'clip') {
        selectCells(cellsInBlock(trackColumns, rows, from, { t, s }, isOccupied), false);
        return;
      }
      selectCells([{ t, s }], false);
      goActive({ on: 'clip', t, s });
    },
    [goActive, isOccupied, launch, openRail, rows, selectCells, trackColumns],
  );

  const onScene = useCallback(
    (s: number, m: CellClick) => {
      if (m.launch) return launch({ kind: 'scene', s });
      openRail();

      // The scene name column selects the whole row — every clip in the scene,
      // which is the unit bulk work actually operates on. Shift extends that
      // over a run of scenes.
      const from = activeRef.current;
      const firstScene = m.extend && from?.on === 'scene' ? from.s : s;
      const wide = trackColumns.length > 0;
      selectCells(
        wide
          ? cellsInBlock(
              trackColumns,
              rows,
              { t: trackColumns[0]!, s: firstScene },
              { t: trackColumns[trackColumns.length - 1]!, s },
              isOccupied,
            )
          : [],
        m.add,
      );
      // Scene selection tracks the same gesture but is kept independently, and
      // spans the whole range rather than only the scenes that held a clip —
      // an empty scene still has a name to tag. It walks the visible rows for
      // the same reason the block does: a collapsed song between the endpoints
      // must not be swept up and renamed.
      const lo = Math.min(firstScene, s);
      const hi = Math.max(firstScene, s);
      const run = rows.filter((i) => i >= lo && i <= hi);
      setSelectedScenes((prev) => (m.add ? new Set([...prev, ...run]) : new Set(run)));
      if (!m.extend) goActive({ on: 'scene', s });
    },
    [goActive, isOccupied, launch, openRail, rows, selectCells, trackColumns],
  );

  const onFireScene = useCallback((s: number) => launch({ kind: 'scene', s }), [launch]);
  // A group track's slot, fired by position like any other. It holds no clip
  // of its own — Live fires everything the group has in that scene. Nothing is
  // selected on the way: a group slot is not a cell you can name or color.
  const onFireGroup = useCallback(
    (t: number, s: number) => launch({ kind: 'clip', t, s }),
    [launch],
  );
  const onStopTrack = useCallback((t: number) => stop({ kind: 'track', t }), [stop]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectedScenes(EMPTY_SCENES);
  }, []);

  const sceneList = useMemo(
    () => [...selectedScenes].sort((a, b) => a - b),
    [selectedScenes],
  );

  /** Select a whole run of scenes — every clip they hold, plus the scenes themselves. */
  const pickScenes = useCallback(
    (scenes: number[]) => {
      openRail();
      setSelectedScenes(new Set(scenes));
      selectCells(
        trackColumns.length > 0
          ? scenes.flatMap((s) =>
              trackColumns.flatMap((t) => (isOccupied({ t, s }) ? [{ t, s }] : [])),
            )
          : [],
        false,
      );
      if (scenes.length > 0) goActive({ on: 'scene', s: scenes[0]! });
    },
    [goActive, isOccupied, openRail, selectCells, trackColumns],
  );

  // Keep the active cell on screen. Read out of the DOM rather than threading a
  // ref down: Row is memoized and a fresh ref callback per render would
  // re-render all 848 rows, which is the one thing the grid can't afford.
  useEffect(() => {
    if (!active) return;
    document
      .querySelector('[data-active="1"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  return {
    selected,
    selectedScenes,
    sceneList,
    active,
    activeRef,
    goActive,
    onClip,
    onScene,
    onFireScene,
    onFireGroup,
    onStopTrack,
    clearSelection,
    pickScenes,
  };
}
