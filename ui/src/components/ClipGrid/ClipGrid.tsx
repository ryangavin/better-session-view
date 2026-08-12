import { useMemo, useRef, type CSSProperties } from 'react';
import './ClipGrid.css';
import { hex, inkOn } from '../../../../core/src/color.js';
import { startsBand, type Column } from '../../../../core/src/trackColumns.js';
import type { SongHeader, TrackShape } from '../../../../core/src/songRows.js';
import type { ActiveCell } from '../../../../core/src/gridRange.js';
import { isLaunchModified, LAUNCH_KEY, type CellClick } from '../../lib/keys.js';
import {
  metricsFor,
  isViewportColumnWidth,
  tableWidth,
  META_COL_W,
  type ColumnWidth,
} from '../../lib/columnWidth.js';
import type { BridgeState, PlayState } from '../../hooks/useBridge.js';
import { useMeters } from '../../hooks/useMeters.js';
import { useTrackStatus } from '../../hooks/useTrackStatus.js';
import { useMixer } from '../../hooks/useMixer.js';
import { useViewportColumnWidth } from '../../hooks/useViewportColumnWidth.js';
import { armedTracks, marksByScene } from '../../lib/rowMarks.js';
import type { Anchor } from '../../hooks/useAnchoredPosition.js';
import { NO_SHAPES, STOP_FIRED } from './constants.js';
import {
  IconAddSong,
  IconColorSongs,
  IconGroupFold,
  IconOrderSongs,
  IconStop,
} from '../Icon.js';
import { ControlButton, ControlGroup } from '../Control.js';
import { dropEdgeFor, sceneDropEdge } from './dropEdge.js';
import { Row } from './Row.js';
import { SongHeaderRow } from './SongHeaderRow.js';
import { TrackMeter } from './TrackMeter.js';
import { TrackStatusDisplay } from './TrackStatus.js';
import { TrackSends } from './TrackSends.js';
import { useMeterResize } from './useMeterResize.js';

export interface Props {
  snapshot: BSV.Snapshot;
  columns: Column<BSV.Track>[];
  clips: Map<string, BSV.Clip>;
  selected: ReadonlySet<string>;
  active: ActiveCell | null;
  play: PlayState;
  canControlLive: boolean;
  showStopClips: boolean;
  showMeters: boolean;
  showSends: boolean;
  subscribeMeters: BridgeState['subscribeMeters'];
  subscribeMixer: BridgeState['subscribeMixer'];
  subscribeClipStatus: BridgeState['subscribeClipStatus'];
  setMixer: BridgeState['setMixer'];
  /** Live's song tempo, which is what puts a one-shot's countdown in seconds. */
  tempo: number | undefined;
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
  /** Songs derivation found — order and rule-based color have nothing to do at 0. */
  songCount: number;
  /** Open the additive eight-scene song scaffold. */
  onAddSong: () => void;
  /** Open the running-order modal. */
  onReorder: () => void;
  /** Open the rule-based coloring modal. */
  onRecolor: () => void;
  /** First scene of the block being dragged, or -1. A primitive, so it can
   *  reach the memoized header row without re-rendering all of them. */
  dragFrom: number;
  /** Every scene in flight. Identity turns over only at drag start and end. */
  dragScenes: ReadonlySet<number>;
  /** Where the drop would land, as a gap in scene numbering, or -1. */
  dropAt: number;
  /** What the pending move costs, for the indicator. */
  dropNote: string;
  /** A song header hands over its whole run; a scene row hands over one index. */
  onSongDragStart: (sources: readonly number[]) => void;
  onSongDragOver: (from: number, to: number, below: boolean) => void;
  onSongDrop: () => void;
  onSongDragEnd: () => void;
  /**
   * Grab one scene by its number. App decides whether that means the scene or
   * the whole selection it belongs to — Row can't, without holding the
   * selection and re-rendering all 848 of itself to keep it.
   */
  onSceneDragStart: (s: number) => void;
  onSceneDragOver: (from: number, to: number, below: boolean) => void;
  onSceneDrop: () => void;
  onSceneDragEnd: () => void;
  /** scene -> the tracks lifting / landing in that row. See Row and RowMarks. */
  lifting: Map<number, string>;
  landing: Map<number, string>;
  /** Grab a clip. App decides whether that's the clip or the whole selection. */
  onClipDragStart: (t: number, s: number) => void;
  onClipDragOver: (t: number, s: number) => void;
  onClipDrop: () => void;
  onClipDragEnd: () => void;
  onClip: (t: number, s: number, mods: CellClick) => void;
  onScene: (s: number, mods: CellClick) => void;
  onFireScene: (s: number) => void;
  /**
   * Fire the slot at this position — the clip on a track column, or every clip
   * the group holds in that scene on a group column.
   */
  onFireClip: (t: number, s: number) => void;
  /**
   * Open the role picker on a scene's chip. The anchor comes from here because
   * the chip is the only thing that knows where it ended up; the menu itself is
   * rendered by `App`, so opening one doesn't re-render 848 memoized rows.
   */
  onRoleMenu: (s: number, anchor: Anchor) => void;
  onStopTrack: (t: number) => void;
  onStopAll: () => void;
  onToggleGroup: (trackIndex: number) => void;
}

function StopClipsButton({
  label,
  title = label,
  stopping,
  disabled,
  onClick,
}: {
  label: string;
  title?: string;
  stopping: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <ControlButton
      pressed={stopping}
      className="stop-clips-button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <IconStop />
    </ControlButton>
  );
}

export function ClipGrid({
  snapshot,
  columns,
  clips,
  selected,
  active,
  play,
  canControlLive,
  showStopClips,
  showMeters,
  showSends,
  subscribeMeters,
  subscribeMixer,
  subscribeClipStatus,
  setMixer,
  tempo,
  columnWidth,
  palette,
  roleColors,
  selectedScenes,
  songHeaders,
  hiddenScenes,
  songShapes,
  onToggleSong,
  onPickSong,
  songCount,
  onAddSong,
  onReorder,
  onRecolor,
  dragFrom,
  dragScenes,
  dropAt,
  dropNote,
  onSongDragStart,
  onSongDragOver,
  onSongDrop,
  onSongDragEnd,
  onSceneDragStart,
  onSceneDragOver,
  onSceneDrop,
  onSceneDragEnd,
  lifting,
  landing,
  onClipDragStart,
  onClipDragOver,
  onClipDrop,
  onClipDragEnd,
  onClip,
  onScene,
  onFireScene,
  onFireClip,
  onRoleMenu,
  onStopTrack,
  onStopAll,
  onToggleGroup,
}: Props) {
  const marks = useMemo(() => marksByScene(play), [play]);
  // One string for the whole grid rather than a token per row: arm is a track
  // property and every row's answer is the same. Recomputing it on each play
  // push costs nothing, and an unchanged string is memo-equal — see rowMarks.
  const armed = useMemo(() => armedTracks(play), [play]);
  const stoppingAll =
    play.tracks.some((state) => state.playing >= 0) &&
    play.tracks.every((state) => state.playing < 0 || state.fired === STOP_FIRED);
  const meters = useMeters(subscribeMeters, showMeters);
  const statuses = useTrackStatus(subscribeClipStatus, showStopClips, tempo);
  const mixer = useMixer(subscribeMixer, showMeters || showSends);
  const tableRef = useRef<HTMLTableElement>(null);
  const meterResize = useMeterResize(tableRef, showMeters);
  const viewportWidth = isViewportColumnWidth(columnWidth) ? columnWidth : null;
  useViewportColumnWidth(tableRef, viewportWidth, columns.length);
  const masterFill = useMemo<CSSProperties | undefined>(() => {
    // Null is the explicit fallback when the embedded Live runtime cannot read
    // the documented Master Track.color atom. Undefined also tolerates a UI
    // briefly paired with an older bridge during development.
    if (snapshot.masterColor == null) return undefined;
    return {
      background: hex(snapshot.masterColor),
      color: inkOn(snapshot.masterColor),
    } as CSSProperties;
  }, [snapshot.masterColor]);

  // Widths ride down as custom properties on the table rather than as props on
  // Row. Row is memoized, and a new prop on it would re-render all 848 scenes
  // on every width change; this way the browser just recalculates layout.
  const style = useMemo<CSSProperties>(() => {
    // The constants still ride down from here so columnWidth.ts stays the one
    // place the grid states a width — shared.css values are fallbacks, not the
    // source. Viewport modes write their two moving values through the resize
    // observer so resizing never has to re-render the scene rows.
    const common = {
      '--meta-col-w': `${META_COL_W}px`,
    } as CSSProperties;
    if (isViewportColumnWidth(columnWidth)) return common;
    return {
      ...common,
      '--col-w': `${metricsFor(columnWidth).col}px`,
      width: `${tableWidth(columnWidth, columns.length)}px`,
    } as CSSProperties;
  }, [columnWidth, columns.length]);

  return (
    <table ref={tableRef} className="grid" style={style}>
      {/* Column widths come from here rather than the header row: the song
          header's notice cell spans the whole grid, and a colSpan would
          otherwise have to distribute its width across the columns it covers,
          at which point the widths stop being exact. */}
      <colgroup>
        <col className="meta-col" />
        {/* Master is a track column in everything that costs width: it takes
            `--col-w` from the same `<col>` rule the tracks do, which is what
            makes its strip the same size as theirs and its role chips the same
            size as the clips beside them. */}
        <col />
        {columns.map((c) => (
          <col key={c.kind === 'track' ? `t${c.track.i}` : `g${c.group.i}`} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {/* The metadata column's heading. It is the app's own column — scene
              numbers and the facts a scene states — so it carries the app's own
              actions and none of Live's identity. The heading leads from the
              left; reorder, color and add follow the spacer from the right.

              Flex on a wrapper div, never on the `th`: `display: flex` on a
              table cell stops it being a table cell and takes the grid's fixed
              layout with it. */}
          <th className="meta-h">
            <div className="meta-h-line">
              <span className="meta-h-title">Songs</span>
              <div className="spacer" />
              <div className="song-action-groups">
                <ControlGroup
                  className="song-action-group"
                  label="Live Set actions"
                  appearance="bare"
                >
                  <ControlButton
                    icon
                    className="song-action"
                    aria-label="Reorder songs"
                    disabled={songCount === 0}
                    title="Reorder songs by name, tag, key, BPM, or drag"
                    onClick={onReorder}
                  >
                    <IconOrderSongs />
                  </ControlButton>
                  <ControlButton
                    icon
                    className="song-action"
                    aria-label="Color songs"
                    disabled={songCount === 0}
                    title="Color songs by key, BPM, rainbow, or random"
                    onClick={onRecolor}
                  >
                    <IconColorSongs />
                  </ControlButton>
                  <ControlButton
                    icon
                    className="song-action"
                    aria-label="Add a song"
                    title="Add a new song with eight scenes"
                    onClick={onAddSong}
                  >
                    <IconAddSong />
                  </ControlButton>
                </ControlGroup>
              </div>
            </div>
          </th>
          {/* Live's Master track, at the head of its own column — filled with
              Live's Master color exactly as every track header is filled with
              its track's. What sits under it is Live's too: the scene
              launchers, the stop-all button and the Master strip. */}
          <th className="master-h" style={masterFill} title="Live's Master track">
            <span className="th-line">
              <span className="th-label">Master</span>
            </span>
          </th>
          {columns.map((c, i) => {
            // The band that replaced the group header row. A colored rule along
            // the top of every column in a group, capped at the left where the
            // run starts so two adjacent groups never read as one.
            const band = c.group
              ? ({
                  '--band': hex(c.group.color),
                } as CSSProperties)
              : undefined;
            const bandClass = c.group
              ? ` banded${startsBand(columns, i) ? ' band-start' : ''}`
              : '';

            // The header row re-renders on every play change and is ~40 cells,
            // so it reads PlayState directly rather than going through marks.
            const track = c.kind === 'track' ? c.track : c.group;
            const st = play.tracks[track.i];
            const live = st !== undefined && st.playing >= 0;
            const stopping = st !== undefined && st.fired === STOP_FIRED;
            const state = `${live ? ' live' : ''}${stopping ? ' stopping' : ''}`;

            // Every header is filled with its own Live color, which is the
            // thing that makes a group read as containing its tracks rather
            // than sitting beside them: the band says where the group reaches,
            // and the fills underneath say these are tracks. Painting only the
            // group's color — which is what this did — left the members looking
            // like ungrouped tracks that happened to be adjacent.
            //
            // `inkOn` picks black or white per swatch. Live's palette runs from
            // near-black to near-white, so no single text color survives it.
            const fill = { background: hex(track.color), color: inkOn(track.color) };

            if (c.kind === 'group') {
              // The whole header is the fold control, so the badge isn't a
              // separate button — the name is as much a click target as the
              // icon, which is what makes a 40-column grid tolerable to fold.
              // ⌘-click still stops, same as any track header, and on a group
              // Live's stop_all_clips takes the members with it.
              return (
                <th
                  key={`g${c.group.i}`}
                  className={`track-h group-h${state}${bandClass}`}
                  style={{ ...band, ...fill } as CSSProperties}
                  title={
                    `${c.group.name} — ${c.members.length} track` +
                    `${c.members.length === 1 ? '' : 's'} · click to ` +
                    `${c.collapsed ? 'expand' : 'collapse'} · ` +
                    `${LAUNCH_KEY}-click stops the group`
                  }
                  onClick={(e) => {
                    if (isLaunchModified(e)) onStopTrack(c.group.i);
                    else onToggleGroup(c.group.i);
                  }}
                >
                  <span className="th-line">
                    <span className="th-label">{c.group.name}</span>
                    <span className="fold">
                      <IconGroupFold folded={c.collapsed} />
                    </span>
                  </span>
                </th>
              );
            }
            return (
              <th
                key={`t${c.track.i}`}
                className={`track-h${state}${bandClass}`}
                style={{ ...band, ...fill } as CSSProperties}
                title={`${c.track.name} — ${LAUNCH_KEY}-click to stop this track`}
                onClick={(e) => {
                  if (isLaunchModified(e)) onStopTrack(c.track.i);
                }}
              >
                <span className="th-line">
                  <span className="th-label">{c.track.name}</span>
                </span>
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
                armed={armed}
                active={
                  active === null || active.s !== scene.i
                    ? undefined
                    : active.on === 'scene'
                      ? 'scene'
                      : active.t
                }
                roleColors={roleColors}
                sceneSelected={selectedScenes.has(scene.i)}
                dragging={dragScenes.has(scene.i)}
                dropEdge={sceneDropEdge(
                  scene.i,
                  dropAt,
                  snapshot.sceneCount - 1,
                  songHeaders,
                )}
                onClip={onClip}
                onScene={onScene}
                onFireScene={onFireScene}
                onFireClip={onFireClip}
                onRoleMenu={onRoleMenu}
                onSceneDragStart={onSceneDragStart}
                onSceneDragOver={onSceneDragOver}
                onSceneDrop={onSceneDrop}
                onSceneDragEnd={onSceneDragEnd}
                lifting={lifting.get(scene.i)}
                landing={landing.get(scene.i)}
                onClipDragStart={onClipDragStart}
                onClipDragOver={onClipDragOver}
                onClipDrop={onClipDrop}
                onClipDragEnd={onClipDragEnd}
              />,
            );
          }
          return out;
        })}
      </tbody>
      {(showStopClips || showSends || showMeters) && (
        <tfoot>
          {showStopClips && (
            <tr className="stop-row">
              {/* The metadata column holds nothing in the footer: everything
                  down here belongs to a Live output, and it isn't one. */}
              <td className="meta-cell" />
              <td className="master-cell">
                <StopClipsButton
                  label="Stop all clips"
                  title="Stop all clips, keep the song rolling (Esc)"
                  stopping={stoppingAll}
                  disabled={!canControlLive}
                  onClick={onStopAll}
                />
              </td>
              {columns.map((column) => {
                const track = column.kind === 'track' ? column.track : column.group;
                return (
                  <td key={track.i}>
                    <StopClipsButton
                      label={`Stop clips on ${track.name}`}
                      stopping={play.tracks[track.i]?.fired === STOP_FIRED}
                      disabled={!canControlLive}
                      onClick={() => onStopTrack(track.i)}
                    />
                    {/* Live's Track Status Display, in the place Live puts it.
                        Drawn over the stop button rather than beside it, and
                        deaf to the pointer, so the whole cell stays one large
                        stop target while still reporting what the track is
                        doing. */}
                    <TrackStatusDisplay store={statuses} t={track.i} />
                  </td>
                );
              })}
            </tr>
          )}
          {showSends && (
            <tr className="sends-row">
              <td className="sends-cell meta-cell" />
              <td className="sends-cell master-cell" aria-label="Master has no sends" />
              {columns.map((column) => {
                const track = column.kind === 'track' ? column.track : column.group;
                return (
                  <TrackSends
                    key={track.i}
                    trackIndex={track.i}
                    label={track.name}
                    mixer={mixer}
                    setMixer={setMixer}
                  />
                );
              })}
            </tr>
          )}
          {showMeters && (
            <tr
              className={`meter-row${meterResize.dragging ? ' dragging' : ''}`}
              {...meterResize.rowProps}
            >
              <td className="meter-cell meta-cell" />
              {/* Master owns a column now, so its strip is the same 56px as
                  every other strip in the row rather than one centered in a
                  cell three times too wide for it. */}
              <TrackMeter
                meterKey="master"
                label="Master"
                meters={meters}
                mixer={mixer}
                setMixer={setMixer}
                hideTrackControls
              />
              {columns.map((column) => {
                const track = column.kind === 'track' ? column.track : column.group;
                return (
                  <TrackMeter
                    key={track.i}
                    meterKey={track.i}
                    label={track.name}
                    meters={meters}
                    mixer={mixer}
                    setMixer={setMixer}
                    isGroup={track.isGroup}
                  />
                );
              })}
            </tr>
          )}
        </tfoot>
      )}
    </table>
  );
}
