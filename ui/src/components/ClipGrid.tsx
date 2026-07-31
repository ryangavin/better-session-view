import { memo, useMemo, type CSSProperties, type MouseEvent } from 'react';
import { hex, inkOn, legibleOn } from '../../../core/src/color.js';
import { nameWithoutRole, roleIn, roleKey } from '../../../core/src/roles.js';
import { headerSpans, type Column } from '../../../core/src/trackColumns.js';
import type { SongHeader } from '../../../core/src/songRows.js';
import type { ActiveCell } from '../../../core/src/gridRange.js';
import { clipKey } from '../lib/selection.js';
import { isAddModified, isLaunchModified, LAUNCH_KEY } from '../lib/keys.js';
import { metricsFor, tableWidth, type ColumnWidth } from '../lib/columnWidth.js';
import type { PlayState } from '../lib/useBridge.js';

/** --bg. Scene names are painted straight onto it, so legibility is measured against it. */
const PANEL = 0x0a0a0b;

/** Live's own encoding: the track's stop button is fired and blinking. */
const STOP_FIRED = -2;

export interface CellClick {
  /** True when the click carried the launch modifier — see lib/keys.ts. */
  launch: boolean;
  /** Extend the selection from the active cell. */
  extend: boolean;
  /** Add to the selection instead of replacing it. */
  add: boolean;
}

interface Props {
  snapshot: BSV.Snapshot;
  columns: Column<BSV.Track>[];
  clips: Map<string, BSV.Clip>;
  selected: ReadonlySet<string>;
  active: ActiveCell | null;
  play: PlayState;
  columnWidth: ColumnWidth;
  /** roleKey → the RGB its chip is painted. Must be a stable identity — see Row. */
  roleColors: Map<string, number>;
  selectedScenes: ReadonlySet<number>;
  /** Scene index → the song header sitting directly above it. */
  songHeaders: Map<number, SongHeader>;
  /** Scenes inside a collapsed song. Their rows aren't rendered. */
  hiddenScenes: ReadonlySet<number>;
  onToggleSong: (songKey: string) => void;
  /** Select every scene of a song, across all its blocks. */
  onPickSong: (songKey: string) => void;
  onClip: (t: number, s: number, mods: CellClick) => void;
  onScene: (s: number, mods: CellClick) => void;
  onFireScene: (s: number) => void;
  onStopTrack: (t: number) => void;
  onToggleGroup: (trackIndex: number) => void;
}

/**
 * One row's play state, as a single string — `|p3|f7|` — or `undefined`.
 *
 * This shape is load-bearing. `Row` is memoized, and play state changes many
 * times a second while a set is rolling, so passing the whole `PlayState` down
 * would re-render all 848 rows on every change. Flattened to a primitive, the
 * ~846 rows with nothing happening get `undefined`, memo's identity check
 * passes, and only the one or two rows that actually changed re-render.
 *
 * Tokens are delimited on both sides so `p1` can't match inside `p10`.
 */
type RowMarks = string | undefined;

/**
 * Scene index → its marks, built by walking the *tracks*.
 *
 * The obvious direction — for each scene, scan the tracks — is 848 × trackCount
 * work on every play change, several times a second. A track contributes to at
 * most two scenes, so walking tracks instead is O(trackCount) and produces the
 * same map.
 */
function marksByScene(play: PlayState): Map<number, string> {
  const m = new Map<number, string>();
  const add = (s: number, token: string) => m.set(s, (m.get(s) ?? '') + token);
  play.tracks.forEach((st, t) => {
    // fired === STOP_FIRED is negative and belongs to the track header, not a row.
    if (st.playing >= 0) add(st.playing, `|p${t}`);
    if (st.fired >= 0) add(st.fired, `|f${t}`);
  });
  for (const [s, v] of m) m.set(s, `${v}|`);
  return m;
}

function has(marks: RowMarks, token: string): boolean {
  return marks !== undefined && marks.indexOf(`|${token}|`) >= 0;
}

function mods(e: MouseEvent): CellClick {
  return { launch: isLaunchModified(e), extend: e.shiftKey, add: isAddModified(e) };
}

interface RowProps {
  scene: BSV.Scene;
  columns: Column<BSV.Track>[];
  clips: Map<string, BSV.Clip>;
  selected: ReadonlySet<string>;
  marks: RowMarks;
  /** Track index when the active cell is a clip in this row, `'scene'` when it's the name. */
  active: number | 'scene' | undefined;
  roleColors: Map<string, number>;
  sceneSelected: boolean;
  onClip: Props['onClip'];
  onScene: Props['onScene'];
  onFireScene: Props['onFireScene'];
}

// memo on the row is what keeps toggling one cell from re-rendering all 848
// scenes. Without it this is slower than the innerHTML version it replaced.
const Row = memo(function Row({
  scene,
  columns,
  clips,
  selected,
  marks,
  active,
  roleColors,
  sceneSelected,
  onClip,
  onScene,
  onFireScene,
}: RowProps) {
  // Live allows a scene to have no color at all, which is not the same as
  // palette slot 0 — see Scene.colorIndex in the protocol.
  const named = scene.colorIndex >= 0 ? hex(legibleOn(scene.color, PANEL)) : undefined;
  // There is no "scene is playing" property in the LOM, so derive it: a scene
  // is sounding if any track is playing a clip in this row.
  const sceneLive = marks !== undefined && marks.indexOf('|p') >= 0;
  const sceneFired = marks !== undefined && marks.indexOf('|f') >= 0;

  // The role is parsed out of the name and shown as a chip, so the grid reads
  // as "Nightfall · CHORUS" while Live still holds the literal
  // "Nightfall [chorus]" — which is the whole point of storing it there.
  const role = roleIn(scene.name);
  const title = role === null ? scene.name : nameWithoutRole(scene.name);
  const roleRgb = role === null ? undefined : roleColors.get(roleKey(role));

  return (
    <tr>
      <td
        className={
          `scene${active === 'scene' ? ' active' : ''}` +
          `${sceneSelected ? ' picked' : ''}`
        }
        data-active={active === 'scene' ? '1' : undefined}
        title={
          `${scene.name || `Scene ${scene.i + 1}`} — click selects every clip in it` +
          ` · ⇧ extends over scenes · ${LAUNCH_KEY}-click fires it`
        }
        onClick={(e) => onScene(scene.i, mods(e))}
      >
        <button
          type="button"
          className={`fire${sceneLive ? ' live' : ''}${sceneFired ? ' fired' : ''}`}
          title={`Fire scene ${scene.i + 1}`}
          // The row's own click selects; this button only ever fires, so let it
          // do that on a plain click without breaking the modifier rule.
          onClick={(e) => {
            e.stopPropagation();
            onFireScene(scene.i);
          }}
        >
          ▶
        </button>
        <span className="scene-n">{scene.i + 1}</span>
        {title ? (
          <span style={named ? { color: named } : undefined}>{title}</span>
        ) : (
          <span className="unnamed">—</span>
        )}
        {role !== null && (
          <span
            className={`role-chip${roleRgb === undefined ? ' uncolored' : ''}`}
            style={
              roleRgb === undefined
                ? undefined
                : { background: hex(roleRgb), color: inkOn(roleRgb) }
            }
            title={
              roleRgb === undefined
                ? `${role} — no color set for this role`
                : `role: ${role}`
            }
          >
            {role}
          </span>
        )}
      </td>
      {columns.map((c) => {
        if (c.kind === 'folded') {
          // The group's own clip slots aren't in the snapshot, so stand in for
          // it with what's underneath: how many of its tracks have a clip here.
          const n = c.members.reduce(
            (acc, t) => acc + (clips.has(clipKey(t, scene.i)) ? 1 : 0),
            0,
          );
          const live = c.members.some((t) => has(marks, `p${t}`));
          return (
            <td
              key={`g${c.group.i}`}
              className={`cell folded${n ? ' has' : ''}${live ? ' playing' : ''}`}
              style={n ? { background: hex(c.group.color) + '2e' } : undefined}
              title={`${c.group.name} — ${n} of ${c.members.length} tracks have a clip here`}
            >
              {n || ''}
            </td>
          );
        }

        const t = c.track.i;
        const key = clipKey(t, scene.i);
        const clip = clips.get(key);
        const isSel = selected.has(key);
        const playing = has(marks, `p${t}`);
        const fired = has(marks, `f${t}`);
        return (
          <td
            key={key}
            className={
              `cell${clip ? ' has' : ''}${isSel ? ' sel' : ''}` +
              `${active === t ? ' active' : ''}${playing ? ' playing' : ''}` +
              `${fired ? ' fired' : ''}`
            }
            data-active={active === t ? '1' : undefined}
            style={
              clip ? { background: hex(clip.color), color: inkOn(clip.color) } : undefined
            }
            title={
              clip
                ? `${clip.name}  ·  index ${clip.colorIndex}  ·  ${LAUNCH_KEY}-click to fire`
                : `empty — ${LAUNCH_KEY}-click stops this track`
            }
            onClick={(e) => onClip(t, scene.i, mods(e))}
          >
            {clip?.name}
          </td>
        );
      })}
    </tr>
  );
});

/**
 * A song's header, spanning the whole grid above the first scene of one of its
 * blocks.
 *
 * Memoized on primitives for the same reason `Row` is: there can be a hundred
 * of these, and they must not all re-render because one song folded. That's why
 * `SongHeader` in core carries rendered strings rather than the observed arrays.
 */
const SongHeaderRow = memo(function SongHeaderRow({
  header,
  span,
  onToggle,
  onPickSong,
}: {
  header: SongHeader;
  span: number;
  onToggle: (songKey: string) => void;
  onPickSong: (songKey: string) => void;
}) {
  const facts = [header.bpm, header.key].filter((f) => f !== '');
  return (
    <tr className={`song-row${header.collapsed ? ' collapsed' : ''}`}>
      {/* The row folds; the title selects. Two jobs on one row, and the title
          gets the smaller target because folding is the frequent navigation
          gesture while "work on this song" is the deliberate one. */}
      <td colSpan={span} onClick={() => onToggle(header.songKey)}>
        <span className="fold">{header.collapsed ? '▸' : '▾'}</span>
        <button
          type="button"
          className="song"
          title={`Work on ${header.song} — selects every scene of it`}
          onClick={(e) => {
            e.stopPropagation();
            onPickSong(header.songKey);
          }}
        >
          {header.song}
        </button>
        {facts.length > 0 && (
          <span className={`facts${header.clash ? ' clash' : ''}`}>
            {facts.join(' · ')}
          </span>
        )}
        <span className="count">
          {header.scenes} scene{header.scenes === 1 ? '' : 's'}
        </span>
        {/* Only worth saying when there is more than one — a song in two runs
            is a reprise, or it's two different songs sharing a name. */}
        {header.blocks > 1 && (
          <span className="part">
            part {header.block} of {header.blocks}
          </span>
        )}
      </td>
    </tr>
  );
});

export function ClipGrid({
  snapshot,
  columns,
  clips,
  selected,
  active,
  play,
  columnWidth,
  roleColors,
  selectedScenes,
  songHeaders,
  hiddenScenes,
  onToggleSong,
  onPickSong,
  onClip,
  onScene,
  onFireScene,
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
    return {
      '--col-w': `${m.col}px`,
      '--scene-col-w': `${m.scene}px`,
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
                span={columns.length + 1}
                onToggle={onToggleSong}
                onPickSong={onPickSong}
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
              />,
            );
          }
          return out;
        })}
      </tbody>
    </table>
  );
}
