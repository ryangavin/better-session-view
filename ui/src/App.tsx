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
  tempoOps,
} from '../../core/src/roles.js';
import {
  commonTitle,
  titleOf,
  titleOps,
  type TitlePatch,
} from '../../core/src/sceneTitle.js';
import {
  compilePattern,
  DEFAULT_SCENE_PATTERN,
  LEGACY_SCENE_PATTERN,
} from '../../core/src/namePattern.js';
import {
  derive,
  scenesOfSongs,
  songKey as songKeyOf,
  songsOfScenes,
} from '../../core/src/derive.js';
import { allSongKeys, blockTrackRoles, songRows } from '../../core/src/songRows.js';
import { describeMove, planSceneMove } from '../../core/src/sceneMove.js';
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
 * The scene patterns, until the scheme file lands and makes them editable.
 *
 * Two, in order: the convention we write, then the one this app wrote before
 * it. Derivation takes the first that matches, so **a set named the old way
 * still shows its songs** and converts scene by scene as it's renamed. Without
 * the second entry every scene would read as unmapped the moment the convention
 * changed, and there would be nothing left to select in order to fix it.
 *
 * Compiled once at module scope: they never change yet, and each compile runs a
 * round-trip probe. `!` is safe here and nowhere else — both patterns have a
 * test asserting they compile.
 */
const SCENE_PATTERNS = [
  compilePattern(DEFAULT_SCENE_PATTERN)!,
  compilePattern(LEGACY_SCENE_PATTERN)!,
];

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

  // --- songs -----------------------------------------------------------
  // The mapping, read back out of the set — see core/src/derive.ts. Nothing is
  // stored for this: which scene belongs to which song falls out of the names.
  // It sits up here with the other lookups because `rows` below feeds every
  // movement and selection helper, exactly as `columns` does.

  const derivation = useMemo(
    () => derive(snapshot?.scenes ?? [], SCENE_PATTERNS),
    [snapshot],
  );
  const [showSongs, setShowSongs] = useState(false);

  // Which songs are folded. Keyed by song rather than by scene index, so it
  // survives a re-snapshot — every write re-walks the set, and a collapsed
  // state that reset each time would make the grid unusable during a mapping
  // pass. Like collapsing a track group, this never writes back to Live.
  const [collapsedSongs, setCollapsedSongs] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const layout = useMemo(
    () => songRows(derivation, collapsedSongs),
    [collapsedSongs, derivation],
  );

  /**
   * Per block, per track, which sections of the song that track plays — what a
   * folded header shows in place of the rows it's hiding.
   *
   * Computed for every block rather than only the folded ones, deliberately.
   * It's a single pass over the clips, and keying it off `derivation` instead of
   * `collapsedSongs` means folding a song doesn't rebuild the map — which would
   * hand every header a new prop and re-render all hundred of them on a gesture
   * that changed one.
   */
  const songShapes = useMemo(
    () =>
      blockTrackRoles(
        snapshot?.clips ?? [],
        snapshot?.scenes ?? [],
        derivation.songs.flatMap((s) => s.blocks),
      ),
    [derivation, snapshot],
  );

  /**
   * Visible scene indexes, the row-wise counterpart of `trackColumns`.
   *
   * Everything that moves or selects goes through this rather than through
   * `sceneCount`, so a collapsed song is invisible to the arrow keys and to
   * block selection. Without it ⌘↓ would descend into scenes you can't see and
   * fire them, which is the one thing the ⌘-makes-a-sound rule exists to keep
   * predictable.
   */
  const rows = layout.rows;

  const onToggleSong = useCallback((songKey: string) => {
    setCollapsedSongs((prev) => {
      const next = new Set(prev);
      if (!next.delete(songKey)) next.add(songKey);
      return next;
    });
  }, []);

  const onCollapseAll = useCallback(
    (all: boolean) => setCollapsedSongs(all ? new Set(allSongKeys(derivation)) : new Set()),
    [derivation],
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
        selectCells(cellsInBlock(trackColumns, rows, from, { t, s }, isOccupied), false);
        return;
      }
      selectCells([{ t, s }], false);
      goActive({ on: 'clip', t, s });
    },
    [goActive, isOccupied, launch, rows, selectCells, trackColumns],
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
    [goActive, isOccupied, launch, rows, selectCells, trackColumns],
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

  useEffect(() => {
    if (rows.length === 0) return;

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
        // than moving it — otherwise ↓ from nowhere skips scene 1. The first
        // *visible* scene, since scene 0 may be inside a folded song.
        const next = from === null
          ? ({ on: 'scene', s: rows[0]! } as ActiveCell)
          : moveActive(trackColumns, rows, from, d);
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
  }, [fireActive, goActive, launch, rows, stop, trackColumns, undo]);

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

  /**
   * Work on a whole song: select every scene it has, across every block.
   *
   * Unfolds it first. Selecting scenes that are folded away would leave the
   * panel offering to rename eighteen rows you can't see, and a write you can't
   * preview is the one thing the pending-changes idea exists to prevent.
   */
  const onPickSong = useCallback(
    (songKey: string) => {
      const song = derivation.songs.find((s) => songKey === songKeyOf(s.name));
      if (!song) return;
      setCollapsedSongs((prev) => {
        if (!prev.has(songKey)) return prev;
        const next = new Set(prev);
        next.delete(songKey);
        return next;
      });
      pickScenes(song.scenes);
    },
    [derivation, pickScenes],
  );

  // --- rearranging songs -----------------------------------------------
  // Drag a song header to move that whole run of scenes somewhere else.
  //
  // **A drag moves one block, not one song.** A song is a label rather than a
  // range, so it can appear in several runs, and each run has its own header —
  // dragging the header for "part 2 of 2" has to move the part you grabbed.
  // Gathering both runs is a thing `planSceneMove` supports and a thing you can
  // do by dragging one next to the other; doing it as a silent side effect of
  // grabbing one header would move sixty scenes nobody pointed at.
  //
  // This is the only gesture in the app that can destroy work — see
  // core/src/sceneMove.ts. Everything the grid does otherwise is either a view
  // change or a write our own undo reverses.

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectedScenes(EMPTY_SCENES);
  }, []);

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
    void bridge.moveScenes(plan, `move ${plan.scenes} scene${plan.scenes === 1 ? '' : 's'}`);
  }, [bridge, clearSelection]);

  // --- scene titles ----------------------------------------------------
  // `@{bpm}-{key} {SONG}`, everything in the name after the role tag.

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

  // The bpm field drives two independent things: the name token, written by
  // Rename above, and Live's own Scene.tempo, written here. Kept apart because
  // only one of them changes how the set plays.
  const wantedTempo = useMemo(() => {
    const raw = (titlePatch.bpm ?? commonFields.bpm ?? '').trim();
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : null;
  }, [commonFields.bpm, titlePatch.bpm]);

  const tempoWriteOps = useMemo(
    () => tempoOps(scenesForOps, sceneList, wantedTempo),
    [sceneList, scenesForOps, wantedTempo],
  );

  const onSetTempo = useCallback(
    () => void applyScenes(tempoWriteOps, wantedTempo === null ? 'clear tempo' : 'set tempo'),
    [applyScenes, tempoWriteOps, wantedTempo],
  );

  // --- song color ------------------------------------------------------
  // **A song is one color.** Coloring is therefore song-scoped rather than
  // selection-scoped: touch any scene of Nightfall and the swatch writes all
  // twelve, reprise included. That's the whole value of the color — a solid
  // block in Live's own session view is what you navigate a 100-song set by,
  // and a per-scene brush is exactly what puts holes in it.
  //
  // A selected scene the pattern couldn't read has no song to widen to, so it
  // takes the color alone. The alternative is a swatch that silently does
  // nothing on the scenes a mapping pass hasn't reached yet.

  const songColorScenes = useMemo(
    () => scenesOfSongs(derivation, sceneList),
    [derivation, sceneList],
  );

  /**
   * What a swatch is about to repaint, in words.
   *
   * Named where it can be, because the song is the unit: "all 12 scenes of
   * NIGHTFALL" is checkable at a glance in a way "12 scenes" isn't. Scenes the
   * pattern couldn't read have no song to name and are counted separately
   * rather than folded into a song's total, which would overstate it.
   */
  const songColorLabel = useMemo(() => {
    const songs = songsOfScenes(derivation, sceneList);
    const loose = songColorScenes.length - songs.reduce((n, s) => n + s.scenes.length, 0);
    const named =
      songs.length === 0
        ? ''
        : songs.length <= 2
          ? songs.map((s) => s.name).join(' and ')
          : `${songs.length} songs`;
    const rest = loose === 0 ? '' : `${loose} unmapped scene${loose === 1 ? '' : 's'}`;
    return [named, rest].filter(Boolean).join(' + ');
  }, [derivation, sceneList, songColorScenes]);

  /** The palette slot those scenes already share, or -1 when they don't. */
  const songColorIndex = useMemo(() => {
    const first = songColorScenes[0];
    if (first === undefined) return -1;
    const shared = snapshot?.scenes[first]?.colorIndex ?? -1;
    return songColorScenes.every((s) => snapshot?.scenes[s]?.colorIndex === shared)
      ? shared
      : -1;
  }, [snapshot, songColorScenes]);

  const onSongColor = useCallback(
    (index: number) => {
      const rgb = bridge.palette[index];
      // No RGB means no write: a scene's color can only be written as RGB, and
      // inventing one would paint something we didn't choose.
      if (rgb === undefined) return;
      void applyScenes(
        sceneColorOps(scenesForOps, songColorScenes, index, rgb),
        'song color',
      );
    },
    [applyScenes, bridge.palette, scenesForOps, songColorScenes],
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

  // Roles color *clips*, never scene rows. Painting a scene its role's color
  // would stripe a song into as many colors as it has sections, which is the
  // one thing the song band can't survive — see "song color" above.

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
        {/* A view control, so it sits with the other one rather than only in
            the songs modal. Folding everything is how a 100-song set becomes
            navigable, and it shouldn't take two clicks to reach. */}
        <button
          type="button"
          disabled={derivation.songs.length === 0}
          title="Fold every song down to its header row"
          onClick={() => onCollapseAll(collapsedSongs.size < derivation.songs.length)}
        >
          {collapsedSongs.size < derivation.songs.length ? 'Fold songs' : 'Unfold songs'}
        </button>
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
              palette={bridge.palette}
              roleColors={roleColors}
              selectedScenes={selectedScenes}
              songHeaders={layout.headers}
              hiddenScenes={layout.hidden}
              songShapes={songShapes}
              onToggleSong={onToggleSong}
              onPickSong={onPickSong}
              dragFrom={dragBlock?.from ?? -1}
              // -1 rather than null so the prop stays a number all the way down
              // to the memoized header row.
              dropAt={movePlan ? (dropAt ?? -1) : -1}
              dropNote={movePlan ? describeMove(movePlan) : ''}
              onSongDragStart={onSongDragStart}
              onSongDragOver={onSongDragOver}
              onSongDrop={onSongDrop}
              onSongDragEnd={onSongDragEnd}
              onClip={onClip}
              onScene={onScene}
              onFireScene={onFireScene}
              onStopTrack={onStopTrack}
              onToggleGroup={onToggleGroup}
            />
          ) : (
            <div className="empty-state">
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
            tempoCount={tempoWriteOps.length}
            onSetTempo={onSetTempo}
            songColorIndex={songColorIndex}
            songColorCount={songColorScenes.length}
            songColorLabel={songColorLabel}
            onSongColor={onSongColor}
            currentRole={currentRole}
            mixed={mixed}
            clipCount={roleClipOps.length}
            busy={bridge.busy}
            onAssign={onAssignRole}
            onColorClips={onColorClips}
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
            onClear={clearSelection}
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
          collapsedCount={collapsedSongs.size}
          onCollapseAll={onCollapseAll}
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
