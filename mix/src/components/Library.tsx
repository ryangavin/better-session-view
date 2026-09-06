import { useState, type FormEvent } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { STEMS } from '../mock.ts';
import { gridFact, type GridNote, type Track } from '../openflow.ts';
import { tempoText } from '../warp.ts';
import type { Mix } from '../state.ts';
import { DebugButton } from './DebugButton.tsx';
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
 * A row is two lines: the title with the strip, and the artist with where the
 * track's grid stands. That second fact is the rail's other job: the strip says
 * what has been separated, and this says what has been *gridded*, which is the
 * half of the import flow that used to finish invisibly or not at all. A tempo
 * means the beats are found; `no fit` and `no grid` are the two ways they are
 * not, and they want different things done about them.
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
            <Art at={mix.artOf(song)} title={song.title} />
            <span className="mf-song-body">
              <span className="mf-song-line">
                <span className="mf-song-title">{song.title}</span>
                <StemStrip sources={song.sources} />
              </span>
              <span className="mf-song-line">
                <span className="mf-song-artist">{song.artist ?? 'unknown artist'}</span>
                <GridMeta song={song} notes={mix.notes} />
              </span>
            </span>
          </button>
        ))}

        {library.tracks.length > 0 && mix.songs.length === 0 && (
          <p className="mf-library-empty">Nothing matches that.</p>
        )}
      </div>

      <div className="mf-library-foot" data-bad={mix.noteBad || undefined}>
        <DebugButton mix={mix} />
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
 * Where this track's grid stands, in the width of a tempo.
 *
 * The reading is the header's: `warp.ts` decides whether a map is one number
 * or a range, and it decides it here too, so a track cannot be `128.05` in one
 * place and `125–132` in the other.
 */
function GridMeta({ song, notes }: { song: Track; notes: Record<string, GridNote> | null }) {
  const note = notes?.[song.id];
  const tempo =
    note && note.bpm !== null
      ? tempoText(note.bpm, note.slowest ?? note.bpm, note.fastest ?? note.bpm)
      : '';
  const fact = gridFact(song, note, tempo, notes !== null);
  return (
    <span className="mf-song-meta" data-grid={fact.state} title={fact.why}>
      {fact.says}
    </span>
  );
}

/**
 * The cover in the row, or the initial that stands in for one.
 *
 * The same 30px cell either way: a library where identified tracks are taller
 * than unidentified ones is a list that changes shape as covers arrive.
 */
export function Art({ at, title }: { at: string | null; title: string }) {
  return (
    <span className="mf-art" data-art={at ? true : undefined} aria-hidden="true">
      {at ? <img src={at} alt="" /> : title.charAt(0).toUpperCase()}
    </span>
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
