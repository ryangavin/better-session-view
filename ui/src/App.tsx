import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipGrid } from './components/ClipGrid.js';
import { Inspector } from './components/Inspector.js';
import { useBridge } from './lib/useBridge.js';
import { clipKey, parseClipKey, toggle } from './lib/selection.js';
import {
  COLUMN_WIDTHS,
  loadColumnWidth,
  saveColumnWidth,
  type ColumnWidth,
} from './lib/columnWidth.js';
import { render } from '../../core/src/pattern.js';

export function App() {
  const bridge = useBridge();
  const { snapshot } = bridge;

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [pattern, setPattern] = useState('');
  const [columnWidth, setColumnWidth] = useState<ColumnWidth>(loadColumnWidth);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());

  // Seed the collapsed groups from Live's own fold state on every snapshot; a
  // snapshot is a resync with Live, so it wins over local toggles made since
  // the last one. Collapsing here never writes back — LOM writes don't
  // participate in Live's undo, and this is a view operation.
  useEffect(() => {
    if (!snapshot) return;
    setCollapsed(
      new Set(snapshot.tracks.filter((t) => t.isGroup && t.isFolded).map((t) => t.i)),
    );
  }, [snapshot]);

  const onToggle = useCallback((key: string) => {
    setSelected((prev) => toggle(prev, key));
  }, []);

  const onToggleGroup = useCallback((trackIndex: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(trackIndex)) next.add(trackIndex);
      return next;
    });
  }, []);

  const chooseColumnWidth = useCallback((w: ColumnWidth) => {
    setColumnWidth(w);
    saveColumnWidth(w);
  }, []);

  // Token values for one clip. Song/role tokens land with segmentation; until
  // then they resolve to nothing, which render() drops cleanly.
  const valuesFor = useCallback(
    (t: number, s: number, n: number) => ({
      track: snapshot?.tracks.find((x) => x.i === t)?.name,
      scene: snapshot?.scenes.find((x) => x.i === s)?.name,
      name: snapshot?.clips.find((c) => c.t === t && c.s === s)?.name,
      n,
    }),
    [snapshot],
  );

  const ops = useMemo<BSV.ApplyOp[]>(() => {
    const keys = [...selected];
    return keys
      .map((key, i) => {
        const { t, s } = parseClipKey(key);
        const op: BSV.ApplyOp = { t, s };
        if (chosenIndex !== null) op.colorIndex = chosenIndex;
        if (pattern.trim()) op.name = render(pattern, valuesFor(t, s, i + 1));
        return op;
      })
      .filter((op) => op.colorIndex !== undefined || op.name !== undefined);
  }, [selected, chosenIndex, pattern, valuesFor]);

  const preview = useMemo(() => {
    if (!pattern.trim() || selected.size === 0) return null;
    const { t, s } = parseClipKey([...selected][0]!);
    return render(pattern, valuesFor(t, s, 1));
  }, [pattern, selected, valuesFor]);

  const statusPill = (label: string, ok: boolean) => (
    <div className={`pill ${ok ? 'on' : 'off'}`}>{label}</div>
  );

  return (
    <>
      <header>
        <div className="title">Session Bridge</div>
        {statusPill(bridge.connection, bridge.connection === 'open')}
        {statusPill(bridge.lomReady ? 'lom ready' : 'lom waiting', bridge.lomReady)}
        <div className="spacer" />
        <div className="widths" role="group" aria-label="Column width">
          {COLUMN_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={w === columnWidth ? 'on' : undefined}
              aria-pressed={w === columnWidth}
              onClick={() => chooseColumnWidth(w)}
            >
              {w.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="primary"
          onClick={bridge.refresh}
          disabled={!bridge.lomReady || bridge.busy}
        >
          Snapshot
        </button>
      </header>

      <div className="stats">
        <Stat k="Tracks" v={snapshot?.trackCount} />
        <Stat k="Scenes" v={snapshot?.sceneCount} />
        <Stat k="Clips" v={snapshot?.clipCount} />
        <Stat k="LOM walk" v={snapshot ? `${snapshot.ms}ms` : undefined} highlight />
        <Stat
          k="Slot scan"
          v={snapshot ? `${snapshot.timings.slots}ms` : undefined}
        />
        <Stat k="Selected" v={selected.size} />
      </div>

      <main>
        <div className="grid-wrap">
          {snapshot ? (
            <ClipGrid
              snapshot={snapshot}
              selected={selected}
              columnWidth={columnWidth}
              collapsed={collapsed}
              onToggle={onToggle}
              onToggleGroup={onToggleGroup}
            />
          ) : (
            <div className="empty">
              Load the device in Live, then hit <b>Snapshot</b>.
            </div>
          )}
        </div>

        <Inspector
          palette={bridge.palette}
          chosenIndex={chosenIndex}
          onChooseIndex={setChosenIndex}
          pattern={pattern}
          onPattern={setPattern}
          selectedCount={selected.size}
          preview={preview}
          busy={bridge.busy}
          progress={bridge.progress}
          onApply={() => void bridge.apply(ops)}
          onClear={() => setSelected(new Set())}
          onExtractPalette={() => void bridge.extractPalette()}
        />
      </main>

      <footer>
        {bridge.log.map((l) => (
          <div key={l.id} className={`log-line ${l.kind}`}>
            {l.text}
          </div>
        ))}
      </footer>
    </>
  );
}

function Stat({
  k,
  v,
  highlight,
}: {
  k: string;
  v: string | number | undefined;
  highlight?: boolean;
}) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v${highlight ? ' hl' : ''}`}>{v ?? '—'}</div>
    </div>
  );
}

export { clipKey };
