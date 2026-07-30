import { memo, useMemo, type CSSProperties } from 'react';
import { hex, inkOn, legibleOn } from '../../../core/src/color.js';
import { buildColumns, headerSpans, type Column } from '../../../core/src/trackColumns.js';
import { clipKey } from '../lib/selection.js';
import { metricsFor, tableWidth, type ColumnWidth } from '../lib/columnWidth.js';

/** --bg. Scene names are painted straight onto it, so legibility is measured against it. */
const PANEL = 0x0a0a0b;

interface Props {
  snapshot: BSV.Snapshot;
  selected: ReadonlySet<string>;
  columnWidth: ColumnWidth;
  collapsed: ReadonlySet<number>;
  onToggle: (key: string) => void;
  onToggleGroup: (trackIndex: number) => void;
}

interface RowProps {
  scene: BSV.Scene;
  columns: Column<BSV.Track>[];
  clips: Map<string, BSV.Clip>;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
}

// memo on the row is what keeps toggling one cell from re-rendering all 848
// scenes. Without it this is slower than the innerHTML version it replaced.
const Row = memo(function Row({ scene, columns, clips, selected, onToggle }: RowProps) {
  // Live allows a scene to have no color at all, which is not the same as
  // palette slot 0 — see Scene.colorIndex in the protocol.
  const named = scene.colorIndex >= 0 ? hex(legibleOn(scene.color, PANEL)) : undefined;

  return (
    <tr>
      <td className="scene" title={scene.name}>
        <span className="scene-n">{scene.i + 1}</span>
        {scene.name ? (
          <span style={named ? { color: named } : undefined}>{scene.name}</span>
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
          return (
            <td
              key={`g${c.group.i}`}
              className={`cell folded${n ? ' has' : ''}`}
              style={n ? { background: hex(c.group.color) + '2e' } : undefined}
              title={`${c.group.name} — ${n} of ${c.members.length} tracks have a clip here`}
            >
              {n || ''}
            </td>
          );
        }

        const key = clipKey(c.track.i, scene.i);
        const clip = clips.get(key);
        const isSel = selected.has(key);
        return (
          <td
            key={key}
            className={`cell${clip ? ' has' : ''}${isSel ? ' sel' : ''}`}
            style={
              clip ? { background: hex(clip.color), color: inkOn(clip.color) } : undefined
            }
            title={clip ? `${clip.name}  ·  index ${clip.colorIndex}` : undefined}
            onClick={() => onToggle(key)}
          >
            {clip?.name}
          </td>
        );
      })}
    </tr>
  );
});

export function ClipGrid({
  snapshot,
  selected,
  columnWidth,
  collapsed,
  onToggle,
  onToggleGroup,
}: Props) {
  const columns = useMemo(
    () => buildColumns(snapshot.tracks, collapsed),
    [snapshot.tracks, collapsed],
  );
  const spans = useMemo(
    () => headerSpans(snapshot.tracks, columns),
    [snapshot.tracks, columns],
  );
  const clips = useMemo(
    () => new Map(snapshot.clips.map((c) => [clipKey(c.t, c.s), c])),
    [snapshot.clips],
  );

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
          {columns.map((c) =>
            c.kind === 'track' ? (
              <th key={`t${c.track.i}`} title={c.track.name}>
                {c.track.name}
              </th>
            ) : (
              <th
                key={`g${c.group.i}`}
                className="folded-h"
                style={{ color: hex(legibleOn(c.group.color, PANEL)) }}
                title={`${c.group.name} (${c.members.length} tracks) — click to expand`}
                onClick={() => onToggleGroup(c.group.i)}
              >
                ▸ {c.group.name}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {snapshot.scenes.map((scene) => (
          <Row
            key={scene.i}
            scene={scene}
            columns={columns}
            clips={clips}
            selected={selected}
            onToggle={onToggle}
          />
        ))}
      </tbody>
    </table>
  );
}
