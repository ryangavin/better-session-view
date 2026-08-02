import {
  memo,
  useMemo,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { hex, inkOn, legibleOn } from '../../../core/src/color.js';
import { nameWithoutRole, roleIn, roleKey } from '../../../core/src/roles.js';
import { headerSpans, type Column } from '../../../core/src/trackColumns.js';
import type { RoleTally, SongHeader } from '../../../core/src/songRows.js';
import type { ActiveCell } from '../../../core/src/gridRange.js';
import { clipKey } from '../lib/selection.js';
import { isAddModified, isLaunchModified, LAUNCH_KEY } from '../lib/keys.js';
import { metricsFor, tableWidth, type ColumnWidth } from '../lib/columnWidth.js';
import type { PlayState } from '../lib/useBridge.js';

/** --bg. Scene names are painted straight onto it, so legibility is measured against it. */
const PANEL = 0x0a0a0b;

/** --rail, the song header's own background. The color band is measured on it. */
const RAIL = 0x0e0e10;

/**
 * A song band is a block of color rather than text, so it needs far less
 * contrast than a scene name does — but Live's palette holds colors dark enough
 * to vanish entirely on `--rail`, and a band you can't see is the one thing this
 * header exists to provide.
 */
const BAND_CONTRAST = 2.2;

/** What a fill tile is painted when its song has no color of its own. */
const UNCOLORED_BAND = 0x6e6e78;

/**
 * A fill tile: the song's color, opaque in proportion to how much of the song
 * that track covers.
 *
 * Floored well above nothing, because the first question the strip answers is
 * *whether* a track is used — a pad on one scene of twelve has to be visible,
 * even though a pad on all twelve should read louder.
 */
function tint(rgb: number, fraction: number): string {
  const base = rgb < 0 ? UNCOLORED_BAND : rgb;
  const alpha = Math.round(0x40 + Math.min(1, fraction) * 0x8f);
  return `${hex(base)}${alpha.toString(16).padStart(2, '0')}`;
}

/** Live's own encoding: the track's stop button is fired and blinking. */
const STOP_FIRED = -2;

/** One shared empty list, so an untagged song's header stays memo-stable. */
const NO_ROLES: RoleTally[] = [];

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
  /** Live's palette, for resolving a song header's color index to an RGB. */
  palette: number[];
  /** roleKey → the RGB its chip is painted. Must be a stable identity — see Row. */
  roleColors: Map<string, number>;
  selectedScenes: ReadonlySet<number>;
  /** Scene index → the song header sitting directly above it. */
  songHeaders: Map<number, SongHeader>;
  /** Scenes inside a collapsed song. Their rows aren't rendered. */
  hiddenScenes: ReadonlySet<number>;
  /** Block's first scene → track index → scenes of it holding a clip. */
  songFills: Map<number, Map<number, number>>;
  /** Block's first scene → the roles it uses, in first-appearance order. */
  songRoles: Map<number, RoleTally[]>;
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
 *
 * The four non-primitive props are all deliberate exceptions, and all safe for
 * the same reason: `columns`, `fill`, `roles` and `roleColors` are rebuilt only
 * when the set or the vocabulary changes — never on a fold, and never on the
 * mouse moves a drag produces, which are the two gestures that would otherwise
 * cost a hundred re-renders.
 */
/**
 * Which edge of this header the drop indicator belongs on, if either.
 *
 * A gap between two adjacent songs is addressable from both sides — song A
 * ending at 5 and song B starting at 6 are both "gap 6" — so this resolves
 * toward `above` and lets `below` render only where no header begins. That's the
 * tail of the set, which is the one gap `above` can't express.
 */
function dropEdgeFor(
  header: SongHeader,
  dropAt: number,
  headers: Map<number, SongHeader>,
): '' | 'above' | 'below' {
  if (dropAt < 0) return '';
  if (dropAt === header.from) return 'above';
  if (dropAt === header.to + 1 && !headers.has(dropAt)) return 'below';
  return '';
}

const SongHeaderRow = memo(function SongHeaderRow({
  header,
  columns,
  span,
  rgb,
  fill,
  roles,
  roleColors,
  dragging,
  dropEdge,
  dropNote,
  onToggle,
  onPickSong,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  header: SongHeader;
  columns: Column<BSV.Track>[];
  span: number;
  /** The song's color, or -1 when it has none or its scenes disagree. A number
   *  rather than the palette, so this row stays memoizable on primitives. */
  rgb: number;
  /**
   * Track index → scenes of this block holding a clip there, or `undefined`
   * when the song is open and there is nothing to stand in for.
   */
  fill: Map<number, number> | undefined;
  /**
   * The roles this block uses, in first-appearance order — the song's shape.
   * Empty while the song is open, for the same reason `fill` is `undefined`
   * then: it's shown on the strip, which stands in for the hidden rows.
   */
  roles: RoleTally[];
  /** roleKey → the RGB its square is painted. Shared with the scene rows' chips. */
  roleColors: Map<string, number>;
  /** This block is the one being dragged. */
  dragging: boolean;
  /** Which edge of this header the drop indicator sits on, if any. */
  dropEdge: '' | 'above' | 'below';
  /** What the drop would cost, shown on the indicator. `''` when not the target. */
  dropNote: string;
  onToggle: (songKey: string) => void;
  onPickSong: (songKey: string) => void;
  onDragStart: (from: number, to: number) => void;
  onDragOver: (from: number, to: number, below: boolean) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  // The strip stands in for the rows this song is hiding, so it exists only
  // while it's folded. Open, the clips speak for themselves.
  const strip = header.collapsed && fill !== undefined ? fill : null;
  const cls = [
    'song-row',
    header.collapsed ? 'collapsed' : '',
    rgb >= 0 ? 'colored' : '',
    dragging ? 'dragging' : '',
    // The block's bottom edge is the strip's when there is one, so the drop
    // line has to land under it rather than between the two halves.
    dropEdge === 'above' || (dropEdge === 'below' && !strip) ? `drop-${dropEdge}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  // Two custom properties rather than one: the solid left edge and the wash
  // behind the whole row are the same color at different strengths, and a
  // background gradient can't carry per-layer opacity. Alpha is appended as hex
  // the same way a folded group cell tints itself.
  const band = rgb < 0 ? rgb : legibleOn(rgb, RAIL, BAND_CONTRAST);
  const paint =
    rgb < 0
      ? undefined
      : ({
          '--song-rgb': hex(band),
          '--song-wash': `${hex(band)}24`,
        } as CSSProperties);

  // Drag handling is shared by both rows: the strip is the lower half of one
  // folded block, so a pointer over it always means "below this song" — there
  // is no meaningful "above" from down there.
  const over = (below: boolean) => (e: DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    // Without this the cursor shows "copy" and, in some browsers, the drop
    // never fires at all.
    e.dataTransfer.dropEffect = 'move';
    onDragOver(header.from, header.to, below);
  };
  const drop = (e: DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    onDrop();
  };

  return (
    <>
      <tr
        className={cls}
        style={paint}
        // Which half of the row the pointer is in decides whether the block lands
        // above or below this song. A row is tall enough for that to be a
        // comfortable target, and it's the idiom every list-reorder UI uses.
        onDragOver={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          over(e.clientY > box.top + box.height / 2)(e);
        }}
        onDrop={drop}
      >
        {/* The row folds; the title selects. Two jobs on one row, and the title
            gets the smaller target because folding is the frequent navigation
            gesture while "work on this song" is the deliberate one. */}
        <td
          colSpan={span}
          draggable
          onClick={() => onToggle(header.songKey)}
          onDragStart={(e) => {
            // Firefox refuses to start a drag unless something is set.
            e.dataTransfer.setData('text/plain', header.song);
            e.dataTransfer.effectAllowed = 'move';
            onDragStart(header.from, header.to);
          }}
          onDragEnd={onDragEnd}
        >
          {/* Fixed-width slots rather than a run of inline spans, so a hundred
              headers read as columns. Each one holds its width whether or not
              the song has anything to put in it — an empty slot is what keeps
              the next song's name on the same vertical line. Blank rather than
              a placeholder dash, for the reason the content strip leaves an
              unused column undrawn.

              No scene count: in a set built to a house length it says the same
              number a hundred times, and the block's size is already legible
              from the rows it spans. It survives as the fill tiles' denominator
              and in their tooltips. */}
          <div className="song-line">
            <span className="fold">{header.collapsed ? '▸' : '▾'}</span>
            {/* The facts lead, so the key lands immediately left of the name it
                describes — and bpm before key is the order the naming
                convention itself writes, `@128-Bm`. Both right-aligned: the
                values differ in width ("94" / "128", "Bm" / "F#m") and their
                right edges are what a column of them should line up on. */}
            <span className={`facts${header.clash ? ' clash' : ''}`}>
              <span className="bpm" title={header.bpm === '' ? undefined : 'bpm'}>
                {header.bpm}
              </span>
              <span className="key" title={header.key === '' ? undefined : 'key'}>
                {header.key}
              </span>
            </span>
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
            {/* A song is one color. When its scenes hold several, the header
                can't state one, so it says why instead of quietly showing
                nothing — "uncolored" and "colored inconsistently" look
                identical otherwise. */}
            {header.colorClash && (
              <span
                className="mixed-color"
                title="This song's scenes hold more than one color — pick a swatch to make it one"
              >
                mixed color
              </span>
            )}
            {/* Only worth saying when there is more than one — a song in two
                runs is a reprise, or it's two different songs sharing a name. */}
            {header.blocks > 1 && (
              <span className="part">
                part {header.block} of {header.blocks}
              </span>
            )}
            {/* The cost, on the indicator itself. This move can't be undone from
                here, so what it's about to do belongs in front of you while your
                finger is still on the mouse — not in the log afterwards. */}
            {dropNote !== '' && <span className="drop-note">{dropNote}</span>}
          </div>
        </td>
      </tr>
      {/* What the fold is hiding, in one row: which tracks this block actually
          uses, aligned under the track columns so the sticky header above names
          them. A set folded to a table of contents still says what's *in* each
          entry — which is what you need when you're picking what to blend into
          next, not what it's called. */}
      {strip && (
        <tr
          className={[
            'song-fill',
            rgb >= 0 ? 'colored' : '',
            dragging ? 'dragging' : '',
            dropEdge === 'below' ? 'drop-below' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={paint}
          onDragOver={over(true)}
          onDrop={drop}
          onClick={() => onToggle(header.songKey)}
        >
          {/* The scene column of the strip row, which the fill tiles leave
              empty. Two summaries of one folded song share it: its shape on the
              left, how wide it is on the right, up against the track columns
              the tiles start under. */}
          <td className="fill-lead">
            <div className="fill-lead-line">
              {/* The song's shape, one square per role in the order they first
                  appear — intro, verse, chorus, outro. Color only, with the
                  name on hover: a hundred folded songs are a page of color
                  signatures, and at that density a word per role is what turned
                  the header into a wall of text. The vocabulary's colors are
                  doing the naming, which is what they're for.

                  Folded only, and here rather than on the title row, because
                  this whole row exists to stand in for the scenes being hidden.
                  Open, every scene shows its own role chip, in order, which
                  beats a deduped summary of them. */}
              <span className="roles">
                {roles.map((r) => {
                  const roleRgb = roleColors.get(roleKey(r.name));
                  return (
                    <span
                      key={roleKey(r.name)}
                      className={`role-tile${roleRgb === undefined ? ' uncolored' : ''}`}
                      style={roleRgb === undefined ? undefined : { background: hex(roleRgb) }}
                      title={
                        `${r.name} — ${r.scenes} scene${r.scenes === 1 ? '' : 's'}` +
                        ` of ${header.song}` +
                        (roleRgb === undefined ? ' · no color set for this role' : '')
                      }
                    />
                  );
                })}
              </span>
              <span
                className="lead-count"
                title={`${strip.size} of this song's tracks hold clips`}
              >
                {strip.size} track{strip.size === 1 ? '' : 's'}
              </span>
            </div>
          </td>
          {columns.map((c) => {
            // A folded group is measured in *its tracks*, not in scenes: the
            // column stands for several tracks, so "3 of 5 used" is the honest
            // reading, and it's the same stand-in a folded cell already shows.
            const grouped = c.kind === 'folded';
            const used = grouped
              ? c.members.filter((t) => (strip.get(t) ?? 0) > 0).length
              : (strip.get(c.track.i) ?? 0);
            const of = grouped ? c.members.length : header.scenes;
            const name = grouped ? c.group.name : c.track.name;
            return (
              <td
                key={grouped ? `g${c.group.i}` : `t${c.track.i}`}
                className={`fill${used > 0 ? ' has' : ''}`}
                // The whole cell is the mark, not a bar inside it. The grid's
                // 2px border-spacing already separates the columns, so a filled
                // cell reads as a tile under its track name — and "which columns
                // are lit" is the question this row exists to answer.
                style={used > 0 ? { background: tint(band, used / of) } : undefined}
                title={
                  used === 0
                    ? `${name} — nothing in ${header.song}`
                    : grouped
                      ? `${name} — ${used} of ${of} tracks used in ${header.song}`
                      : `${name} — ${used} of ${of} scene${of === 1 ? '' : 's'} of ${header.song}`
                }
              />
            );
          })}
        </tr>
      )}
    </>
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
  palette,
  roleColors,
  selectedScenes,
  songHeaders,
  hiddenScenes,
  songFills,
  songRoles,
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
                columns={columns}
                span={columns.length + 1}
                // Only a folded block needs one, and asking for it here keeps
                // the prop `undefined` — and so memo-stable — for every open
                // song in the set.
                fill={header.collapsed ? songFills.get(header.from) : undefined}
                // Asked for here, like the fill, so an open song's props stay
                // memo-stable. `NO_ROLES` rather than a fresh `[]`, which would
                // be a new identity on every render.
                roles={
                  (header.collapsed ? songRoles.get(header.from) : undefined) ?? NO_ROLES
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
              />,
            );
          }
          return out;
        })}
      </tbody>
    </table>
  );
}
