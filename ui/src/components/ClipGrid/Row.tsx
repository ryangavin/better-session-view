import { memo } from 'react';
import './Row.css';
import { hex, inkOn, legibleOn } from '../../../../core/src/color.js';
import { nameWithoutRole, roleIn, roleKey } from '../../../../core/src/roles.js';
import type { Column } from '../../../../core/src/trackColumns.js';
import { clipKey } from '../../lib/selection.js';
import { LAUNCH_KEY, mods } from '../../lib/keys.js';
import { has, type RowMarks } from '../../lib/rowMarks.js';
import { GROUP_CELL_ALPHA, PANEL } from './constants.js';
import type { Props } from './ClipGrid.js';

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
  onRoleMenu: Props['onRoleMenu'];
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
  onClip,
  onScene,
  onFireScene,
  onRoleMenu,
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
