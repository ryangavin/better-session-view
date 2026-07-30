import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipGrid, type CellClick } from './components/ClipGrid.js';
import { Inspector } from './components/Inspector.js';
import { useBridge } from './lib/useBridge.js';
import { clipKey, parseClipKey, toggle } from './lib/selection.js';
import { isLaunchModified, isTypingInto, LAUNCH_KEY } from './lib/keys.js';
import {
  COLUMN_WIDTHS,
  loadColumnWidth,
  saveColumnWidth,
  type ColumnWidth,
} from './lib/columnWidth.js';
import { render } from '../../core/src/pattern.js';
import { buildColumns } from '../../core/src/trackColumns.js';
import {
  cellsInBlock,
  moveActive,
  type ActiveCell,
  type Direction,
} from '../../core/src/gridRange.js';

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function App() {
  const bridge = useBridge();
  const { snapshot, play, launch, stop } = bridge;

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<ActiveCell | null>(null);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [pattern, setPattern] = useState('');
  const [columnWidth, setColumnWidth] = useState<ColumnWidth>(loadColumnWidth);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());

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

  // Same reasoning, for the same reason: Space reads it, and play state changes
  // several times a second, which would otherwise re-bind the key listener.
  const isPlayingRef = useRef(false);
  isPlayingRef.current = play.isPlaying;

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

  // Columns live here rather than in ClipGrid because keyboard movement needs
  // them too: stepping left or right walks the rendered column order, so a
  // collapsed group has to be invisible to the arrow keys as well as to the eye.
  const columns = useMemo(
    () => (snapshot ? buildColumns(snapshot.tracks, collapsed) : []),
    [snapshot, collapsed],
  );

  /** Just the visible track indexes, which is all the movement helpers need. */
  const trackColumns = useMemo(
    () => columns.flatMap((c) => (c.kind === 'track' ? [c.track.i] : [])),
    [columns],
  );

  // Lookup tables, not `.find()`. Block selection can hand op assembly thousands
  // of cells at once, and a linear scan per cell makes that O(n²) — enough to
  // lock the tab up on a real set.
  const clips = useMemo(
    () => new Map(snapshot?.clips.map((c) => [clipKey(c.t, c.s), c]) ?? []),
    [snapshot],
  );
  const trackNames = useMemo(
    () => new Map(snapshot?.tracks.map((t) => [t.i, t.name]) ?? []),
    [snapshot],
  );
  const sceneNames = useMemo(
    () => new Map(snapshot?.scenes.map((s) => [s.i, s.name]) ?? []),
    [snapshot],
  );
  const isOccupied = useCallback(
    (c: { t: number; s: number }) => clips.has(clipKey(c.t, c.s)),
    [clips],
  );

  const chooseColumnWidth = useCallback((w: ColumnWidth) => {
    setColumnWidth(w);
    saveColumnWidth(w);
  }, []);

  const onToggleGroup = useCallback((trackIndex: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(trackIndex)) next.add(trackIndex);
      return next;
    });
  }, []);

  // --- selection -------------------------------------------------------
  // Plain click replaces, shift extends a block from the active cell, ⌥ toggles.
  // ⌥ rather than the usual ⌘ because ⌘ means "fire this" everywhere in the app.
  //
  // Blocks only ever pick up cells that hold a clip. An empty slot has no name
  // and no color, so sweeping over 4,000 of them would make the Selected count
  // a lie and hand `apply` thousands of ops it can only skip.

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

      const from = activeRef.current;
      if (m.add) {
        setSelected((prev) => toggle(prev, clipKey(t, s)));
        goActive({ on: 'clip', t, s });
        return;
      }
      if (m.extend && from?.on === 'clip') {
        selectCells(cellsInBlock(trackColumns, from, { t, s }, isOccupied), false);
        return;
      }
      selectCells([{ t, s }], false);
      goActive({ on: 'clip', t, s });
    },
    [goActive, isOccupied, launch, selectCells, trackColumns],
  );

  const onScene = useCallback(
    (s: number, m: CellClick) => {
      if (m.launch) return launch({ kind: 'scene', s });

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
              { t: trackColumns[0]!, s: firstScene },
              { t: trackColumns[trackColumns.length - 1]!, s },
              isOccupied,
            )
          : [],
        m.add,
      );
      if (!m.extend) goActive({ on: 'scene', s });
    },
    [goActive, isOccupied, launch, selectCells, trackColumns],
  );

  const onFireScene = useCallback((s: number) => launch({ kind: 'scene', s }), [launch]);
  const onStopTrack = useCallback((t: number) => stop({ kind: 'track', t }), [stop]);

  // --- keyboard --------------------------------------------------------

  const fireActive = useCallback(
    (at: ActiveCell) => {
      if (at.on === 'scene') launch({ kind: 'scene', s: at.s });
      else launch({ kind: 'clip', t: at.t, s: at.s });
    },
    [launch],
  );

  const sceneCount = snapshot?.sceneCount ?? 0;

  useEffect(() => {
    if (sceneCount === 0) return;

    function onKey(e: KeyboardEvent) {
      if (isTypingInto(e.target)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        stop({ kind: 'clips' });
        return;
      }
      // Live's own binding, and the one everybody has in muscle memory.
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlayingRef.current) stop({ kind: 'song' });
        else launch({ kind: 'song' });
        return;
      }

      const from = activeRef.current;
      const d = ARROWS[e.key];
      if (d) {
        e.preventDefault(); // or the grid scrolls as well as moving
        // With nothing active yet, the first arrow press places the cell rather
        // than moving it — otherwise ↓ from nowhere skips scene 1.
        const next = from === null
          ? ({ on: 'scene', s: 0 } as ActiveCell)
          : moveActive(trackColumns, sceneCount, from, d);
        goActive(next);
        // ⌘ + arrow is the sweep: one keystroke for "next thing, and let me
        // hear it". Unmodified arrows stay silent, per the rule.
        if (isLaunchModified(e)) fireActive(next);
        return;
      }

      if (e.key === 'Enter' && isLaunchModified(e) && from) {
        e.preventDefault();
        fireActive(from);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fireActive, goActive, launch, sceneCount, stop, trackColumns]);

  // Keep the active cell on screen. Read out of the DOM rather than threading a
  // ref down: Row is memoized and a fresh ref callback per render would
  // re-render all 848 rows, which is the one thing the grid can't afford.
  useEffect(() => {
    if (!active) return;
    document
      .querySelector('[data-active="1"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  // Token values for one clip. Song/role tokens land with segmentation; until
  // then they resolve to nothing, which render() drops cleanly.
  const valuesFor = useCallback(
    (t: number, s: number, n: number) => ({
      track: trackNames.get(t),
      scene: sceneNames.get(s),
      name: clips.get(clipKey(t, s))?.name,
      n,
    }),
    [clips, sceneNames, trackNames],
  );

  const ops = useMemo<BSV.ApplyOp[]>(() => {
    const keys = [...selected];
    return keys
      .map((key, i) => {
        const { t, s } = parseClipKey(key);
        const op: BSV.ApplyOp = { t, s };
        if (chosenIndex !== null) op.colorIndex = chosenIndex;
        if (pattern.trim()) op.name = render(pattern, valuesFor(t, s, i + 1));
        return op;
      })
      .filter((op) => op.colorIndex !== undefined || op.name !== undefined);
  }, [selected, chosenIndex, pattern, valuesFor]);

  const preview = useMemo(() => {
    if (!pattern.trim() || selected.size === 0) return null;
    const { t, s } = parseClipKey([...selected][0]!);
    return render(pattern, valuesFor(t, s, 1));
  }, [pattern, selected, valuesFor]);

  const statusPill = (label: string, ok: boolean) => (
    <div className={`pill ${ok ? 'on' : 'off'}`}>{label}</div>
  );

  return (
    <>
      <header>
        <div className="title">Session Bridge</div>
        {statusPill(bridge.connection, bridge.connection === 'open')}
        {statusPill(bridge.lomReady ? 'lom ready' : 'lom waiting', bridge.lomReady)}

        <div className="playback" role="group" aria-label="Playback">
          <button
            type="button"
            className={play.isPlaying ? 'rolling' : undefined}
            title="Start the song (Space)"
            disabled={!bridge.lomReady}
            onClick={() => launch({ kind: 'song' })}
          >
            ▶
          </button>
          <button
            type="button"
            title="Stop the song (Space)"
            disabled={!bridge.lomReady}
            onClick={() => stop({ kind: 'song' })}
          >
            ■
          </button>
          <button
            type="button"
            title="Stop all clips, keep the song rolling (Esc)"
            disabled={!bridge.lomReady}
            onClick={() => stop({ kind: 'clips' })}
          >
            stop clips
          </button>
        </div>

        <div className="spacer" />
        <div className="widths" role="group" aria-label="Column width">
          {COLUMN_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={w === columnWidth ? 'on' : undefined}
              aria-pressed={w === columnWidth}
              onClick={() => chooseColumnWidth(w)}
            >
              {w.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="primary"
          onClick={bridge.refresh}
          disabled={!bridge.lomReady || bridge.busy}
        >
          Snapshot
        </button>
      </header>

      <div className="stats">
        <Stat k="Tracks" v={snapshot?.trackCount} />
        <Stat k="Scenes" v={snapshot?.sceneCount} />
        <Stat k="Clips" v={snapshot?.clipCount} />
        <Stat k="LOM walk" v={snapshot ? `${snapshot.ms}ms` : undefined} highlight />
        <Stat k="Slot scan" v={snapshot ? `${snapshot.timings.slots}ms` : undefined} />
        <Stat k="Selected" v={selected.size} />
        <div className="spacer" />
        <div className="keyhint">
          <b>{LAUNCH_KEY}</b>-click / <b>{LAUNCH_KEY}</b>-↑↓ fires · <b>⇧</b> extends ·{' '}
          <b>⌥</b> adds · <b>esc</b> stops clips
        </div>
      </div>

      <main>
        <div className="grid-wrap">
          {snapshot ? (
            <ClipGrid
              snapshot={snapshot}
              columns={columns}
              clips={clips}
              selected={selected}
              active={active}
              play={play}
              columnWidth={columnWidth}
              onClip={onClip}
              onScene={onScene}
              onFireScene={onFireScene}
              onStopTrack={onStopTrack}
              onToggleGroup={onToggleGroup}
            />
          ) : (
            <div className="empty">
              Load the device in Live, then hit <b>Snapshot</b>.
            </div>
          )}
        </div>

        <Inspector
          palette={bridge.palette}
          chosenIndex={chosenIndex}
          onChooseIndex={setChosenIndex}
          pattern={pattern}
          onPattern={setPattern}
          selectedCount={selected.size}
          preview={preview}
          busy={bridge.busy}
          progress={bridge.progress}
          onApply={() => void bridge.apply(ops)}
          onClear={() => setSelected(new Set())}
          onExtractPalette={() => void bridge.extractPalette()}
        />
      </main>

      <footer>
        {bridge.log.map((l) => (
          <div key={l.id} className={`log-line ${l.kind}`}>
            {l.text}
          </div>
        ))}
      </footer>
    </>
  );
}

function Stat({
  k,
  v,
  highlight,
}: {
  k: string;
  v: string | number | undefined;
  highlight?: boolean;
}) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v${highlight ? ' hl' : ''}`}>{v ?? '—'}</div>
    </div>
  );
}

export { clipKey };
