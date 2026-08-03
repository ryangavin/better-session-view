import { COLUMN_WIDTHS, type ColumnWidth } from '../lib/columnWidth.js';
import type { BridgeState } from '../hooks/useBridge.js';

interface Props {
  connection: BridgeState['connection'];
  lomReady: boolean;
  busy: boolean;
  isPlaying: boolean;
  launch: BridgeState['launch'];
  stop: BridgeState['stop'];
  songCount: number;
  /** How many songs are folded, for the Fold/Unfold label. */
  collapsedCount: number;
  onCollapseAll: (all: boolean) => void;
  columnWidth: ColumnWidth;
  onColumnWidth: (w: ColumnWidth) => void;
  showLog: boolean;
  onToggleLog: () => void;
  onSnapshot: () => void;
}

const statusPill = (label: string, ok: boolean) => (
  <div className={`pill ${ok ? 'on' : 'off'}`}>{label}</div>
);

/** The header bar: status pills, playback, the view controls, log and Snapshot. */
export function Header({
  connection,
  lomReady,
  busy,
  isPlaying,
  launch,
  stop,
  songCount,
  collapsedCount,
  onCollapseAll,
  columnWidth,
  onColumnWidth,
  showLog,
  onToggleLog,
  onSnapshot,
}: Props) {
  return (
    <header>
      <div className="title">Session Bridge</div>
      {statusPill(connection, connection === 'open')}
      {statusPill(lomReady ? 'lom ready' : 'lom waiting', lomReady)}

      <div className="playback" role="group" aria-label="Playback">
        <button
          type="button"
          className={isPlaying ? 'rolling' : undefined}
          title="Start the song (Space)"
          disabled={!lomReady}
          onClick={() => launch({ kind: 'song' })}
        >
          ▶
        </button>
        <button
          type="button"
          title="Stop the song (Space)"
          disabled={!lomReady}
          onClick={() => stop({ kind: 'song' })}
        >
          ■
        </button>
        <button
          type="button"
          title="Stop all clips, keep the song rolling (Esc)"
          disabled={!lomReady}
          onClick={() => stop({ kind: 'clips' })}
        >
          stop clips
        </button>
      </div>

      <div className="spacer" />
      {/* A view control, so it sits with the other one rather than only in
          the songs modal. Folding everything is how a 100-song set becomes
          navigable, and it shouldn't take two clicks to reach. */}
      <button
        type="button"
        disabled={songCount === 0}
        title="Fold every song down to its header row"
        onClick={() => onCollapseAll(collapsedCount < songCount)}
      >
        {collapsedCount < songCount ? 'Fold songs' : 'Unfold songs'}
      </button>
      <div className="widths" role="group" aria-label="Column width">
        {COLUMN_WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            className={w === columnWidth ? 'on' : undefined}
            aria-pressed={w === columnWidth}
            onClick={() => onColumnWidth(w)}
          >
            {w.toUpperCase()}
          </button>
        ))}
      </div>
      {/* The log is diagnostics, so it's off by default and reachable in one
          click. It opens itself on an error — see useRailAndLog — because a
          failure you can't see is a failure that didn't happen. */}
      <button
        type="button"
        className={`toggle${showLog ? ' on' : ''}`}
        aria-pressed={showLog}
        title="Show what the bridge is saying"
        onClick={onToggleLog}
      >
        Log
      </button>
      <button type="button" className="primary" onClick={onSnapshot} disabled={!lomReady || busy}>
        Snapshot
      </button>
    </header>
  );
}
