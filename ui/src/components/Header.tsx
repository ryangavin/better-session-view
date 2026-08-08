import { COLUMN_WIDTHS, type ColumnWidth } from '../lib/columnWidth.js';
import type { BridgeState } from '../hooks/useBridge.js';
import './Header.css';
import {
  IconBug,
  IconMeter,
  IconMenu,
  IconPlay,
  IconStop,
  IconStopClips,
  IconSync,
} from './Icon.js';

interface Props {
  lomReady: boolean;
  busy: boolean;
  isPlaying: boolean;
  songPosition: BridgeState['songPosition'];
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
  showMeters: boolean;
  onToggleMeters: () => void;
  onSnapshot: () => void;
}

/**
 * The header bar: playback, view controls, meters, log and Snapshot.
 *
 * Every button here is a glyph, and every one carries an `aria-label` as well
 * as a `title`. An icon-only control with no accessible name is a button that
 * exists for sighted mouse users and nobody else — and the `title` is also the
 * only place the longer ones (what "stop clips" spares, what Snapshot re-reads)
 * can still be said in words.
 */
export function Header({
  lomReady,
  busy,
  isPlaying,
  songPosition,
  launch,
  stop,
  songCount,
  collapsedCount,
  onCollapseAll,
  columnWidth,
  onColumnWidth,
  showLog,
  onToggleLog,
  showMeters,
  onToggleMeters,
  onSnapshot,
}: Props) {
  // Guarded on songCount so an empty set reads as "nothing folded" rather than
  // as "all of nothing is folded", which would light the button before there's
  // a song in the grid.
  const allFolded = songCount > 0 && collapsedCount >= songCount;
  const positionParts = songPosition
    ? [songPosition.bar, songPosition.beat, songPosition.sixteenth]
    : ['–', '–', '–'];
  const positionLabel = songPosition
    ? `Arrangement position: bar ${songPosition.bar}, beat ${songPosition.beat}, ` +
      `sixteenth ${songPosition.sixteenth}`
    : 'Arrangement position unavailable';

  return (
    <header>
      <div className="header-section header-left">
        <img className="brand-logo" src="/logo-white.png" alt="Better Session View" />
      </div>

      <div className="header-section header-center">
        <div className="transport">
          <div className="arrangement-position" role="timer" aria-label={positionLabel}>
            <span aria-hidden="true">
              {positionParts.map((part, i) => (
                <span key={i}>
                  {i > 0 && <span className="position-separator">.</span>}
                  <span className="position-field">{part}</span>
                </span>
              ))}
            </span>
          </div>
          <div className="playback" role="group" aria-label="Playback">
            <button
              type="button"
              className={`icon-btn${isPlaying ? ' rolling' : ''}`}
              title="Start the song (Space)"
              aria-label="Start the song"
              disabled={!lomReady}
              onClick={() => launch({ kind: 'song' })}
            >
              <IconPlay />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Stop the song (Space)"
              aria-label="Stop the song"
              disabled={!lomReady}
              onClick={() => stop({ kind: 'song' })}
            >
              <IconStop />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Stop all clips, keep the song rolling (Esc)"
              aria-label="Stop all clips"
              disabled={!lomReady}
              onClick={() => stop({ kind: 'clips' })}
            >
              <IconStopClips />
            </button>
          </div>
        </div>
      </div>

      <div className="header-section header-right">
        {/* A view control, so it sits with the other one rather than only in
            the songs modal. Folding everything is how a 100-song set becomes
            navigable, and it shouldn't take two clicks to reach.

            The glyph is the same either way and the button lights instead — a
            folded set is already a list of lines, so it's the state the icon
            draws, and swapping in a second icon would make you read the button to
            find out which way it goes. Fold/unfold is in the label and tooltip. */}
        <button
          type="button"
          className={`icon-btn toggle${allFolded ? ' on' : ''}`}
          aria-pressed={allFolded}
          disabled={songCount === 0}
          aria-label={allFolded ? 'Unfold songs' : 'Fold songs'}
          title={
            allFolded ? 'Unfold every song' : 'Fold every song down to its header row'
          }
          onClick={() => onCollapseAll(collapsedCount < songCount)}
        >
          <IconMenu />
        </button>
        <div className="widths" role="group" aria-label="Column width">
          {COLUMN_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={`toggle${w === columnWidth ? ' on' : ''}`}
              aria-pressed={w === columnWidth}
              onClick={() => onColumnWidth(w)}
            >
              {w.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`icon-btn toggle${showMeters ? ' on' : ''}`}
          aria-pressed={showMeters}
          aria-label="Output meters"
          title={`${showMeters ? 'Hide' : 'Show'} track and master output meters`}
          onClick={onToggleMeters}
          disabled={!lomReady && !showMeters}
        >
          <IconMeter />
        </button>
        {/* The log is diagnostics, so it's off by default and reachable in one
            click. It opens itself on an error — see useRailAndLog — because a
            failure you can't see is a failure that didn't happen. */}
        <button
          type="button"
          className={`icon-btn toggle${showLog ? ' on' : ''}`}
          aria-pressed={showLog}
          aria-label="Log"
          title="Show what the bridge is saying"
          onClick={onToggleLog}
        >
          <IconBug />
        </button>
        <button
          type="button"
          className="icon-btn primary"
          aria-label="Snapshot"
          title="Snapshot — re-walk the set"
          onClick={onSnapshot}
          disabled={!lomReady || busy}
        >
          <IconSync />
        </button>
      </div>
    </header>
  );
}
