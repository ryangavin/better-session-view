import { memo, type DragEvent } from 'react';
import './Row.css';
import { hex, inkOn, legibleOn } from '../../../../core/src/color.js';
import { groupSlot } from '../../../../core/src/groupSlot.js';
import { roleIn, roleKey } from '../../../../core/src/roles.js';
import { titleOf } from '../../../../core/src/sceneTitle.js';
import type { Column } from '../../../../core/src/trackColumns.js';
import type { SongHeader } from '../../../../core/src/songRows.js';
import { clipKey } from '../../lib/selection.js';
import { LAUNCH_KEY, mods } from '../../lib/keys.js';
import { has, type RowMarks } from '../../lib/rowMarks.js';
import { GROUP_CELL_ALPHA, GROUP_SLOT_ALPHA, PANEL } from './constants.js';
import type { Props } from './ClipGrid.js';

/**
 * Which edge of this scene row the drop indicator belongs on, if either.
 *
 * The counterpart to `dropEdgeFor`, and it defers to it: a gap that starts a
 * song is drawn by that song's header, which is already sitting on that
 * boundary. Without the check both would draw a line for the same gap.
 *
 * Everything else resolves toward `above`, because gap `g` is the top of scene
 * `g`. `below` renders on the last scene alone — the end of the set is the one
 * gap no scene's top can express.
 */
export function sceneDropEdge(
  s: number,
  dropAt: number,
  lastScene: number,
  songHeaders: Map<number, SongHeader>,
): '' | 'above' | 'below' {
  if (dropAt < 0 || songHeaders.has(dropAt)) return '';
  if (dropAt === s) return 'above';
  if (dropAt === s + 1 && s === lastScene) return 'below';
  return '';
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
  /** This scene is one of the ones in flight. */
  dragging: boolean;
  /** Which edge the drop line sits on, if this row is the target. */
  dropEdge: '' | 'above' | 'below';
  /** Tracks whose clip in this row is in flight, as `|t|t|`. See RowMarks. */
  lifting: RowMarks;
  /** Tracks whose slot in this row is a drop target, same shape. */
  landing: RowMarks;
  onClip: Props['onClip'];
  onScene: Props['onScene'];
  onFireScene: Props['onFireScene'];
  onFireGroup: Props['onFireGroup'];
  onRoleMenu: Props['onRoleMenu'];
  onSceneDragStart: Props['onSceneDragStart'];
  onSceneDragOver: Props['onSceneDragOver'];
  onSceneDrop: Props['onSceneDrop'];
  onSceneDragEnd: Props['onSceneDragEnd'];
  onClipDragStart: Props['onClipDragStart'];
  onClipDragOver: Props['onClipDragOver'];
  onClipDrop: Props['onClipDrop'];
  onClipDragEnd: Props['onClipDragEnd'];
}

// memo on the row is what keeps toggling one cell from re-rendering all 848
// scenes. Without it this is slower than the innerHTML version it replaced.
export const Row = memo(function Row({
  scene,
  columns,
  clips,
  selected,
  marks,
  active,
  roleColors,
  sceneSelected,
  dragging,
  dropEdge,
  lifting,
  landing,
  onClip,
  onScene,
  onFireScene,
  onFireGroup,
  onRoleMenu,
  onSceneDragStart,
  onSceneDragOver,
  onSceneDrop,
  onSceneDragEnd,
  onClipDragStart,
  onClipDragOver,
  onClipDrop,
  onClipDragEnd,
}: RowProps) {
  // Live allows a scene to have no color at all, which is not the same as
  // palette slot 0 — see Scene.colorIndex in the protocol.
  const named = scene.colorIndex >= 0 ? hex(legibleOn(scene.color, PANEL)) : undefined;
  // There is no "scene is playing" property in the LOM, so derive it: a scene
  // is sounding if any track is playing a clip in this row.
  const sceneLive = marks !== undefined && marks.indexOf('|p') >= 0;
  const sceneFired = marks !== undefined && marks.indexOf('|f') >= 0;

  // The role is parsed out of the name and shown as a chip. The song header
  // owns the shared title; child scenes only repeat the metadata that actually
  // differs from row to row while Live keeps the complete literal name.
  const role = roleIn(scene.name);
  const metadata = titleOf(scene.name);
  const { key, tag } = metadata;
  const roleRgb = role === null ? undefined : roleColors.get(roleKey(role));

  return (
    <tr
      className={
        `scene-row${dragging ? ' dragging' : ''}${dropEdge ? ` drop-${dropEdge}` : ''}`
      }
      // The whole row is the drop target, not just the scene column: a row is a
      // wide, easy thing to aim at, and which half the pointer is in decides
      // whether the scenes land above or below it. Same idiom as the song
      // header, and the same reason.
      onDragOver={(e: DragEvent<HTMLTableRowElement>) => {
        e.preventDefault();
        // Without this the cursor shows "copy" and, in some browsers, the drop
        // never fires at all.
        e.dataTransfer.dropEffect = 'move';
        const box = e.currentTarget.getBoundingClientRect();
        onSceneDragOver(scene.i, scene.i, e.clientY > box.top + box.height / 2);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onSceneDrop();
      }}
    >
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
        <span className="scene-line">
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
        {/* The number is the grip. The cell around it already means "select",
            and ⇧ already means "extend", so the row itself can't be the handle
            without one gesture stealing from the other — where the number is
            inert, sits at a fixed x down the whole column, and is the one part
            of the row that names the position being changed. Clicking it still
            selects: a drag and a click are different gestures. */}
          <span
            className="scene-n"
            draggable
            title={`Scene ${scene.i + 1} — drag to move it`}
            onDragStart={(e: DragEvent<HTMLSpanElement>) => {
              // Firefox refuses to start a drag unless something is set.
              e.dataTransfer.setData('text/plain', String(scene.i));
              e.dataTransfer.effectAllowed = 'move';
              onSceneDragStart(scene.i);
            }}
            onDragEnd={onSceneDragEnd}
          >
            {scene.i + 1}
          </span>
        {/* The musical key leads the scene metadata, matching the fixed key
            slot in song headers. The `@` belongs to the storage syntax, not
            the value, so the grid shows the clean `Bm` / `F#m` reading. */}
          <span
            className={`scene-key${key === '' ? ' none' : ''}`}
            title={key === '' ? 'No key set for this scene' : `key: ${key}`}
          >
            {key || '--'}
          </span>
        {/* The role follows the key. Fire button, scene number, key and chip
            are fixed-width columns; the optional song tag takes the remaining
            space at the right edge.

            A scene with no role gets a pill reading "no role" — same box as a
            real chip, a shade quieter, its text dimmer still. Filled rather
            than dashed: a dashed chip already means something else here, a role
            that exists and has no color. The label is lowercase in the source
            and uppercased in CSS, like every other chip. */}
        {/* A button, not a label: the chip is where the role gets changed, and
            the placeholder is the same button so an untagged scene is one
            click from a role too. `stopPropagation` for the same reason the
            fire button has it — the cell's own click selects, and pressing the
            chip is not a selection. */}
          <button
            type="button"
            aria-haspopup="menu"
            className={
              role === null
                ? 'role-chip none'
                : `role-chip${roleRgb === undefined ? ' uncolored' : ''}`
            }
            style={
              role === null || roleRgb === undefined
                ? undefined
                : { background: hex(roleRgb), color: inkOn(roleRgb) }
            }
            title={
              role === null
                ? 'No role — click to tag this scene'
                : roleRgb === undefined
                  ? `${role} — no color set for this role · click to change`
                  : `role: ${role} · click to change`
            }
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onRoleMenu(scene.i, { left: r.left, top: r.top, bottom: r.bottom });
            }}
          >
            {role === null ? 'no role' : role}
          </button>
        {/* A fixed slot through the scene column's right edge. The pill itself
            hugs that edge, so COVER and ORIGINAL line up with each other and
            with the song header regardless of their different widths. */}
          <span className="song-tag-slot">
            {tag !== '' && (
              <span
                className="song-tag-chip"
                style={named ? { borderColor: named, color: named } : undefined}
                title={`song tag: ${tag}`}
              >
                {tag}
              </span>
            )}
          </span>
        </span>
      </td>
      {columns.map((c) => {
        if (c.kind === 'group') {
          // A real Live slot: firing it fires every clip the group holds in
          // this scene. Its color is the first of those clips, which is Live's
          // own rule — see core/groupSlot.
          const slot = groupSlot(c.members, (t) => clips.get(clipKey(t, scene.i)));
          const t = c.group.i;
          // The group track reports its own play state, but only if Live fills
          // in playing_slot_index for group tracks — unconfirmed, so fall back
          // to the members, which is what this cell has always used.
          const live = has(marks, `p${t}`) || c.members.some((m) => has(marks, `p${m}`));
          const fired = has(marks, `f${t}`) || c.members.some((m) => has(marks, `f${m}`));
          return (
            <td
              key={`g${t}`}
              className={`cell group${live ? ' playing' : ''}${fired ? ' fired' : ''}`}
              style={
                slot.count ? { background: `${hex(slot.color)}${GROUP_SLOT_ALPHA}` } : undefined
              }
              title={
                slot.count
                  ? `${c.group.name} — fire ${slot.count} of ${c.members.length} tracks` +
                    ` in scene ${scene.i + 1}`
                  : `${c.group.name} — nothing to fire in scene ${scene.i + 1}`
              }
            >
              {/* Plain click fires, like the scene row's button and unlike a
                  clip cell, because there is nothing here to select — the
                  modifier rule exists to keep firing away from selection, and
                  a group slot has no selection to protect. Absent entirely
                  when the group has nothing here: Live draws no launcher on an
                  empty group slot either. */}
              {slot.count > 0 && (
                <>
                  <button
                    type="button"
                    className="fire"
                    title={`Fire ${c.group.name} in scene ${scene.i + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFireGroup(t, scene.i);
                    }}
                  >
                    ▶
                  </button>
                  <span className="group-n">{slot.count}</span>
                </>
              )}
            </td>
          );
        }

        const t = c.track.i;
        const key = clipKey(t, scene.i);
        const clip = clips.get(key);
        const isSel = selected.has(key);
        const playing = has(marks, `p${t}`);
        const fired = has(marks, `f${t}`);
        const isLifting = has(lifting, String(t));
        const isLanding = has(landing, String(t));
        return (
          <td
            key={key}
            className={
              `cell${clip ? ' has' : ''}${isSel ? ' sel' : ''}` +
              `${active === t ? ' active' : ''}${playing ? ' playing' : ''}` +
              `${fired ? ' fired' : ''}${isLifting ? ' lifting' : ''}` +
              `${isLanding ? ' landing' : ''}`
            }
            data-active={active === t ? '1' : undefined}
            // Only a slot holding a clip can start a drag. An empty one is
            // still a drop *target*, which is the whole point of dragging.
            draggable={clip !== undefined}
            onDragStart={(e: DragEvent<HTMLTableCellElement>) => {
              // Firefox refuses to start a drag unless something is set.
              e.dataTransfer.setData('text/plain', clip?.name ?? '');
              e.dataTransfer.effectAllowed = 'move';
              onClipDragStart(t, scene.i);
            }}
            onDragEnd={onClipDragEnd}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              onClipDragOver(t, scene.i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              // Stop the row's own handler firing too — a clip landing on a
              // slot is not a request to reorder the scene it landed in.
              e.stopPropagation();
              onClipDrop();
            }}
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
