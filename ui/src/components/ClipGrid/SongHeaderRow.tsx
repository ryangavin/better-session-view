import { memo, type CSSProperties, type DragEvent } from 'react';
import { hex, legibleOn } from '../../../../core/src/color.js';
import { roleKey } from '../../../../core/src/roles.js';
import type { Column } from '../../../../core/src/trackColumns.js';
import {
  mergeShapes,
  type SongHeader,
  type TrackShape,
} from '../../../../core/src/songRows.js';
import { BAND_CONTRAST, isShape, RAIL, UNTAGGED } from './constants.js';

/** `CHORUS ×4, JAM1` — what a track plays, for the cell's tooltip. */
function sections(shape: TrackShape): string {
  const named = shape.roles.map((r) => (r.scenes > 1 ? `${r.name} ×${r.scenes}` : r.name));
  if (shape.untagged > 0) named.push(`${shape.untagged} untagged`);
  return named.length === 0 ? 'no sections' : named.join(', ');
}

/**
 * Which edge of this header the drop indicator belongs on, if either.
 *
 * A gap between two adjacent songs is addressable from both sides — song A
 * ending at 5 and song B starting at 6 are both "gap 6" — so this resolves
 * toward `above` and lets `below` render only where no header begins. That's the
 * tail of the set, which is the one gap `above` can't express.
 */
export function dropEdgeFor(
  header: SongHeader,
  dropAt: number,
  headers: Map<number, SongHeader>,
): '' | 'above' | 'below' {
  if (dropAt < 0) return '';
  if (dropAt === header.from) return 'above';
  if (dropAt === header.to + 1 && !headers.has(dropAt)) return 'below';
  return '';
}

interface SongHeaderRowProps {
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
}

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
export const SongHeaderRow = memo(function SongHeaderRow({
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
}: SongHeaderRowProps) {
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
