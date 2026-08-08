import { memo, type CSSProperties, type DragEvent } from 'react';
import './SongHeaderRow.css';
import { hex, legibleOn } from '../../../../core/src/color.js';
import { roleKey } from '../../../../core/src/roles.js';
import type { Column } from '../../../../core/src/trackColumns.js';
import {
  mergeShapes,
  type SongHeader,
  type TrackShape,
} from '../../../../core/src/songRows.js';
import { IconGroupFold } from '../Icon.js';
import { TagChip } from '../TagChip.js';
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
  /** roleKey → the RGB its band is painted. Shared with the scene rows' chips. */
  roleColors: Map<string, number>;
  /** This block is the one being dragged. */
  dragging: boolean;
  /** Which edge of this header the drop indicator sits on, if any. */
  dropEdge: '' | 'above' | 'below';
  /** What the drop would cost, shown on the indicator. `''` when not the target. */
  dropNote: string;
  onToggle: (songKey: string) => void;
  onPickSong: (songKey: string) => void;
  /** The scenes this grip picks up. A block header hands over its whole run. */
  onDragStart: (sources: readonly number[]) => void;
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
          // `.song-row.colored td` in SongHeaderRow.css.
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
       line. */
    <div className="song-line">
      <span className="fold">
        <IconGroupFold folded={header.collapsed} />
      </span>
      {/* The facts lead, so the key lands immediately left of the name it
          describes. BPM stays outside it as the numeric tempo column. Both
          are right-aligned: the values differ in
          width ("94" / "128", "Bm" / "F#m") and their right edges are what a
          column of them should line up on.

          A song that states neither still shows both slots, as dashes as wide
          as the value that's missing — three for a bpm, two for a key. An empty
          slot reads as a rendering gap; a dash says the set never named one,
          which is a thing to go and fix. Dimmer than any real value, and it
          stays dim under `clash` — nothing said is not the same as two scenes
          disagreeing. */}
      <span className={`facts${header.clash ? ' clash' : ''}`}>
        <span className={`bpm${header.bpm === '' ? ' none' : ''}`}>{header.bpm || '---'}</span>
        <span className={`key${header.key === '' ? ' none' : ''}`}>{header.key || '--'}</span>
      </span>
      {/* Name and tag share one constrained identity slot. Keeping the pill
          inside it matters when the song is open: the header spans the whole
          table, but its identity still belongs entirely to the scene column. */}
      <span className="song-identity">
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
        <TagChip
          tag={header.tag}
          color="var(--song-rgb, var(--dim2))"
          clash={header.tagClash}
          title={
            header.tagClash
              ? `This song's scenes disagree: ${header.tag}`
              : undefined
          }
        />
      </span>
      {/* Only worth saying when there is more than one — a song in two runs is
          a reprise, or it's two different songs sharing a name. Folded, it
          shortens to `2/2`: it has to share the scene column with the shape,
          and the tooltip still spells it out. */}
      {header.blocks > 1 && header.collapsed && (
        <span className="part" title={`part ${header.block} of ${header.blocks}`}>
          {header.block}/{header.blocks}
        </span>
      )}
    </div>
  );

  /* Expanded rows have a real scene-column cell now, so they can pin at the
     same edge as scene names. Details that used to follow the title inside one
     table-spanning cell belong in the remaining track-region cell. */
  const openDetails = (
    <span className="song-details">
      {header.blocks > 1 && (
        <span className="part">
          part {header.block} of {header.blocks}
        </span>
      )}
      {header.colorClash && (
        <span
          className="mixed-color"
          title="This song's scenes hold more than one color — pick a swatch to make it one"
        >
          mixed color
        </span>
      )}
      {dropNote !== '' && <span className="drop-note">{dropNote}</span>}
    </span>
  );

  // The scene-column lead is the drag handle in both shapes. Keeping it as its
  // own cell is also what lets the song identity stay pinned horizontally.
  const lead = {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLTableCellElement>) => {
      // Firefox refuses to start a drag unless something is set.
      e.dataTransfer.setData('text/plain', header.song);
      e.dataTransfer.effectAllowed = 'move';
      const run: number[] = [];
      for (let s = header.from; s <= header.to; s++) run.push(s);
      onDragStart(run);
    },
    onDragEnd,
  };

  return (
    <tr
      className={cls}
      style={paint}
      data-song-start={header.from}
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
        <>
          <td className="song-lead" {...lead}>
            {title}
          </td>
          {columns.length > 0 && (
            <td className="song-detail" colSpan={columns.length}>
              {openDetails}
            </td>
          )}
        </>
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
              // A group column stands for several tracks, so its cell shows
              // what any of them play — the union, same as the group's clip
              // slot stands in for the clips underneath it. Branching on
              // `c.kind` at each use rather than through a boolean: the
              // boolean reads better and narrows nothing, so `c.members` on a
              // track column would only fail at runtime.
              const grouped = c.kind === 'group';
              const shape =
                c.kind === 'group'
                  ? mergeShapes(c.members.map((t) => shapes.get(t)).filter(isShape))
                  : shapes.get(c.track.i);
              const name = c.kind === 'group' ? c.group.name : c.track.name;
              const used =
                c.kind === 'group'
                  ? c.members.filter((t) => shapes.has(t)).length
                  : (shape?.scenes ?? 0);
              const of = c.kind === 'group' ? c.members.length : header.scenes;
              return (
                <td
                  key={c.kind === 'group' ? `g${c.group.i}` : `t${c.track.i}`}
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
                  {/* One slice per scene, in song order. A clip paints its
                      scene's role color; an empty clip slot stays blank. This
                      is the whole hidden run compressed into one track cell,
                      rather than only a list of its distinct roles. An empty
                      track still draws nothing at all — an absence answers
                      faster than a faint presence. */}
                  {shape && (
                    <span className="role-bands" aria-hidden="true">
                      {shape.slots.map((slot, i) => {
                        const roleRgb =
                          slot?.role === null || slot === null
                            ? undefined
                            : roleColors.get(roleKey(slot.role));
                        const kind =
                          slot === null
                            ? ' empty'
                            : slot.role === null
                              ? ' untagged'
                              : roleRgb === undefined
                                ? ' uncolored'
                                : '';
                        return (
                          <span
                            key={i}
                            className={`role-band${kind}`}
                            style={
                              slot?.role === null
                                ? { background: hex(UNTAGGED) }
                                : roleRgb === undefined
                                  ? undefined
                                  : { background: hex(roleRgb) }
                            }
                          />
                        );
                      })}
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
