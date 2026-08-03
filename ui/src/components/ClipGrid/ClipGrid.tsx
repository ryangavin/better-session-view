import { useMemo, type CSSProperties } from 'react';
import { hex, legibleOn } from '../../../../core/src/color.js';
import { headerSpans, type Column } from '../../../../core/src/trackColumns.js';
import type { SongHeader, TrackShape } from '../../../../core/src/songRows.js';
import type { ActiveCell } from '../../../../core/src/gridRange.js';
import { isLaunchModified, LAUNCH_KEY, type CellClick } from '../../lib/keys.js';
import {
  metricsFor,
  tableWidth,
  ROLE_CHIP_W,
  SCENE_COL_W,
  type ColumnWidth,
} from '../../lib/columnWidth.js';
import type { PlayState } from '../../hooks/useBridge.js';
import { marksByScene } from '../../lib/rowMarks.js';
import type { Anchor } from '../RoleMenu.js';
import { NO_SHAPES, PANEL, STOP_FIRED } from './constants.js';
import { Row } from './Row.js';
import { dropEdgeFor, SongHeaderRow } from './SongHeaderRow.js';

export interface Props {
  snapshot: BSV.Snapshot;
  columns: Column<BSV.Track>[];
  clips: Map<string, BSV.Clip>;
  selected: ReadonlySet<string>;
  active: ActiveCell | null;
  play: PlayState;
  columnWidth: ColumnWidth;
  /** Live's palette, for resolving a song header's color index to an RGB. */
  palette: number[];
  /** roleKey → the RGB its chip is painted. Must be a stable identity — see Row. */
  roleColors: Map<string, number>;
  selectedScenes: ReadonlySet<number>;
  /** Scene index → the song header sitting directly above it. */
  songHeaders: Map<number, SongHeader>;
  /** Scenes inside a collapsed song. Their rows aren't rendered. */
  hiddenScenes: ReadonlySet<number>;
  /** Block's first scene → track index → the sections that track plays. */
  songShapes: Map<number, Map<number, TrackShape>>;
  onToggleSong: (songKey: string) => void;
  /** Select every scene of a song, across all its blocks. */
  onPickSong: (songKey: string) => void;
  /** First scene of the block being dragged, or -1. A primitive, so it can
   *  reach the memoized header row without re-rendering all of them. */
  dragFrom: number;
  /** Where the drop would land, as a gap in scene numbering, or -1. */
  dropAt: number;
  /** What the pending move costs, for the indicator. */
  dropNote: string;
  onSongDragStart: (from: number, to: number) => void;
  onSongDragOver: (from: number, to: number, below: boolean) => void;
  onSongDrop: () => void;
  onSongDragEnd: () => void;
  onClip: (t: number, s: number, mods: CellClick) => void;
  onScene: (s: number, mods: CellClick) => void;
  onFireScene: (s: number) => void;
  /**
   * Open the role picker on a scene's chip. The anchor comes from here because
   * the chip is the only thing that knows where it ended up; the menu itself is
   * rendered by `App`, so opening one doesn't re-render 848 memoized rows.
   */
  onRoleMenu: (s: number, anchor: Anchor) => void;
  onStopTrack: (t: number) => void;
  onToggleGroup: (trackIndex: number) => void;
}

export function ClipGrid({
  snapshot,
  columns,
  clips,
  selected,
  active,
  play,
  columnWidth,
  palette,
  roleColors,
  selectedScenes,
  songHeaders,
  hiddenScenes,
  songShapes,
  onToggleSong,
  onPickSong,
  dragFrom,
  dropAt,
  dropNote,
  onSongDragStart,
  onSongDragOver,
  onSongDrop,
  onSongDragEnd,
  onClip,
  onScene,
  onFireScene,
  onRoleMenu,
  onStopTrack,
  onToggleGroup,
}: Props) {
  const spans = useMemo(
    () => headerSpans(snapshot.tracks, columns),
    [snapshot.tracks, columns],
  );

  const marks = useMemo(() => marksByScene(play), [play]);

  // Widths ride down as custom properties on the table rather than as props on
  // Row. Row is memoized, and a new prop on it would re-render all 848 scenes
  // on every width change; this way the browser just recalculates layout.
  const style = useMemo<CSSProperties>(() => {
    const m = metricsFor(columnWidth);
    // Only `--col-w` moves with the setting. The other two are constants, but
    // still ride down from here so columnWidth.ts stays the one place the grid
    // states a width — the styles.css values are fallbacks, not the source.
    return {
      '--col-w': `${m.col}px`,
      '--scene-col-w': `${SCENE_COL_W}px`,
      '--role-chip-w': `${ROLE_CHIP_W}px`,
      width: `${tableWidth(columnWidth, columns.length)}px`,
    } as CSSProperties;
  }, [columnWidth, columns.length]);

  return (
    <table className="grid" style={style}>
      {/* Column widths come from here rather than the header row: a colSpan in
          the group row would otherwise have to distribute its width across the
          columns it covers, and the widths stop being exact. */}
      <colgroup>
        <col className="scene-col" />
        {columns.map((c) => (
          <col key={c.kind === 'track' ? `t${c.track.i}` : `g${c.group.i}`} />
        ))}
      </colgroup>
      <thead>
        <tr className="group-row">
          <th className="group-pad" />
          {spans.map((s, i) =>
            s.group ? (
              <th
                key={`s${s.group.i}`}
                colSpan={s.span}
                className="group-h"
                style={{ color: hex(legibleOn(s.group.color, PANEL)) }}
                title={`${s.group.name} — click to collapse`}
                onClick={() => onToggleGroup(s.group!.i)}
              >
                {s.group.name}
              </th>
            ) : (
              <th key={`n${i}`} colSpan={s.span} className="group-h none" />
            ),
          )}
        </tr>
        <tr>
          <th className="scene-h">Scene</th>
          {columns.map((c) => {
            if (c.kind !== 'track') {
              return (
                <th
                  key={`g${c.group.i}`}
                  className="folded-h"
                  style={{ color: hex(legibleOn(c.group.color, PANEL)) }}
                  title={`${c.group.name} (${c.members.length} tracks) — click to expand`}
                  onClick={() => onToggleGroup(c.group.i)}
                >
                  ▸ {c.group.name}
                </th>
              );
            }
            // The header row re-renders on every play change and is ~40 cells,
            // so it reads PlayState directly rather than going through marks.
            const st = play.tracks[c.track.i];
            const live = st !== undefined && st.playing >= 0;
            const stopping = st !== undefined && st.fired === STOP_FIRED;
            return (
              <th
                key={`t${c.track.i}`}
                className={`track-h${live ? ' live' : ''}${stopping ? ' stopping' : ''}`}
                title={`${c.track.name} — ${LAUNCH_KEY}-click to stop this track`}
                onClick={(e) => {
                  if (isLaunchModified(e)) onStopTrack(c.track.i);
                }}
              >
                {c.track.name}
              </th>
            );
          })}
        </tr>
      </thead>
      {/* Built as a flat list rather than a fragment per scene: a song header
          is a sibling row, not a wrapper, and wrapping 848 memoized rows in
          fragments to interleave them would cost more than it reads better. */}
      <tbody>
        {snapshot.scenes.flatMap((scene) => {
          const header = songHeaders.get(scene.i);
          const out = [];
          if (header) {
            out.push(
              <SongHeaderRow
                key={`song-${scene.i}`}
                header={header}
                columns={columns}
                // Only a folded block needs one, and asking for it here keeps
                // the prop `undefined` — and so memo-stable — for every open
                // song in the set.
                // Asked for here so an open song's prop stays memo-stable, and
                // `NO_SHAPES` rather than a fresh `new Map()`, which would be a
                // new identity on every render.
                shapes={
                  (header.collapsed ? songShapes.get(header.from) : undefined) ?? NO_SHAPES
                }
                roleColors={roleColors}
                // Resolved here rather than inside the row: the palette is an
                // array whose identity changes on every snapshot, and a prop
                // like that would re-render all hundred headers. A number
                // doesn't.
                rgb={
                  header.colorIndex >= 0 ? (palette[header.colorIndex] ?? -1) : -1
                }
                dragging={dragFrom === header.from}
                // One gap, one indicator. Deriving the edge here rather than
                // passing an object keeps every prop on this memoized row a
                // primitive — an object would re-render all hundred headers on
                // every mouse move during a drag.
                //
                // Adjacent songs make the same gap addressable twice: song A
                // ending at 5 and song B starting at 6 both answer to `6`, as
                // "below A" and "above B". Resolved toward *above*, so `below`
                // only renders where no header begins — which is the tail of the
                // set, the one place `above` can't reach.
                dropEdge={dropEdgeFor(header, dropAt, songHeaders)}
                dropNote={dropEdgeFor(header, dropAt, songHeaders) ? dropNote : ''}
                onToggle={onToggleSong}
                onPickSong={onPickSong}
                onDragStart={onSongDragStart}
                onDragOver={onSongDragOver}
                onDrop={onSongDrop}
                onDragEnd={onSongDragEnd}
              />,
            );
          }
          if (!hiddenScenes.has(scene.i)) {
            out.push(
              <Row
                key={scene.i}
                scene={scene}
                columns={columns}
                clips={clips}
                selected={selected}
                marks={marks.get(scene.i)}
                active={
                  active === null || active.s !== scene.i
                    ? undefined
                    : active.on === 'scene'
                      ? 'scene'
                      : active.t
                }
                roleColors={roleColors}
                sceneSelected={selectedScenes.has(scene.i)}
                onClip={onClip}
                onScene={onScene}
                onFireScene={onFireScene}
                onRoleMenu={onRoleMenu}
              />,
            );
          }
          return out;
        })}
      </tbody>
    </table>
  );
}
