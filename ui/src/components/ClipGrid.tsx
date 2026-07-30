import { memo, useMemo, type CSSProperties } from 'react';
import { hex, inkOn } from '../../../core/src/color.js';
import { clipKey } from '../lib/selection.js';
import { metricsFor, tableWidth, type ColumnWidth } from '../lib/columnWidth.js';

interface Props {
  snapshot: BSV.Snapshot;
  selected: ReadonlySet<string>;
  columnWidth: ColumnWidth;
  onToggle: (key: string) => void;
}

interface RowProps {
  scene: BSV.Scene;
  tracks: BSV.Track[];
  clips: Map<string, BSV.Clip>;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
}

// memo on the row is what keeps toggling one cell from re-rendering all 848
// scenes. Without it this is slower than the innerHTML version it replaced.
const Row = memo(function Row({ scene, tracks, clips, selected, onToggle }: RowProps) {
  return (
    <tr>
      <td className="scene" title={scene.name}>
        <span className="scene-n">{scene.i + 1}</span>
        {scene.name || <span className="unnamed">—</span>}
      </td>
      {tracks.map((t) => {
        const key = clipKey(t.i, scene.i);
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

export function ClipGrid({ snapshot, selected, columnWidth, onToggle }: Props) {
  const tracks = useMemo(
    () => snapshot.tracks.filter((t) => !t.isGroup),
    [snapshot.tracks],
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
      width: `${tableWidth(columnWidth, tracks.length)}px`,
    } as CSSProperties;
  }, [columnWidth, tracks.length]);

  return (
    <table className="grid" style={style}>
      <thead>
        <tr>
          <th className="scene-h">Scene</th>
          {tracks.map((t) => (
            <th key={t.i} title={t.name}>
              {t.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {snapshot.scenes.map((scene) => (
          <Row
            key={scene.i}
            scene={scene}
            tracks={tracks}
            clips={clips}
            selected={selected}
            onToggle={onToggle}
          />
        ))}
      </tbody>
    </table>
  );
}
