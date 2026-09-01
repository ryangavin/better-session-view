import { STEMS, stemOf } from '../mock.ts';
import type { Mix } from '../state.ts';
import './Library.css';

/**
 * Everything on disk, and which of it has stems.
 *
 * The badges are the whole point of the rail: six three-letter marks say what a
 * track has been separated into without opening it, and a four-source model
 * leaves two of them dark — which is how you spot the track you separated in a
 * hurry and meant to redo.
 */
export function Library({ mix }: { mix: Mix }) {
  return (
    <aside className="mf-library">
      <div className="mf-library-filter">
        <input
          type="text"
          value={mix.query}
          onChange={(e) => mix.setQuery(e.target.value)}
          placeholder="Filter library"
          aria-label="Filter the library"
        />
      </div>

      <div className="mf-library-head">
        <span>track</span>
        <span>bpm</span>
      </div>

      <div className="mf-library-list">
        {mix.songs.map((song) => (
          <button
            key={song.id}
            type="button"
            className="mf-song"
            data-selected={song.id === mix.selected || undefined}
            onClick={() => mix.select(song.id)}
          >
            <span className="mf-song-body">
              <span className="mf-song-title">{song.title}</span>
              <span className="mf-song-artist">{song.artist}</span>
              {song.separated.length > 0 && (
                <span className="mf-badges">
                  {STEMS.map((stem) => {
                    const has = song.separated.includes(stem.id);
                    return (
                      <span
                        key={stem.id}
                        className="mf-badge"
                        data-on={has || undefined}
                        style={has ? { color: stem.ink } : undefined}
                        title={has ? `${stem.name} on disk` : `No ${stem.name.toLowerCase()} stem`}
                      >
                        {stem.badge}
                      </span>
                    );
                  })}
                </span>
              )}
            </span>
            <span className="mf-song-bpm">{song.bpm}</span>
          </button>
        ))}
        {mix.songs.length === 0 && <p className="mf-library-empty">Nothing matches that.</p>}
      </div>

      <div className="mf-library-foot">
        <span>{mix.total} indexed</span>
        <span>{mix.withStems} separated</span>
      </div>
    </aside>
  );
}

/** The same badges, at the size the detail rail wants them. */
export function Badges({ sources }: { sources: readonly string[] }) {
  return (
    <span className="mf-badges mf-badges-lg">
      {sources.map((id) => {
        const stem = stemOf(id);
        return (
          <span key={id} className="mf-badge" data-on style={{ color: stem.ink }}>
            {stem.badge}
          </span>
        );
      })}
    </span>
  );
}
