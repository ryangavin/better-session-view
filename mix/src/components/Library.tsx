import { useRef, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { TRACK_DRAG } from '../play/decks.ts';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { STEMS } from '../mock.ts';
import { ORDERS, type Head } from '../listing.ts';
import type { Credit } from '../credits.ts';
import { gridFact, type GridNote, type Track } from '../openflow.ts';
import { tempoText } from '../warp.ts';
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
 * A row is two lines: the title with the strip, and the artist with where the
 * track's grid stands. That second fact is the rail's other job: the strip says
 * what has been separated, and this says what has been *gridded*, which is the
 * half of the import flow that used to finish invisibly or not at all. A tempo
 * means the beats are found; `no fit` and `no grid` are the two ways they are
 * not, and they want different things done about them.
 *
 * **Ordered by artist, a row loses a line and gains a heading.** The heading
 * already says the artist, so a second line spent restating it is width thrown
 * away — title, strip and grid fit on one, and the rail halves its row height
 * exactly when there is most of it to scan. Covers go up to the record's
 * heading, where one of them stands for the twelve underneath. Row shape
 * follows the *order*, never the data: every row in a listing is the same
 * height, so the rail does not change shape as covers arrive.
 *
 * `listing.ts` decides what the headings are and why a record earns one.
 */
/** How far the rail may be dragged. Narrower hides the badge strip; wider starves the decks. */
const NARROWEST = 190, WIDEST = 560;
const held = (width: number) => Math.round(Math.max(NARROWEST, Math.min(WIDEST, width)));

export function Library({ mix }: { mix: Mix }) {
  const { library } = mix;
  const rail = useRef<HTMLElement>(null);
  const width = () => rail.current?.getBoundingClientRect().width ?? NARROWEST;
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const from = width(), start = event.clientX;
    const move = (moved: PointerEvent) => mix.setLibraryWidth(held(from + moved.clientX - start));
    const done = () => window.removeEventListener('pointermove', move);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done, { once: true });
    window.addEventListener('pointercancel', done, { once: true });
  };
  const nudge = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
    if (!step) return;
    event.preventDefault();
    mix.setLibraryWidth(held(width() + step));
  };

  return (
    <aside className="mf-library" ref={rail} style={mix.libraryWidth ? { width: `${mix.libraryWidth}px` } : undefined}>
      <div className="mf-library-grip" role="separator" aria-orientation="vertical" aria-label="Library width"
        aria-valuemin={NARROWEST} aria-valuemax={WIDEST} aria-valuenow={mix.libraryWidth || undefined}
        tabIndex={0} onPointerDown={drag} onKeyDown={nudge} />
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
          <Select
            items={ORDERS.map((o) => o.label)}
            index={Math.max(0, ORDERS.findIndex((o) => o.id === mix.order))}
            onChange={(i) => mix.setOrder(ORDERS[i].id)}
            disabled={!library.root}
            label="Order the library"
            title="How the library is arranged. Artist groups it into headings; Added puts the newest first"
            width={44}
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

        {mix.rows.map((row) =>
          row.kind === 'track' ? (
            <Song key={row.key} mix={mix} song={row.track} depth={row.depth} credit={row.credit} />
          ) : (
            <Heading
              key={row.key}
              head={row}
              at={mix.coverOf(row.art)}
              shut={mix.collapsed.has(row.key)}
              onToggle={(all) => mix.toggleHead(row.key, all)}
            />
          ),
        )}

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

/**
 * One track in the rail.
 *
 * Two shapes, and which one it takes is the *order*'s business rather than the
 * track's: under a heading it is a single line, because the heading has already
 * said the artist and the record's cover is already on screen; in a flat
 * listing it keeps its cover and the second line that names who made it. Depth
 * is the tell — `listing.ts` gives every track a heading when it groups, so a
 * depth of zero means there is nothing above this row to lean on.
 *
 * **What the heading did not say, the row does.** A heading is the *lead* of a
 * credit, so a record billed `Skrillex & Rick Ross` sits under Skrillex with
 * `& Rick Ross` beside its title — grouping collapses the heading, never the
 * billing. The two share one clipped box rather than being two flex items,
 * because as flex items a long enough billing wins the negotiation and squeezes
 * the title out of its own row; in one box the ellipsis always falls on the
 * right and the title is always the part that survives. The whole credit as the manifest stores it is on the row's `title`,
 * which puts it in the hint strip along the bottom of the window on hover or
 * focus, and Track Details still edits it verbatim.
 */
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
  if (depth > 0)
    return (
      <button {...held}>
        <span className="mf-song-said">
          <span className="mf-song-title">{song.title}</span>
          {credit?.others && <span className="mf-song-with">{credit.others}</span>}
        </span>
        <StemStrip sources={song.sources} />
        <GridMeta song={song} notes={mix.notes} />
      </button>
    );
  return (
    <button {...held}>
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
  );
}

/**
 * An artist, or one of their records.
 *
 * It sticks: an artist to the top of the list, a record just under wherever the
 * artist came to rest. That is the whole reason `listing.ts` puts an artist's
 * loose tracks *before* its records — a heading that stays on screen has to be
 * telling the truth about the row beneath it, and there is no heading after the
 * last record to push it back off.
 *
 * Option-click shuts every heading rather than this one. A second button for
 * that would cost a line of chrome the rail does not have, and collapse-all has
 * been on the modifier in every outline view for thirty years.
 */
function Heading({ head, at, shut, onToggle }: { head: Head; at: string | null; shut: boolean; onToggle(all: boolean): void }) {
  const what = head.kind === 'album' ? 'record' : 'artist';
  return (
    <button
      type="button"
      className="mf-heading"
      data-kind={head.kind}
      data-shut={shut || undefined}
      aria-expanded={!shut}
      onClick={(event: ReactMouseEvent) => onToggle(event.altKey)}
      title={`${shut ? 'Show' : 'Hide'} this ${what} — hold Option for all of them`}
    >
      <span className="mf-heading-caret" aria-hidden="true" />
      {head.kind === 'album' && <Art at={at} title={head.name} />}
      <span className="mf-heading-name">{head.name}</span>
      <span className="mf-heading-count">{head.count}</span>
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
