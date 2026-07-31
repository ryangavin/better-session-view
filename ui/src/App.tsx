import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipGrid, type CellClick } from './components/ClipGrid.js';
import { Inspector } from './components/Inspector.js';
import { ScenePanel } from './components/ScenePanel.js';
import { SongsModal } from './components/SongsModal.js';
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
import { colorOps } from '../../core/src/ops.js';
import { buildColumns } from '../../core/src/trackColumns.js';
import {
  findRole,
  mergeVocabulary,
  roleIn,
  roleKey,
  roleOps,
  rolesInUse,
  sceneColorOps,
  sceneFields,
} from '../../core/src/roles.js';
import {
  commonTitle,
  titleOf,
  titleOps,
  type TitlePatch,
} from '../../core/src/sceneTitle.js';
import { compilePattern, DEFAULT_SCENE_PATTERN } from '../../core/src/namePattern.js';
import { derive } from '../../core/src/derive.js';
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

/** One identity, so clearing an already-empty scene selection changes nothing. */
const EMPTY_SCENES: ReadonlySet<number> = new Set();

/**
 * The scene pattern, until the scheme file lands and makes it editable.
 *
 * Compiled once at module scope: it never changes yet, and the compile runs a
 * round-trip probe. `!` is safe here and nowhere else — this exact pattern has
 * a test asserting it compiles.
 */
const SCENE_PATTERN = compilePattern(DEFAULT_SCENE_PATTERN)!;

export function App() {
  const bridge = useBridge();
  const { snapshot, play, launch, stop, apply, applyScenes, undo } = bridge;

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Scenes selected *as scenes*, which is not the same as "the scenes the clip
  // selection touches" and can't be derived from it: a scene with no clips
  // contributes no cells, and it still needs to be assignable a role. Set only
  // by the scene-name column, and cleared by a clip click, so "which scenes am
  // I about to tag" is never a guess.
  const [selectedScenes, setSelectedScenes] = useState<ReadonlySet<number>>(new Set());
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
      setSelectedScenes(EMPTY_SCENES);
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
      // Scene selection tracks the same gesture but is kept independently, and
      // spans the whole range rather than only the scenes that held a clip —
      // an empty scene still has a name to tag.
      const lo = Math.min(firstScene, s);
      const hi = Math.max(firstScene, s);
      const run: number[] = [];
      for (let i = lo; i <= hi; i++) run.push(i);
      setSelectedScenes((prev) => (m.add ? new Set([...prev, ...run]) : new Set(run)));
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
        return;
      }

      // ⌘Z is not a grid gesture, so it doesn't fight the "⌘ makes a sound" rule
      // — and it's the only undo there is, since LOM writes never reach Live's
      // own history. Guarded by isTypingInto above, so the rename field keeps its
      // own undo.
      if ((e.key === 'z' || e.key === 'Z') && isLaunchModified(e)) {
        e.preventDefault();
        void undo();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fireActive, goActive, launch, sceneCount, stop, trackColumns, undo]);

  // Keep the active cell on screen. Read out of the DOM rather than threading a
  // ref down: Row is memoized and a fresh ref callback per render would
  // re-render all 848 rows, which is the one thing the grid can't afford.
  useEffect(() => {
    if (!active) return;
    document
      .querySelector('[data-active="1"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  // --- roles -----------------------------------------------------------
  // Stored in the scene's own name as `[role]` — see core/src/roles.ts for why
  // the set is the storage and why the tag is bracketed.

  const scenesForOps = useMemo(() => sceneFields(snapshot?.scenes ?? []), [snapshot]);

  /** Roles actually tagged somewhere in the set, in order of first appearance. */
  const inUseRoles = useMemo(
    () => rolesInUse(snapshot?.scenes.map((sc) => sc.name) ?? []),
    [snapshot],
  );
  const inUseKeys = useMemo(() => new Set(inUseRoles.map(roleKey)), [inUseRoles]);

  // Configured roles plus anything tagged in the set but never configured. A
  // vocabulary that only listed what someone remembered to configure would hide
  // a role typed straight into Live and then fail to color it for no visible
  // reason.
  const vocabulary = useMemo(
    () => mergeVocabulary(bridge.roles, inUseRoles),
    [bridge.roles, inUseRoles],
  );

  /**
   * roleKey → the RGB its chip is painted. Memoized because it reaches the
   * memoized `Row`: a fresh Map every render would re-render all 848 scenes.
   * It changes only when the vocabulary or the palette does, which is rare.
   */
  const roleColors = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of vocabulary) {
      const rgb = r.colorIndex >= 0 ? bridge.palette[r.colorIndex] : undefined;
      if (rgb !== undefined) m.set(roleKey(r.name), rgb);
    }
    return m;
  }, [bridge.palette, vocabulary]);

  const sceneList = useMemo(
    () => [...selectedScenes].sort((a, b) => a - b),
    [selectedScenes],
  );

  // The mapping, read back out of the set — see core/src/derive.ts. Nothing is
  // stored for this: which scene belongs to which song falls out of the names.
  const derivation = useMemo(
    () => derive(snapshot?.scenes ?? [], SCENE_PATTERN),
    [snapshot],
  );
  const [showSongs, setShowSongs] = useState(false);

  const pickScenes = useCallback(
    (scenes: number[]) => {
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
      setShowSongs(false);
    },
    [goActive, isOccupied, selectCells, trackColumns],
  );

  // --- scene titles ----------------------------------------------------
  // `{song} {bpm} {key}`, everything in the name before the role tag.

  /** Which title fields have been edited — see TitlePatch in core. */
  const [titlePatch, setTitlePatch] = useState<TitlePatch>({});

  // Reset the edits when the selection changes, or a song name typed for one
  // song would sit in the field waiting to be applied to the next one.
  const selectionKey = sceneList.join(',');
  useEffect(() => {
    setTitlePatch({});
  }, [selectionKey]);

  /** What the selected scenes agree on, per field. Null where they differ. */
  const commonFields = useMemo(
    () => commonTitle(sceneList.map((s) => titleOf(sceneNames.get(s) ?? ''))),
    [sceneList, sceneNames],
  );

  const sceneNameOps = useMemo(
    () => titleOps(scenesForOps, sceneList, titlePatch),
    [sceneList, scenesForOps, titlePatch],
  );

  /** The first selected scene as it would read after the pending edit. */
  const titlePreview = useMemo(() => {
    const first = sceneList[0];
    if (first === undefined) return null;
    // titleOps drops scenes it wouldn't change, so fall back to the current
    // name — a preview that goes blank when the edit is a no-op reads as if
    // the rename would blank the scene.
    return sceneNameOps.find((op) => op.s === first)?.name ?? sceneNames.get(first) ?? '';
  }, [sceneList, sceneNameOps, sceneNames]);

  const onRenameScenes = useCallback(
    () => void applyScenes(sceneNameOps, 'rename scenes'),
    [applyScenes, sceneNameOps],
  );

  const clipsByScene = useMemo(() => {
    const m = new Map<number, BSV.Clip[]>();
    for (const c of snapshot?.clips ?? []) {
      const list = m.get(c.s);
      if (list) list.push(c);
      else m.set(c.s, [c]);
    }
    return m;
  }, [snapshot]);

  /** The role the selection shares, and whether the selected scenes disagree. */
  const { currentRole, mixed } = useMemo(() => {
    let seen: string | null | undefined;
    let disagree = false;
    for (const s of sceneList) {
      const r = roleIn(sceneNames.get(s) ?? '');
      if (seen === undefined) seen = r;
      else if (roleKey(seen ?? '') !== roleKey(r ?? '')) disagree = true;
    }
    return { currentRole: disagree ? null : (seen ?? null), mixed: disagree };
  }, [sceneList, sceneNames]);

  /** Selected scenes paired with the palette slot their role calls for. */
  const roleColorTargets = useMemo(() => {
    const byColor = new Map<number, number[]>();
    for (const s of sceneList) {
      const role = roleIn(sceneNames.get(s) ?? '');
      if (role === null) continue;
      const entry = findRole(vocabulary, role);
      if (!entry || entry.colorIndex < 0) continue;
      const list = byColor.get(entry.colorIndex);
      if (list) list.push(s);
      else byColor.set(entry.colorIndex, [s]);
    }
    return byColor;
  }, [sceneList, sceneNames, vocabulary]);

  // Each scene's clips take *that scene's* role color, so one press works over
  // a selection spanning several roles. Passing the scene's own clips as the
  // "before" is what keeps this linear — colorOps needs the previous color, and
  // the clips in hand already carry it.
  const roleClipOps = useMemo<BSV.ApplyOp[]>(() => {
    const out: BSV.ApplyOp[] = [];
    for (const [colorIndex, scenes] of roleColorTargets) {
      for (const s of scenes) {
        const cells = clipsByScene.get(s) ?? [];
        out.push(...colorOps(cells, cells, colorIndex));
      }
    }
    return out;
  }, [clipsByScene, roleColorTargets]);

  const rolePaintOps = useMemo<BSV.SceneOp[]>(() => {
    const out: BSV.SceneOp[] = [];
    for (const [colorIndex, scenes] of roleColorTargets) {
      const rgb = bridge.palette[colorIndex];
      // No palette entry means no RGB, and RGB is the only form Live accepts
      // for a scene color. Skip rather than write a color we'd be inventing.
      if (rgb === undefined) continue;
      out.push(...sceneColorOps(scenesForOps, scenes, colorIndex, rgb));
    }
    return out;
  }, [bridge.palette, roleColorTargets, scenesForOps]);

  const onAssignRole = useCallback(
    (role: string | null) => {
      const ops = roleOps(scenesForOps, sceneList, role);
      void applyScenes(ops, role === null ? 'clear role' : `role ${role}`);
    },
    [applyScenes, sceneList, scenesForOps],
  );

  const onColorClips = useCallback(
    () => void apply(roleClipOps, 'role color'),
    [apply, roleClipOps],
  );

  const onPaintScenes = useCallback(
    () => void applyScenes(rolePaintOps, 'paint scenes'),
    [applyScenes, rolePaintOps],
  );

  // Token values for one clip. `{role}` comes from the clip's own scene, so the
  // rename pattern picks it up for free once the scene is tagged. `{song}`
  // lands with segmentation; until then it resolves to nothing, which render()
  // drops cleanly.
  const valuesFor = useCallback(
    (t: number, s: number, n: number) => ({
      track: trackNames.get(t),
      scene: sceneNames.get(s),
      role: roleIn(sceneNames.get(s) ?? '') ?? undefined,
      name: clips.get(clipKey(t, s))?.name,
      n,
    }),
    [clips, sceneNames, trackNames],
  );

  const selectedCells = useMemo(
    () => [...selected].map((key) => parseClipKey(key)),
    [selected],
  );

  // Color writes immediately on click, naming does not, and the asymmetry is
  // deliberate. A color is instantly legible in the grid and reapplying a
  // different one costs nothing, so a swatch may as well be the action. A name
  // overwrites something you can't see any more, so it keeps its preview and an
  // explicit commit. Both are undoable — see useBridge.
  const onColor = useCallback(
    (index: number) => {
      setChosenIndex(index);
      if (!snapshot || selectedCells.length === 0) return;
      void apply(colorOps(snapshot.clips, selectedCells, index), 'color');
    },
    [apply, selectedCells, snapshot],
  );

  const nameOps = useMemo<BSV.ApplyOp[]>(() => {
    if (!pattern.trim()) return [];
    return selectedCells
      .map(({ t, s }, i) => ({ t, s, name: render(pattern, valuesFor(t, s, i + 1)) }))
      // Renaming a clip to what it is already called is a write Live has to make
      // and a number the progress bar has to report, for no visible effect.
      .filter((op) => op.name !== clips.get(clipKey(op.t, op.s))?.name);
  }, [clips, pattern, selectedCells, valuesFor]);

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
        <Stat
          k="Songs"
          v={snapshot ? derivation.songs.length : undefined}
          onClick={snapshot ? () => setShowSongs(true) : undefined}
        />
        <Stat
          k="Unmapped"
          v={snapshot ? derivation.unmapped.length : undefined}
          warn={derivation.unmapped.length > 0}
          onClick={snapshot ? () => setShowSongs(true) : undefined}
        />
        <Stat k="LOM walk" v={snapshot ? `${snapshot.ms}ms` : undefined} highlight />
        <Stat k="Slot scan" v={snapshot ? `${snapshot.timings.slots}ms` : undefined} />
        <Stat k="Selected" v={selected.size} />
        <div className="spacer" />
        <div className="keyhint">
          <b>{LAUNCH_KEY}</b>-click / <b>{LAUNCH_KEY}</b>-↑↓ fires · <b>⇧</b> extends ·{' '}
          <b>⌥</b> adds · <b>esc</b> stops clips · <b>{LAUNCH_KEY}Z</b> undoes
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
              roleColors={roleColors}
              selectedScenes={selectedScenes}
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

        {/* Scenes above clips: naming a song and tagging its roles is the pass
            you make first, and pressing the role's color is the two-click path
            this panel exists for. The swatch grid and clip rename below are the
            manual fallback for everything a role doesn't cover. */}
        <aside>
          <ScenePanel
            vocabulary={vocabulary}
            palette={bridge.palette}
            inUse={inUseKeys}
            sceneCount={selectedScenes.size}
            common={commonFields}
            patch={titlePatch}
            onPatch={setTitlePatch}
            titleCount={sceneNameOps.length}
            titlePreview={selectedScenes.size === 0 ? null : titlePreview}
            onRenameScenes={onRenameScenes}
            currentRole={currentRole}
            mixed={mixed}
            clipCount={roleClipOps.length}
            paintCount={rolePaintOps.length}
            busy={bridge.busy}
            onAssign={onAssignRole}
            onColorClips={onColorClips}
            onPaintScenes={onPaintScenes}
            onSaveRoles={(next) => void bridge.saveRoles(next)}
          />

          <div className="rule" />

          <Inspector
            palette={bridge.palette}
            chosenIndex={chosenIndex}
            onColor={onColor}
            pattern={pattern}
            onPattern={setPattern}
            selectedCount={selected.size}
            renameCount={nameOps.length}
            preview={preview}
            busy={bridge.busy}
            progress={bridge.progress}
            undoDepth={bridge.undoDepth}
            onRename={() => void bridge.apply(nameOps, 'rename')}
            onUndo={() => void bridge.undo()}
            onClear={() => {
              setSelected(new Set());
              setSelectedScenes(EMPTY_SCENES);
            }}
            onExtractPalette={() => void bridge.extractPalette()}
          />
        </aside>
      </main>

      {showSongs && snapshot && (
        <SongsModal
          derivation={derivation}
          pattern={DEFAULT_SCENE_PATTERN}
          onPick={pickScenes}
          onPickUnmapped={() => pickScenes(derivation.unmapped)}
          onClose={() => setShowSongs(false)}
        />
      )}

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
  warn,
  onClick,
}: {
  k: string;
  v: string | number | undefined;
  highlight?: boolean;
  /** Amber, for a count that is fine at zero and worth a look above it. */
  warn?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`stat${onClick ? ' clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="k">{k}</div>
      <div className={`v${highlight || warn ? ' hl' : ''}`}>{v ?? '—'}</div>
    </div>
  );
}

export { clipKey };
