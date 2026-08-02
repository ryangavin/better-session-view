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
import { mergeShapes, type SongHeader, type TrackShape } from '../../../core/src/songRows.js';
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

/**
 * Empty clip slots inherit their track group's hue at this opacity. The dark
 * grid underneath does the darkening, so clips can keep using their full Live
 * color and remain the strongest marks in the column.
 */
const GROUP_CELL_ALPHA = '0c';

/** Live's own encoding: the track's stop button is fired and blinking. */
const STOP_FIRED = -2;

/** One shared empty map, so an open song's header stays memo-stable. */
const NO_SHAPES: Map<number, TrackShape> = new Map();

/**
 * What a mark is painted for clips on scenes carrying no role.
 *
 * A neutral grey rather than the song's own color: it stands for the absence of
 * a section, and painting it the song color would make an unmapped track look
 * like it had been given one.
 */
const UNTAGGED = 0x6e6e78;

function isShape(s: TrackShape | undefined): s is TrackShape {
  return s !== undefined;
}

/** `CHORUS ×4, JAM1` — what a track plays, for the cell's tooltip. */
function sections(shape: TrackShape): string {
  const named = shape.roles.map((r) => (r.scenes > 1 ? `${r.name} ×${r.scenes}` : r.name));
  if (shape.untagged > 0) named.push(`${shape.untagged} untagged`);
  return named.length === 0 ? 'no sections' : named.join(', ');
}

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
        {/* The role leads, ahead of the name. Everything to the left of the
            title is then a fixed width — fire button, scene number, chip — so a
            column of scene names starts on one vertical line and the roles
            beside them are a column of their own. Same reasoning as the song
            header's slots: a hundred rows of this is a table, and a table has
            columns.

            A scene with no role still reserves the chip's width, and draws
            nothing in it. Blank rather than dashed for two reasons: an absence
            that draws nothing answers faster than a faint one, and a dashed
            chip already means something else here — a role that exists and has
            no color. */}
        {role === null ? (
          <span className="role-chip none" />
        ) : (
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
        {title ? (
          <span style={named ? { color: named } : undefined}>{title}</span>
        ) : (
          <span className="unnamed">—</span>
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
              clip
                ? { background: hex(clip.color), color: inkOn(clip.color) }
                : c.group
                  ? { background: `${hex(c.group.color)}${GROUP_CELL_ALPHA}` }
                  : undefined
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
 * A song's header, spanning the grid above the first scene of one of its
 * blocks.
 *
 * Memoized on primitives for the same reason `Row` is: there can be a hundred
 * of these, and they must not all re-render because one song folded. That's why
 * `SongHeader` in core carries rendered strings rather than the observed arrays.
 *
 * The four non-primitive props are all deliberate exceptions, and all safe for
 * the same reason: `header`, `columns`, `shapes` and `roleColors` are rebuilt only
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
  rgb,
  shapes,
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
  /** The song's color, or -1 when it has none or its scenes disagree. A number
   *  rather than the palette, so this row stays memoizable on primitives. */
  rgb: number;
  /**
   * Track index → what that track plays in this block. Empty while the song is
   * open: the shape stands in for rows that are on screen anyway.
   */
  shapes: Map<number, TrackShape>;
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
  const cls = [
    'song-row',
    header.collapsed ? 'collapsed' : '',
    rgb >= 0 ? 'colored' : '',
    dragging ? 'dragging' : '',
    dropEdge ? `drop-${dropEdge}` : '',
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
          // Half strength, for the cells right of the title — see the note on
          // `.song-row.colored td` in styles.css.
          '--song-wash-dim': `${hex(band)}12`,
        } as CSSProperties);

  // Folded, the header stands in for the rows it hides, so each track column
  // says what that track plays in this song. Open, the clips speak for
  // themselves and the header becomes one uninterrupted band.
  const folded = header.collapsed;
  // What the tiles give up their space for. Both are things you have to act on
  // — a fault to fix, a move about to happen — and both outrank a summary of
  // what the song contains. `part 2 of 2` is neither, so it stays beside the
  // name; a reprise is exactly where the tiles are worth most.
  const notice = header.colorClash || dropNote !== '';

  const title = (
    /* Fixed-width slots rather than a run of inline spans, so a hundred headers
       read as columns. Each holds its width whether or not the song fills it —
       an empty slot is what keeps the next song's name on the same vertical
       line. Blank rather than a placeholder dash, for the reason an unused
       column draws nothing. */
    <div className="song-line">
      <span className="fold">{header.collapsed ? '▸' : '▾'}</span>
      {/* The facts lead, so the key lands immediately left of the name it
          describes — and bpm before key is the order the naming convention
          itself writes, `@128-Bm`. Both right-aligned: the values differ in
          width ("94" / "128", "Bm" / "F#m") and their right edges are what a
          column of them should line up on. */}
      <span className={`facts${header.clash ? ' clash' : ''}`}>
        <span className="bpm">{header.bpm}</span>
        <span className="key">{header.key}</span>
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
      {/* Only worth saying when there is more than one — a song in two runs is
          a reprise, or it's two different songs sharing a name. Folded, it
          shortens to `2/2`: it has to share the scene column with the shape,
          and the tooltip still spells it out. */}
      {header.blocks > 1 &&
        (header.collapsed ? (
          <span className="part" title={`part ${header.block} of ${header.blocks}`}>
            {header.block}/{header.blocks}
          </span>
        ) : (
          <span className="part">
            part {header.block} of {header.blocks}
          </span>
        ))}
      {/* Open, there's a whole row spare, so the exceptions say their piece in
          full right here. Folded, they move out to the tile region — see
          `notice`. */}
      {!header.collapsed && header.colorClash && (
        <span
          className="mixed-color"
          title="This song's scenes hold more than one color — pick a swatch to make it one"
        >
          mixed color
        </span>
      )}
      {!header.collapsed && dropNote !== '' && (
        <span className="drop-note">{dropNote}</span>
      )}
    </div>
  );

  // The lead cell is the drag handle whichever shape the row is in: folded it's
  // the scene column, open it spans the grid.
  const lead = {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLTableCellElement>) => {
      // Firefox refuses to start a drag unless something is set.
      e.dataTransfer.setData('text/plain', header.song);
      e.dataTransfer.effectAllowed = 'move';
      onDragStart(header.from, header.to);
    },
    onDragEnd,
  };

  return (
    <tr
      className={cls}
      style={paint}
      // Folding is the row's job, not the lead cell's — a folded header is
      // several cells wide and a click on any of them means the same thing.
      onClick={() => onToggle(header.songKey)}
      // Which half of the row the pointer is in decides whether the block lands
      // above or below this song. A row is tall enough for that to be a
      // comfortable target, and it's the idiom every list-reorder UI uses.
      onDragOver={(e) => {
        e.preventDefault();
        // Without this the cursor shows "copy" and, in some browsers, the drop
        // never fires at all.
        e.dataTransfer.dropEffect = 'move';
        const box = e.currentTarget.getBoundingClientRect();
        onDragOver(header.from, header.to, e.clientY > box.top + box.height / 2);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      {!folded ? (
        <td colSpan={columns.length + 1} {...lead}>
          {title}
        </td>
      ) : (
        <>
          <td className="song-lead" {...lead}>
            {title}
          </td>
          {notice ? (
            <td className="song-notice" colSpan={columns.length}>
              {header.colorClash && (
                <span
                  className="mixed-color"
                  title="This song's scenes hold more than one color — pick a swatch to make it one"
                >
                  mixed color
                </span>
              )}
              {/* The cost, on the indicator itself. This move can't be undone
                  from here, so what it's about to do belongs in front of you
                  while your finger is still on the mouse — not in the log
                  afterwards. Worth the whole tile region for the two seconds a
                  drag lasts. */}
              {dropNote !== '' && <span className="drop-note">{dropNote}</span>}
            </td>
          ) : (
            columns.map((c) => {
              const grouped = c.kind === 'folded';
              // A folded group column stands for several tracks, so its cell
              // shows what any of them play — the union, same as a folded clip
              // cell stands in for the members underneath it.
              const shape = grouped
                ? mergeShapes(c.members.map((t) => shapes.get(t)).filter(isShape))
                : shapes.get(c.track.i);
              const name = grouped ? c.group.name : c.track.name;
              const used = grouped
                ? c.members.filter((t) => shapes.has(t)).length
                : (shape?.scenes ?? 0);
              const of = grouped ? c.members.length : header.scenes;
              return (
                <td
                  key={grouped ? `g${c.group.i}` : `t${c.track.i}`}
                  className="fill"
                  title={
                    used === 0
                      ? `${name} — nothing in ${header.song}`
                      : `${name} — ${sections(shape!)} · ` +
                        (grouped
                          ? `${used} of ${of} tracks used in ${header.song}`
                          : `${used} of ${of} scene${of === 1 ? '' : 's'} of ${header.song}`)
                  }
                >
                  {/* The sections of the song this track plays, in order. Not a
                      density bar: that a track is used is the smaller half of
                      the question, and "the sparkle pad is in the choruses" is
                      the half you're actually asking when you're deciding what
                      to blend into next.

                      Centred, matching the track name above it, and squares of
                      the same 9px the role marks use everywhere else so the row
                      reads as one language of tiles. An empty column draws
                      nothing at all — an absence answers faster than a faint
                      presence. */}
                  {shape && (
                    <span className="roles">
                      {shape.roles.map((r) => {
                        const roleRgb = roleColors.get(roleKey(r.name));
                        return (
                          <span
                            key={roleKey(r.name)}
                            className={`role-tile${roleRgb === undefined ? ' uncolored' : ''}`}
                            style={
                              roleRgb === undefined
                                ? undefined
                                : { background: hex(roleRgb) }
                            }
                          />
                        );
                      })}
                      {/* Clips on scenes nobody has tagged yet. Shown, not
                          dropped: a set mid-mapping is mostly untagged, and a
                          track used only there still has to read as used or the
                          header lies about what the song holds. */}
                      {shape.untagged > 0 && (
                        <span
                          className="role-tile"
                          style={{ background: hex(UNTAGGED) }}
                        />
                      )}
                    </span>
                  )}
                </td>
              );
            })
          )}
        </>
      )}
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
      '--role-chip-w': `${m.role}px`,
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
              />,
            );
          }
          return out;
        })}
      </tbody>
    </table>
  );
}
