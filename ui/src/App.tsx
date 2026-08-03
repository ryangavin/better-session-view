import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipGrid } from './components/ClipGrid/ClipGrid.js';
import { Inspector } from './components/Inspector.js';
import { RoleMenu, type Anchor } from './components/RoleMenu.js';
import { RolesManager } from './components/RolesManager.js';
import { ScenePanel } from './components/ScenePanel.js';
import { SongsModal } from './components/SongsModal.js';
import { useBridge } from './hooks/useBridge.js';
import { useSnapshotLookups } from './hooks/useSnapshotLookups.js';
import { useTrackColumns } from './hooks/useTrackColumns.js';
import { useSongLayout } from './hooks/useSongLayout.js';
import { useRailAndLog } from './hooks/useRailAndLog.js';
import { useGridSelection } from './hooks/useGridSelection.js';
import { useGridKeyboard } from './hooks/useGridKeyboard.js';
import { useSongDrag } from './hooks/useSongDrag.js';
import { clipKey, parseClipKey } from './lib/selection.js';
import { LAUNCH_KEY } from './lib/keys.js';
import {
  COLUMN_WIDTHS,
  loadColumnWidth,
  saveColumnWidth,
  type ColumnWidth,
} from './lib/columnWidth.js';
import { render } from '../../core/src/pattern.js';
import { colorOps } from '../../core/src/ops.js';
import {
  findRole,
  mergeVocabulary,
  roleIn,
  roleKey,
  roleOps,
  rolesInUse,
  sceneColorOps,
  sharedRole,
  tempoOps,
} from '../../core/src/roles.js';
import {
  commonTitle,
  titleOf,
  titleOps,
  type TitlePatch,
} from '../../core/src/sceneTitle.js';
import { DEFAULT_SCENE_PATTERN } from '../../core/src/namePattern.js';
import {
  scenesOfSongs,
  songKey as songKeyOf,
  songsOfScenes,
} from '../../core/src/derive.js';
import { describeMove } from '../../core/src/sceneMove.js';

export function App() {
  const bridge = useBridge();
  const { snapshot, play, launch, stop, apply, applyScenes, undo } = bridge;

  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [pattern, setPattern] = useState('');
  const [columnWidth, setColumnWidth] = useState<ColumnWidth>(loadColumnWidth);

  const { clips, trackNames, sceneNames, isOccupied, scenesForOps, clipsByScene } =
    useSnapshotLookups(snapshot);
  const { columns, trackColumns, onToggleGroup } = useTrackColumns(snapshot);
  const {
    derivation,
    headers: songHeaders,
    hiddenScenes,
    rows,
    songShapes,
    collapsedSongs,
    onToggleSong,
    onCollapseAll,
    unfoldSong,
  } = useSongLayout(snapshot);

  const [showSongs, setShowSongs] = useState(false);

  const { showRail, openRail, hideRail, showLog, toggleLog } = useRailAndLog(bridge.log);

  const {
    selected,
    selectedScenes,
    sceneList,
    active,
    activeRef,
    goActive,
    onClip,
    onScene,
    onFireScene,
    onStopTrack,
    clearSelection,
    pickScenes,
  } = useGridSelection({ trackColumns, rows, isOccupied, launch, stop, openRail });

  useGridKeyboard({
    rows,
    trackColumns,
    activeRef,
    goActive,
    isPlaying: play.isPlaying,
    launch,
    stop,
    undo,
  });

  const chooseColumnWidth = useCallback((w: ColumnWidth) => {
    setColumnWidth(w);
    saveColumnWidth(w);
  }, []);

  // --- roles -----------------------------------------------------------
  // Stored in the scene's own name as `[role]` — see core/src/roles.ts for why
  // the set is the storage and why the tag is bracketed.

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
      unfoldSong(songKey);
      pickScenes(song.scenes);
    },
    [derivation, pickScenes, unfoldSong],
  );

  /**
   * Closing the rail drops the selection with it.
   *
   * The rail is the only place a selection is *shown* as anything but painted
   * cells — what it is, how many, what a write would say. Closing it while
   * ninety scenes stay picked leaves a live target you can't see and can't
   * check, and the next thing you open the rail with is a click that would have
   * replaced the selection anyway. So closing means done, not minimized.
   */
  const closeRail = useCallback(() => {
    hideRail();
    clearSelection();
  }, [clearSelection, hideRail]);

  const {
    dragFrom,
    dropAt,
    movePlan,
    onSongDragStart,
    onSongDragOver,
    onSongDrop,
    onSongDragEnd,
  } = useSongDrag(snapshot, clearSelection, bridge.moveScenes);

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

  /** The role the selection shares, and whether the selected scenes disagree. */
  const { currentRole, mixed } = useMemo(
    () => sharedRole(sceneList, sceneNames),
    [sceneList, sceneNames],
  );

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

  const assignRoleTo = useCallback(
    (scenes: readonly number[], role: string | null) => {
      const ops = roleOps(scenesForOps, scenes, role);
      void applyScenes(ops, role === null ? 'clear role' : `role ${role}`);
    },
    [applyScenes, scenesForOps],
  );

  const onAssignRole = useCallback(
    (role: string | null) => assignRoleTo(sceneList, role),
    [assignRoleTo, sceneList],
  );

  /**
   * The role picker hanging off a scene's chip in the grid.
   *
   * Holds the scene that was clicked and where its chip is, and nothing else:
   * which scenes the pick writes to is worked out at render from the selection
   * as it stands, and `onRoleMenu` stays identity-stable so opening the menu
   * doesn't re-render all 848 memoized rows.
   */
  const [roleMenu, setRoleMenu] = useState<{ s: number; anchor: Anchor } | null>(null);
  const onRoleMenu = useCallback((s: number, anchor: Anchor) => {
    setRoleMenu({ s, anchor });
  }, []);

  // The vocabulary editor is owned here rather than by the rail: the grid's
  // role menu opens it too, and the rail can be shut while it's up.
  const [managingRoles, setManagingRoles] = useState(false);

  /**
   * Scenes a pick in that menu writes.
   *
   * The chip you pressed, unless it belongs to a scene selection you already
   * made — then it's the whole selection, because that's the pass you're in the
   * middle of. Either way the menu says the count out loud, so the scope is
   * never inferred from the chip alone.
   */
  const roleMenuScenes = useMemo(() => {
    if (!roleMenu) return [];
    return selectedScenes.has(roleMenu.s) ? sceneList : [roleMenu.s];
  }, [roleMenu, sceneList, selectedScenes]);

  const roleMenuRole = useMemo(
    () => sharedRole(roleMenuScenes, sceneNames),
    [roleMenuScenes, sceneNames],
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
        {/* The log is diagnostics, so it's off by default and reachable in one
            click. It opens itself on an error — see the effect above — because
            a failure you can't see is a failure that didn't happen. */}
        <button
          type="button"
          className={`toggle${showLog ? ' on' : ''}`}
          aria-pressed={showLog}
          title="Show what the bridge is saying"
          onClick={toggleLog}
        >
          Log
        </button>
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
              songHeaders={songHeaders}
              hiddenScenes={hiddenScenes}
              songShapes={songShapes}
              onToggleSong={onToggleSong}
              onPickSong={onPickSong}
              dragFrom={dragFrom}
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
              onRoleMenu={onRoleMenu}
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
        {showRail && (
          <aside>
            {/* The rail is closable because it's a workspace, not chrome: shut it
                and the grid gets its 264px back. Clicking a clip, a scene or a
                song opens it again, so there's no state to get stranded in —
                and closing drops the selection, so there's none left behind
                either. See `closeRail`. */}
            <div className="rail-head">
              <span className="lbl">Edit</span>
              <button
                type="button"
                className="icon"
                title="Close and deselect — clicking a clip, a scene or a song reopens it"
                onClick={closeRail}
              >
                ×
              </button>
            </div>
            <ScenePanel
              vocabulary={vocabulary}
              palette={bridge.palette}
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
              onManageRoles={() => setManagingRoles(true)}
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
        )}
      </main>

      {/* Outside `main` with the modals: it's anchored to the viewport, and a
          menu clipped by the grid's own scroll box would be cut off on the
          bottom rows — the ones a set spends most of its time near. */}
      {roleMenu && (
        <RoleMenu
          vocabulary={vocabulary}
          palette={bridge.palette}
          anchor={roleMenu.anchor}
          count={roleMenuScenes.length}
          current={roleMenuRole.currentRole}
          mixed={roleMenuRole.mixed}
          busy={bridge.busy}
          onPick={(role) => {
            assignRoleTo(roleMenuScenes, role);
            setRoleMenu(null);
          }}
          onManage={() => {
            setRoleMenu(null);
            setManagingRoles(true);
          }}
          onClose={() => setRoleMenu(null)}
        />
      )}

      {managingRoles && (
        <RolesManager
          vocabulary={vocabulary}
          palette={bridge.palette}
          inUse={inUseKeys}
          busy={bridge.busy}
          onSave={(next) => {
            void bridge.saveRoles(next);
            setManagingRoles(false);
          }}
          onClose={() => setManagingRoles(false)}
        />
      )}

      {showSongs && snapshot && (
        <SongsModal
          derivation={derivation}
          pattern={DEFAULT_SCENE_PATTERN}
          // Picking closes the modal — the point of the pick is to look at the
          // rows it just selected, and the modal is what's covering them.
          onPick={(scenes) => {
            pickScenes(scenes);
            setShowSongs(false);
          }}
          onPickUnmapped={() => {
            pickScenes(derivation.unmapped);
            setShowSongs(false);
          }}
          collapsedCount={collapsedSongs.size}
          onCollapseAll={onCollapseAll}
          onClose={() => setShowSongs(false)}
        />
      )}

      {showLog && (
        <footer>
          {bridge.log.map((l) => (
            <div key={l.id} className={`log-line ${l.kind}`}>
              {l.text}
            </div>
          ))}
        </footer>
      )}
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
