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
import { ControlButton } from '../Control.js';
import { TagChip } from '../TagChip.js';
import { BAND_CONTRAST, isShape, RAIL, UNTAGGED } from './constants.js';
import type { DropEdge } from './dropEdge.js';

/** `CHORUS ×4, JAM1` — what a track plays, for the cell's tooltip. */
function sections(shape: TrackShape): string {
  const named = shape.roles.map((r) => (r.scenes > 1 ? `${r.name} ×${r.scenes}` : r.name));
  if (shape.untagged > 0) named.push(`${shape.untagged} untagged`);
  return named.length === 0 ? 'no sections' : named.join(', ');
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
  dropEdge: DropEdge;
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
          // Half strength, for a folded row's track cells: the cell holding the
          // title is the song, those are what's inside it. See color.md.
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

  /* The two shapes are laid out differently but they are the same facts about
     the same song, so the pieces are built once here and placed twice below. A
     tooltip that only got fixed in one of them would be the obvious bug. */
  const foldGlyph = (
    <span className="fold">
      <IconGroupFold folded={folded} />
    </span>
  );
  const songButton = (
    <ControlButton
      type="button"
      className="song"
      title={
        `Work on ${header.song}` +
        (header.artist === '' ? '' : ` by ${header.artist}`) +
        ' — selects every scene of it'
      }
      onClick={(e) => {
        e.stopPropagation();
        onPickSong(header.songKey);
      }}
    >
      {header.song}
    </ControlButton>
  );
  // Only when the set says so. Reserving the line on every header would spend a
  // second row of height across a whole set to say nothing on most of it — the
  // opposite trade to the fixed *width* slots, which cost nothing when empty.
  const artistText =
    header.artist === '' ? null : (
      <span
        className={`song-artist${header.artistClash ? ' clash' : ''}`}
        title={
          header.artistClash
            ? `This song's scenes disagree: ${header.artist}`
            : header.artist
        }
      >
        {header.artist}
      </span>
    );
  // A song that states neither fact still shows both slots, as dashes as wide as
  // the value that's missing — three for a bpm, two for a key. An empty slot
  // reads as a rendering gap; a dash says the set never named one, which is a
  // thing to go and fix. Dimmer than any real value, and it stays dim under
  // `clash` — nothing said is not the same as two scenes disagreeing.
  const facts = (
    <span className={`facts${header.clash ? ' clash' : ''}`}>
      <span className={`bpm${header.bpm === '' ? ' none' : ''}`}>{header.bpm || '---'}</span>
      <span className={`key${header.key === '' ? ' none' : ''}`}>{header.key || '--'}</span>
    </span>
  );
  const tagChip = (
    <TagChip
      tag={header.tag}
      color="var(--song-rgb, var(--caption))"
      clash={header.tagClash}
      title={
        header.tagClash ? `This song's scenes disagree: ${header.tag}` : undefined
      }
    />
  );
  const mixedColor = header.colorClash && (
    <span
      className="mixed-color"
      title="This song's scenes hold more than one color — pick a swatch to make it one"
    >
      mixed color
    </span>
  );

  // The drag handle: the pinned lead cell when folded, where the rest of the
  // row is tiles, and the whole bar when open, where there is nothing else in
  // it to grab by mistake.
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
        /* One cell across every column. The header segments the grid, so
           nothing sits beside it — and with no column to line up against,
           nothing inside it holds a fixed width either. The name leads, because
           the slots that used to lead exist to make a hundred *folded* headers
           read as a table of contents, which is the other shape's job.

           Its contents pin to the left edge rather than scrolling away with the
           row, so scrolling out to track 30 still says which song those clips
           belong to. That's `position: sticky` on the line inside the cell —
           which is also why this cell, alone in the table, may not have
           `overflow: hidden`: an ancestor that clips becomes the sticky
           element's scrollport, and a scrollport that never scrolls never
           sticks. */
        <td className="song-span" colSpan={columns.length + 1} {...lead}>
          <div className="song-line">
            {foldGlyph}
            {songButton}
            {artistText}
            {facts}
            {tagChip}
            {header.blocks > 1 && (
              <span className="part">
                part {header.block} of {header.blocks}
              </span>
            )}
            {mixedColor}
            {/* The cost, on the indicator itself. This move can't be undone
                from here, so what it's about to do belongs in front of you
                while your finger is still on the mouse — not in the log
                afterwards. */}
            {dropNote !== '' && <span className="drop-note">{dropNote}</span>}
          </div>
        </td>
      ) : (
        <>
          {/* Folded, the same facts are a line in a table of contents: fixed
              slots so a hundred of them read as columns, each holding its width
              whether or not the song fills it. The lead slot matches the
              launcher and scene number below it, the facts lead so the key
              lands beside the name it describes, and the whole identity stays
              inside the pinned column so it can't drift over the first track. */}
          <td className="song-lead" {...lead}>
            <div className="song-line">
              {foldGlyph}
              {facts}
              <span className="song-identity">
                {/* Name over artist. Only this stacks — everything else in the
                    row, the tag chip included, stays a single item centered
                    against the pair, so a two-line song reads as one taller
                    block rather than as a row whose annotations moved up. */}
                <span className="song-identity-text">
                  {songButton}
                  {artistText}
                </span>
                {tagChip}
              </span>
              {/* Worth saying only when there is more than one — a song in two
                  runs is a reprise, or two different songs sharing a name. It
                  shortens to `2/2` here because it shares the scene column with
                  the shape, and the tooltip still spells it out. */}
              {header.blocks > 1 && (
                <span className="part" title={`part ${header.block} of ${header.blocks}`}>
                  {header.block}/{header.blocks}
                </span>
              )}
            </div>
          </td>
          {notice ? (
            <td className="song-notice" colSpan={columns.length}>
              {mixedColor}
              {/* Worth the whole tile region for the two seconds a drag lasts:
                  both of these are things you have to act on, and both outrank
                  a summary of what the song contains. */}
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
