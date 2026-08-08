import type { Derivation } from '../../../core/src/derive.js';
import { songFacts } from '../../../core/src/songRows.js';
import './SongIndex.css';

interface Props {
  derivation: Derivation;
  onJump: (scene: number) => void;
  onClose: () => void;
}

/**
 * A compact, read-only contents pane for moving around a large set.
 *
 * Songs appear once, in first-appearance order. A reprise is still the same
 * song, so its name jumps to the first block rather than inventing a second
 * identity here. The grid remains authoritative for folding and selection;
 * this pane does neither.
 */
export function SongIndex({ derivation, onJump, onClose }: Props) {
  return (
    <nav id="song-index" className="song-index" aria-label="Song index">
      <div className="song-index-head">
        <span className="lbl">Song index</span>
        <button
          type="button"
          className="song-index-close"
          aria-label="Close song index"
          title="Close song index"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="song-index-columns" aria-hidden="true">
        <span>Name</span>
        <span>Key</span>
        <span>BPM</span>
        <span>Type</span>
      </div>

      <div className="song-index-list">
        {derivation.songs.length === 0 ? (
          <div className="song-index-empty">No mapped songs</div>
        ) : (
          derivation.songs.map((song) => {
            const facts = songFacts(song);
            const firstScene = song.scenes[0];
            return (
              <div className="song-index-row" key={song.scenes[0]}>
                <button
                  type="button"
                  className="song-index-name"
                  title={`Jump to ${song.name}`}
                  disabled={firstScene === undefined}
                  onClick={() => {
                    if (firstScene !== undefined) onJump(firstScene);
                  }}
                >
                  {song.name}
                </button>
                <span className={facts.key === '' ? 'none' : ''} title={facts.key}>
                  {facts.key || '—'}
                </span>
                <span className={facts.bpm === '' ? 'none' : ''} title={facts.bpm}>
                  {facts.bpm || '—'}
                </span>
                <span className={facts.tag === '' ? 'none' : ''} title={facts.tag}>
                  {facts.tag || '—'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
}
