import { STEMS } from '../mock.ts';
import type { Mix } from '../state.ts';
import './Library.css';

/**
 * Everything on disk, and which of it has stems.
 *
 * The badge strip is the whole point of the rail: six cells that say what a
 * track has been separated into without opening it, and a four-source model
 * leaves two of them dark — which is how you spot the track you separated in a
 * hurry and meant to redo. One letter each rather than three, because six
 * three-letter badges is a second line of text on every row and a hundred and
 * thirty rows of that is a wall.
 *
 * A row is two lines: the title with the strip, and the artist with the two
 * facts you sort by. The tile is the album art it will eventually hold, and
 * until then the initial — which is still enough to find your place in a list
 * you have scrolled.
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

      <div className="mf-library-list">
        {mix.songs.map((song) => (
          <button
            key={song.id}
            type="button"
            className="mf-song"
            data-selected={song.id === mix.selected || undefined}
            onClick={() => mix.select(song.id)}
          >
            <span className="mf-art" aria-hidden="true">
              {song.title.charAt(0).toUpperCase()}
            </span>
            <span className="mf-song-body">
              <span className="mf-song-line">
                <span className="mf-song-title">{song.title}</span>
                <StemStrip sources={song.separated} />
              </span>
              <span className="mf-song-line">
                <span className="mf-song-artist">{song.artist}</span>
                <span className="mf-song-meta">
                  {song.key} · {song.bpm}
                </span>
              </span>
            </span>
          </button>
        ))}
        {mix.songs.length === 0 && <p className="mf-library-empty">Nothing matches that.</p>}
      </div>

      <div className="mf-library-foot">
        <span>
          {mix.songs.length === mix.total
            ? `${mix.total} indexed`
            : `${mix.songs.length} of ${mix.total}`}
        </span>
        <span>{mix.withStems} separated</span>
      </div>
    </aside>
  );
}

/**
 * Six cells, joined, in source order — so a gap is always in the same place and
 * "no guitar" is a shape rather than something to read.
 */
export function StemStrip({ sources }: { sources: readonly string[] }) {
  return (
    <span className="mf-strip">
      {STEMS.map((stem) => {
        const has = sources.includes(stem.id);
        return (
          <span
            key={stem.id}
            className="mf-strip-cell"
            data-on={has || undefined}
            style={has ? { color: stem.ink } : undefined}
            title={has ? `${stem.name} on disk` : `No ${stem.name.toLowerCase()} stem`}
          >
            {stem.glyph}
          </span>
        );
      })}
    </span>
  );
}
