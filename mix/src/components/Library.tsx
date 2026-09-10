import { memo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { keyLabel, keyDescription, savedKey } from '../key.ts';
import { TRACK_DRAG } from '../play/decks.ts';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { COLUMN_LABELS, type Choice, type Column } from '../listing.ts';
import { STEMS } from '../mock.ts';
import { gridFact, type Track } from '../openflow.ts';
import { tempoText } from '../warp.ts';
import type { Mix } from '../state.ts';
import { LibraryAnalysis, LibraryStems } from './LibraryAnalysis.tsx';
import { LIBRARY_MIN, useLibraryResize } from './useLibraryResize.ts';
import { useLibraryColumnWidths } from '../useLibraryColumnWidths.ts';
import { ColumnResize } from './ColumnResize.tsx';
import './Library.css';

/** One song per row, with its own artwork and unmodified credit. */

export function Library({ mix }: { mix: Mix }) {
  const { library } = mix;
  const { widths, resize } = useLibraryColumnWidths();
  const { rail, drag, nudge, maximum, current } = useLibraryResize(mix.setLibraryWidth);
  const draggedColumn = useRef<Column | null>(null);
  const suppressSort = useRef(false);
  const [dropTarget, setDropTarget] = useState<Column | null>(null);

  return (
    <aside className="mf-library" ref={rail} style={mix.libraryWidth ? { width: `${mix.libraryWidth}px` } : undefined}>
      <div className="mf-library-grip" role="separator" aria-orientation="vertical" aria-label="Library width"
        aria-valuemin={LIBRARY_MIN} aria-valuemax={maximum} aria-valuenow={current}
        tabIndex={0} onPointerDown={drag} onKeyDown={nudge} />
      <div className="mf-library-top">
        <div className="mf-library-tools">
          <div className="mf-library-search">
            <input
              type="text"
              value={mix.query}
              onChange={(e) => mix.setQuery(e.target.value)}
              placeholder="Filter library"
              aria-label="Filter the library"
              disabled={!library.root}
              title="Search title, artist, collaborators and album; all words must match. Escape clears"
              onKeyDown={(event) => {
                if (event.key === 'Escape' && mix.query) {
                  event.preventDefault();
                  event.stopPropagation();
                  mix.setQuery('');
                }
              }}
            />
            {mix.query && <button type="button" className="mf-library-clear" aria-label="Clear library search"
              title="Clear library search" onClick={() => mix.setQuery('')}>×</button>}
          </div>
          <button type="button" className="mf-library-recent" disabled={!library.root}
            aria-pressed={mix.order === 'added'} onClick={() => mix.sortBy('added')}
            title="Sort by import date; click again to reverse">Recent{mix.order === 'added' ? (mix.descending ? ' ↓' : ' ↑') : ''}</button>
          <Button
            onPress={() => void mix.importTracks()}
            disabled={!library.root || mix.importing}
            title={library.root ? 'Copy tracks into the library folder' : 'Choose a library folder first'}
          >
            Import
          </Button>
        </div>
      </div>

      {library.root && library.tracks.length > 0 && <div className="mf-library-browser" aria-label="Browse library">
        <BrowseList label="Artists" all="All artists" choices={mix.libraryBrowser.artists}
          selected={mix.libraryBrowser.artist} onChange={mix.browseArtist} />
        <BrowseList label="Albums" all="All albums" choices={mix.libraryBrowser.albums}
          selected={mix.libraryBrowser.album} onChange={mix.browseAlbum} />
        <BrowseList label="Keys" all="All keys" choices={mix.libraryBrowser.keys}
          selected={mix.libraryBrowser.key} onChange={mix.browseKey} />
        <button type="button" className="mf-library-reset" onClick={mix.resetLibraryFilters}
          disabled={!mix.query && mix.libraryBrowser.artist === null && mix.libraryBrowser.album === null && mix.libraryBrowser.key === null}>Reset filters</button>
      </div>}

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
            <p>Import audio files or drop a YouTube video link here.</p>
            <Button
              onPress={() => void mix.importTracks()}
              disabled={mix.importing}
              className="mf-primary"
            >
              Import tracks
            </Button>
          </div>
        )}

        {library.tracks.length > 0 && <table className="mf-library-table" aria-label="Library songs"
          style={{ width: mix.columns.reduce((total, column) => total + widths[column], 0) }}>
          <colgroup>{mix.columns.map(column => <col key={column} className={`mf-library-col-${column}`} style={{ width: widths[column] }} />)}</colgroup>
          <thead><tr>{mix.columns.map(column => (
            <th key={column} scope="col" aria-label={COLUMN_LABELS[column]} draggable data-drop-target={dropTarget === column || undefined}
              aria-sort={mix.order === column ? (mix.descending ? 'descending' : 'ascending') : 'none'}
              onDragStart={event => {
                draggedColumn.current = column;
                suppressSort.current = true;
                event.dataTransfer.setData('application/x-mix-library-column', column);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={event => {
                if (!draggedColumn.current) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTarget(column);
              }}
              onDrop={event => {
                if (!draggedColumn.current) return;
                event.preventDefault();
                mix.dropColumn(draggedColumn.current, column);
                draggedColumn.current = null;
                setDropTarget(null);
              }}
              onDragEnd={() => { draggedColumn.current = null; setDropTarget(null); }}>
              <button type="button" title="Drag to reorder; Alt+Left/Right moves this column from the keyboard"
                onPointerDown={() => { suppressSort.current = false; }}
                onKeyDown={event => {
                  suppressSort.current = false;
                  if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                    event.preventDefault();
                    mix.reorderColumn(column, event.key === 'ArrowLeft' ? -1 : 1);
                  }
                }}
                onClick={() => {
                  if (!suppressSort.current && column !== 'analysis' && column !== 'stems') mix.sortBy(column);
                }}>
                {COLUMN_LABELS[column]}<span aria-hidden="true">{mix.order === column ? (mix.descending ? ' ↓' : ' ↑') : ''}</span>
              </button>
              <ColumnResize column={column} width={widths[column]} resize={resize} />
            </th>
          ))}</tr></thead>
          <tbody>{mix.rows.map((song) => <Song key={song.id} mix={mix} song={song} />)}</tbody>
        </table>}

        {library.tracks.length > 0 && mix.songs.length === 0 && (
          <p className="mf-library-empty">Nothing matches that.</p>
        )}
      </div>

      <div className="mf-library-foot" data-bad={mix.noteBad || undefined}>
        {!mix.noteBad && (
          <span>
            {mix.songs.length !== mix.total
              ? `${mix.songs.length} of ${mix.total}`
              : `${mix.total} songs`}
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

/** Native listboxes give keyboard arrows and type-to-select without a second interaction model. */
function BrowseList({ label, all, choices, selected, onChange }: {
  label: string; all: string; choices: Choice[]; selected: string | null; onChange(value: string | null): void;
}) {
  const index = selected === null ? 0 : choices.findIndex(choice => choice.key === selected) + 1;
  return <label className="mf-library-facet">
    <span>{label}</span>
    <select aria-label={label} size={5} value={index} onChange={event => {
      const next = Number(event.target.value);
      onChange(next === 0 ? null : choices[next - 1].key);
    }}>
      <option value={0}>{all}</option>
      {choices.map((choice, index) => <option key={choice.key} value={index + 1} title={choice.name}>{choice.name}</option>)}
    </select>
  </label>;
}

/** The row remains a drag source; its native button provides keyboard selection. */
const Song = memo(function Song({ mix, song }: { mix: Mix; song: Track }) {
  const note = mix.notes?.[song.id];
  const tempo = note && note.bpm !== null ? tempoText(note.bpm, note.slowest ?? note.bpm, note.fastest ?? note.bpm) : '';
  const fact = gridFact(song, note, tempo, mix.notes !== null);
  const stems = song.sources.length
    ? `Stems: ${STEMS.filter((stem) => song.sources.includes(stem.id)).map((stem) => stem.name).join(', ')}`
    : 'Original audio; no separated stems';
  const detail = `${song.title} — ${song.artist ?? 'Unknown artist'} — ${song.album ?? 'No album'}. ${stems}. ${fact.says}. ${fact.why}. ${keyDescription(song)}`;
  return (
    <tr className="mf-song" draggable onDragStart={(event: ReactDragEvent) => {
      event.dataTransfer.setData(TRACK_DRAG, song.id);
      event.dataTransfer.effectAllowed = 'copy';
    }} data-selected={song.id === mix.selected || undefined} onClick={() => mix.select(song.id)} title={detail}>
      {mix.columns.map(column => <td key={column}>{column === 'analysis'
        ? <LibraryAnalysis song={song} root={mix.library.root} />
        : column === 'stems' ? <LibraryStems sources={song.sources} />
        : column === 'bpm' ? <span className="mf-song-bpm" title={`${fact.says}. ${fact.why}.`}>{tempo || '—'}</span>
        : column === 'key' ? <span className="mf-song-key" title={keyDescription(song)}>{keyLabel(song)}{!song.key && savedKey(song)?.status === 'candidate' ? ' ?' : ''}</span>
        : column === 'title'
        ? <button type="button" className="mf-song-identity" aria-pressed={song.id === mix.selected}
          aria-label={`${song.title} — ${song.artist ?? 'Unknown artist'}`}>
          <Art at={mix.artOf(song)} title={song.title} /><span className="mf-song-title">{song.title}</span>
        </button>
        : <span className={`mf-song-${column}`} title={song[column] ?? (column === 'artist' ? 'Unknown artist' : 'No album')}>
          {song[column] ?? '—'}
        </span>}</td>)}
    </tr>
  );
});

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
