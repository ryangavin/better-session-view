import { useState, type FormEvent } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { STEMS } from '../mock.ts';
import { facts } from '../openflow.ts';
import type { Mix } from '../state.ts';
import './Library.css';

/**
 * Everything in the library folder, and which of it has stems.
 *
 * The badge strip is the point of the rail: six cells that say what a track has
 * been separated into without opening it, and a four-source model leaves two of
 * them dark — which is how you spot the one you separated in a hurry and meant
 * to redo. One letter each rather than three, because six three-letter badges
 * is a second line of text on every row and a hundred rows of that is a wall.
 *
 * A row is two lines: the title with the strip, and the artist with the facts
 * you sort by. On the day a track is imported nothing has read its tags or its
 * tempo, so the second fact is the file's own type until something better is
 * known — which is honest, and better than four columns of dashes.
 */
export function Library({ mix }: { mix: Mix }) {
  const { library } = mix;
  const [youtube, setYoutube] = useState('');

  const fetchYoutube = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!youtube.trim()) return;
    if (await mix.importYoutube(youtube)) setYoutube('');
  };

  return (
    <aside className="mf-library">
      <div className="mf-library-top">
        <div className="mf-library-tools">
          <input
            type="text"
            value={mix.query}
            onChange={(e) => mix.setQuery(e.target.value)}
            placeholder="Filter library"
            aria-label="Filter the library"
            disabled={!library.root}
          />
          <Button
            onPress={() => void mix.importTracks()}
            disabled={!library.root || mix.importing}
            title={library.root ? 'Copy tracks into the library folder' : 'Choose a library folder first'}
          >
            Import
          </Button>
        </div>
        <form className="mf-library-tools" onSubmit={(event) => void fetchYoutube(event)}>
          <input
            type="url"
            value={youtube}
            onChange={(event) => setYoutube(event.currentTarget.value)}
            placeholder="YouTube URL"
            aria-label="YouTube URL"
            disabled={!library.root || mix.importing}
          />
          <Button
            onPress={() => void fetchYoutube()}
            disabled={!library.root || mix.importing || !youtube.trim()}
            title={library.root ? 'Fetch the best audio with yt-dlp' : 'Choose a library folder first'}
          >
            Fetch
          </Button>
        </form>
      </div>

      <div className="mf-library-list">
        {!library.root && !mix.loading && (
          <div className="mf-library-blank">
            <p className="mf-blank-lead">No library yet.</p>
            <p>
              Pick a folder. Tracks you import are copied into it beside a manifest, so the
              whole library moves when the folder does.
            </p>
            <Button onPress={() => void mix.chooseFolder()} className="mf-primary">
              Choose a folder
            </Button>
          </div>
        )}

        {library.problem && (
          <div className="mf-library-blank">
            <p className="mf-blank-bad">{library.problem}</p>
            <Button onPress={() => void mix.chooseFolder()}>Choose another folder</Button>
          </div>
        )}

        {library.root && !library.problem && library.tracks.length === 0 && (
          <div className="mf-library-blank">
            <p className="mf-blank-lead">Nothing in here yet.</p>
            <p>Import a few tracks and they will be copied into the folder.</p>
            <Button
              onPress={() => void mix.importTracks()}
              disabled={mix.importing}
              className="mf-primary"
            >
              Import tracks
            </Button>
          </div>
        )}

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
                <StemStrip sources={song.sources} />
              </span>
              <span className="mf-song-line">
                <span className="mf-song-artist">{song.artist ?? 'unknown artist'}</span>
                <span className="mf-song-meta">{facts(song)}</span>
              </span>
            </span>
          </button>
        ))}

        {library.tracks.length > 0 && mix.songs.length === 0 && (
          <p className="mf-library-empty">Nothing matches that.</p>
        )}
      </div>

      <div className="mf-library-foot" data-bad={mix.noteBad || undefined}>
        {!mix.noteBad && (
          <span>
            {mix.songs.length === mix.total
              ? `${mix.total} indexed`
              : `${mix.songs.length} of ${mix.total}`}
          </span>
        )}
        {mix.note ? (
          <span
            className="mf-library-note"
            data-bad={mix.noteBad || undefined}
            title={mix.note}
          >
            {mix.note}
          </span>
        ) : (
          <button
            type="button"
            className="mf-library-where"
            onClick={mix.reveal}
            disabled={!library.root}
            title={library.root ?? 'No library folder'}
          >
            {library.root ? library.root.split('/').slice(-1)[0] : '—'}
          </button>
        )}
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
