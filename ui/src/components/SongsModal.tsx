import type { Derivation, DerivedSong } from '../../../core/src/derive.js';
import './SongsModal.css';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js';
import { ControlButton } from './Control.js';

interface Props {
  derivation: Derivation;
  pattern: string;
  /** Select every scene in a song and close. */
  onPick: (scenes: number[]) => void;
  /** Select the scenes the pattern couldn't read. */
  onPickUnmapped: () => void;
  /** How many songs are folded in the grid right now. */
  collapsedCount: number;
  onCollapseAll: (all: boolean) => void;
  onClose: () => void;
}

/** One value, or the disagreement — never one of several presented as the answer. */
function Observed({ values }: { values: readonly (string | number)[] }) {
  if (values.length === 0) return <span className="dim">—</span>;
  if (values.length === 1) return <>{values[0]}</>;
  return (
    <span className="clash" title="The scenes of this song disagree">
      {values.join(' / ')}
    </span>
  );
}

function rowFlags(song: DerivedSong): string[] {
  const flags: string[] = [];
  // Legal — a song is a label, not a range — but worth surfacing, because the
  // other reason for two blocks is that two different songs share a name.
  if (song.blocks.length > 1) flags.push(`${song.blocks.length} blocks`);
  return flags;
}

/**
 * What the app made of the set, read back through the scene pattern.
 *
 * Read-only on purpose. This is the view that answers "does derivation work on
 * a real set" before anything is built on top of it, and it can't give a
 * misleading answer if it has nothing to write with.
 */
export function SongsModal({
  derivation,
  pattern,
  onPick,
  onPickUnmapped,
  collapsedCount,
  onCollapseAll,
  onClose,
}: Props) {
  useCloseOnEscape(onClose);

  const { songs, unmapped, scenes } = derivation;

  return (
    <div className="viewport-overlay modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          Songs — {songs.length} in {scenes.length} scenes
        </div>
        <div className="hint">
          Read back out of the scene names with{' '}
          <span className="preview">{pattern}</span>. Nothing here is stored; it is
          what the set says. Click a song to select its scenes.
        </div>

        {songs.length === 0 ? (
          <div className="hint">No scene name matched the pattern.</div>
        ) : (
          <div className="songs-wrap">
            <table className="songs">
              <thead>
                <tr>
                  <th>song</th>
                  <th className="n">scenes</th>
                  <th>bpm</th>
                  <th>key</th>
                  <th>tag</th>
                  <th>tempo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {songs.map((song) => (
                  <tr key={song.name} onClick={() => onPick(song.scenes)}>
                    <td className="song-name">{song.name}</td>
                    <td className="n">{song.scenes.length}</td>
                    <td>
                      <Observed values={song.observed.bpm} />
                    </td>
                    <td>
                      <Observed values={song.observed.key} />
                    </td>
                    <td>
                      <Observed values={song.observed.tag} />
                    </td>
                    <td>
                      <Observed values={song.observed.tempo} />
                    </td>
                    <td className="flags">
                      {rowFlags(song).map((f) => (
                        <span key={f} className="flag">
                          {f}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          {/* Folding everything is how a 100-song set becomes navigable, so it
              belongs next to the list rather than buried in the grid. */}
          <ControlButton
            type="button"
            disabled={songs.length === 0}
            onClick={() => onCollapseAll(collapsedCount < songs.length)}
          >
            {collapsedCount < songs.length ? 'Collapse all' : 'Expand all'}
          </ControlButton>
          {unmapped.length > 0 ? (
            <ControlButton onClick={onPickUnmapped}>
              Select {unmapped.length} unmapped scene{unmapped.length === 1 ? '' : 's'}
            </ControlButton>
          ) : (
            <div className="hint">Every scene matched.</div>
          )}
          <div className="spacer" />
          <ControlButton intent="primary" onClick={onClose}>
            Close
          </ControlButton>
        </div>
      </div>
    </div>
  );
}
