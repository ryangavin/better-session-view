import { useRef, type ReactNode, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { TRACK_DRAG } from '../play/decks.ts';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { STEMS } from '../mock.ts';
import { ORDERS, type Head, type Row } from '../listing.ts';
import type { Credit } from '../credits.ts';
import { gridFact, type GridNote, type Track } from '../openflow.ts';
import { tempoText } from '../warp.ts';
import type { Mix } from '../state.ts';
import { LIBRARY_MIN, useLibraryResize } from './useLibraryResize.ts';
import './Library.css';

/**
 * The library rail: a compact artist/album outline with aligned track facts.
 * Full credits remain searchable and available in the hover hint.
 * `listing.ts` decides which headings the library earns and where tracks file.
 */
export function Library({ mix }: { mix: Mix }) {
  const { library } = mix;
  const { rail, drag, nudge, maximum, current } = useLibraryResize(mix.setLibraryWidth);

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
          <Select
            items={ORDERS.map((o) => o.label)}
            index={Math.max(0, ORDERS.findIndex((o) => o.id === mix.order))}
            onChange={(i) => mix.setOrder(ORDERS[i].id)}
            disabled={!library.root}
            label="Order the library"
            title="How the library is arranged. Artist groups it into headings; Added puts the newest first"
            width={64}
          />
          <Button
            onPress={() => void mix.importTracks()}
            disabled={!library.root || mix.importing}
            title={library.root ? 'Copy tracks into the library folder' : 'Choose a library folder first'}
          >
            Import
          </Button>
        </div>
      </div>

      <div className="mf-library-list">
        {library.tracks.length > 0 && <div className="mf-library-columns" aria-hidden="true">
          <span>Track</span><span>Stems</span><span>BPM</span>
        </div>}
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

        <LibraryRows rows={mix.rows} mix={mix} />

        {library.tracks.length > 0 && mix.songs.length === 0 && (
          <p className="mf-library-empty">Nothing matches that.</p>
        )}
      </div>

      <div className="mf-library-foot" data-bad={mix.noteBad || undefined}>
        {!mix.noteBad && (
          <span>
            {mix.songs.length !== mix.total
              ? `${mix.songs.length} of ${mix.total}`
              : mix.artists > 0
                ? `${mix.total} · ${mix.artists} artists`
                : `${mix.total} indexed`}
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

/** Each sticky heading is bounded by the tracks it describes. */
function LibraryRows({ rows, mix }: { rows: readonly Row[]; mix: Mix }) {
  const children: ReactNode[] = [];
  for (let i = 0; i < rows.length;) {
    const row = rows[i];
    if (row.kind === 'track') {
      children.push(<Song key={row.key} mix={mix} song={row.track} depth={row.depth} credit={row.credit} />);
      i++;
      continue;
    }
    let end = i + 1;
    while (end < rows.length && (rows[end].kind === 'track' || (row.kind === 'artist' && rows[end].kind === 'album'))) end++;
    const searching = Boolean(mix.query.trim());
    children.push(
      <section key={row.key} className="mf-library-group" data-kind={row.kind}>
        <Heading head={row} at={mix.coverOf(row.art)} searching={searching}
          shut={!searching && mix.collapsed.has(row.key)} onToggle={(all) => mix.toggleHead(row.key, all)} />
        <LibraryRows rows={rows.slice(i + 1, end)} mix={mix} />
      </section>,
    );
    i = end;
  }
  return children;
}

/** Grouped rows omit repeated artist/artwork; flat rows keep their credit below the title. */
function Song({ mix, song, depth, credit }: { mix: Mix; song: Track; depth: number; credit: Credit | null }) {
  const held = {
    type: 'button' as const,
    className: 'mf-song',
    draggable: true,
    onDragStart: (event: ReactDragEvent) => {
      event.dataTransfer.setData(TRACK_DRAG, song.id);
      event.dataTransfer.effectAllowed = 'copy';
    },
    'data-selected': song.id === mix.selected || undefined,
    'data-depth': depth || undefined,
    onClick: () => mix.select(song.id),
    title: credit ? `${song.title} — ${credit.full}` : song.title,
  };
  return (
    <button {...held}>
      <span className="mf-song-identity">
        {depth === 0 && <Art at={mix.artOf(song)} title={song.title} />}
        <span className="mf-song-body">
          <span className="mf-song-line">
            <span className="mf-song-title">{song.title}</span>
            {depth > 0 && credit?.others && <span className="mf-song-with">{credit.others}</span>}
          </span>
          {depth === 0 && <span className="mf-song-artist">{song.artist ?? 'unknown artist'}</span>}
        </span>
      </span>
      <span className="mf-song-sources" title={song.sources.length
        ? `Available stems: ${STEMS.filter((stem) => song.sources.includes(stem.id)).map((stem) => stem.name).join(', ')}`
        : 'Original audio; no separated stems'}>
        {song.sources.length || '—'}
      </span>
      <GridMeta song={song} notes={mix.notes} />
    </button>
  );
}

/**
 * An artist, or one of their records — including the standing-in record that
 * holds whatever the catalogue never named, which carries an empty cover cell
 * so its name still starts in the album column.
 *
 * It sticks: an artist to the top of the list, a record just under wherever the
 * artist came to rest. `LibraryRows` bounds both by their own sections, so
 * neither heading can survive above a different group's tracks.
 *
 * Option-click shuts every heading rather than this one. A second button for
 * that would cost a line of chrome the rail does not have, and collapse-all has
 * been on the modifier in every outline view for thirty years.
 */
function Heading({ head, at, shut, searching, onToggle }: { head: Head; at: string | null; shut: boolean; searching: boolean; onToggle(all: boolean): void }) {
  const what = head.kind === 'album' ? 'record' : 'artist';
  return (
    <button
      type="button"
      className="mf-heading"
      data-kind={head.kind}
      data-shut={shut || undefined}
      aria-expanded={!shut}
      disabled={searching}
      onClick={(event: ReactMouseEvent) => onToggle(event.altKey)}
      title={searching ? 'Matching tracks stay expanded while searching' : `${shut ? 'Show' : 'Hide'} this ${what} — hold Option for all of them`}
    >
      <span className="mf-heading-caret" aria-hidden="true" />
      {head.kind === 'album' && (head.loose
        ? <span className="mf-art" data-blank aria-hidden="true" />
        : <Art at={at} title={head.name} />)}
      <span className="mf-heading-name">{head.name}</span>
      {head.kind === 'artist' && <span className="mf-heading-kind">Artist</span>}
      <span className="mf-heading-count" title={`${head.count} tracks`}>{head.count}</span>
    </button>
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
    <span className="mf-song-meta" data-grid={fact.state} title={`${fact.says}. ${fact.why}`}>
      {tempo || (fact.state === 'failed' ? 'no fit' : fact.state === 'unread' ? 'no grid' : '—')}
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
