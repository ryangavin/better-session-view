import { useEffect } from 'react';
import type { Derivation, DerivedSong } from '../../../core/src/derive.js';

interface Props {
  derivation: Derivation;
  pattern: string;
  /** Select every scene in a song and close. */
  onPick: (scenes: number[]) => void;
  /** Select the scenes the pattern couldn't read. */
  onPickUnmapped: () => void;
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
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // or Esc also stops every clip in Live
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const { songs, unmapped, scenes } = derivation;

  return (
    <div className="modal-back" onClick={onClose}>
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
          {unmapped.length > 0 ? (
            <button type="button" onClick={onPickUnmapped}>
              Select {unmapped.length} unmapped scene{unmapped.length === 1 ? '' : 's'}
            </button>
          ) : (
            <div className="hint">Every scene matched the pattern.</div>
          )}
          <div className="spacer" />
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
