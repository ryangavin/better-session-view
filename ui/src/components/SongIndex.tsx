import { useMemo, useState, type CSSProperties } from 'react';
import { hex, legibleOn } from '../../../core/src/color.js';
import type { Derivation } from '../../../core/src/derive.js';
import { songFacts } from '../../../core/src/songRows.js';
import { BAND_CONTRAST, RAIL } from './ClipGrid/constants.js';
import { ControlButton } from './Control.js';
import './SongIndex.css';

interface Props {
  derivation: Derivation;
  /** Live's palette, used only to paint the derived canonical song color. */
  palette: number[];
  onJump: (scene: number) => void;
  onClose: () => void;
}

type SortField = 'name' | 'key' | 'bpm' | 'type';
type SortDirection = 'ascending' | 'descending';

interface SortState {
  field: SortField;
  direction: SortDirection;
}

interface DisplaySong {
  name: string;
  key: string;
  bpm: string;
  type: string;
  firstScene: number | undefined;
  setOrder: number;
  searchText: string;
  /** Contrast-adjusted canonical RGB, or undefined for none/mixed/unresolvable. */
  color: number | undefined;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function SortHeading({
  field,
  label,
  sort,
  onSort,
}: {
  field: SortField;
  label: string;
  sort: SortState | null;
  onSort: (field: SortField) => void;
}) {
  const active = sort?.field === field;
  const direction = active ? sort.direction : null;
  const next = direction === 'ascending' ? 'descending' : 'ascending';

  return (
    <ControlButton
      type="button"
      className={active ? 'active' : ''}
      pressed={active}
      aria-label={`Sort by ${label} ${next}`}
      title={`Sort by ${label} ${next}`}
      onClick={() => onSort(field)}
    >
      <span>{label}</span>
      {direction && (
        <span className="sort-direction" aria-hidden="true">
          {direction === 'ascending' ? '↑' : '↓'}
        </span>
      )}
    </ControlButton>
  );
}

/**
 * A compact, read-only contents pane for moving around a large set.
 *
 * Songs appear once, in first-appearance order. A reprise is still the same
 * song, so its name jumps to the first block rather than inventing a second
 * identity here. The grid remains authoritative for folding and selection;
 * this pane does neither.
 */
export function SongIndex({ derivation, palette, onJump, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);

  // This is the index's own read-only list. It is rebuilt from the app's
  // derivation, then everything below this line is display state local to the
  // pane — no sorting or filtering can reach the snapshot or Live.
  const displaySongs = useMemo<DisplaySong[]>(
    () =>
      derivation.songs.map((song, setOrder) => {
        const facts = songFacts(song);
        // Exactly the same canonical-color rule as a grid header: all scenes
        // must agree on one real palette slot. Mixed and uncolored songs stay
        // neutral rather than letting the first scene speak for all of them.
        const colorIndex =
          song.observed.colorIndex.length === 1 ? song.observed.colorIndex[0] : undefined;
        const rgb = colorIndex === undefined || colorIndex < 0 ? undefined : palette[colorIndex];
        const values = {
          name: song.name,
          key: facts.key,
          bpm: facts.bpm,
          type: facts.tag,
        };
        return {
          ...values,
          firstScene: song.scenes[0],
          setOrder,
          searchText: Object.values(values).join(' ').toLocaleLowerCase(),
          color: rgb === undefined ? undefined : legibleOn(rgb, RAIL, BAND_CONTRAST),
        };
      }),
    [derivation, palette],
  );

  const shownSongs = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const shown =
      terms.length === 0
        ? [...displaySongs]
        : displaySongs.filter((song) =>
            terms.every((term) => song.searchText.includes(term)),
          );

    if (sort === null) return shown;
    return shown.sort((a, b) => {
      const av = a[sort.field];
      const bv = b[sort.field];
      // An absent fact is not a value and stays below stated facts in either
      // direction. Set order is the stable answer when two values agree.
      if (av === '' && bv !== '') return 1;
      if (av !== '' && bv === '') return -1;
      const compared = collator.compare(av, bv);
      return compared === 0
        ? a.setOrder - b.setOrder
        : compared * (sort.direction === 'ascending' ? 1 : -1);
    });
  }, [displaySongs, query, sort]);

  const onSort = (field: SortField) => {
    setSort((current) => ({
      field,
      direction:
        current?.field === field && current.direction === 'ascending'
          ? 'descending'
          : 'ascending',
    }));
  };

  return (
    <nav id="song-index" className="song-index" aria-label="Song index">
      <div className="song-index-head">
        <span className="lbl">Song index</span>
        <ControlButton
          type="button"
          className="song-index-close"
          aria-label="Close song index"
          title="Close song index"
          onClick={onClose}
        >
          ×
        </ControlButton>
      </div>

      <div className="song-index-search">
        <input
          type="search"
          value={query}
          placeholder="Search songs"
          aria-label="Search song names, keys, BPM, and types"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      <div className="song-index-columns">
        <SortHeading field="name" label="Name" sort={sort} onSort={onSort} />
        <SortHeading field="key" label="Key" sort={sort} onSort={onSort} />
        <SortHeading field="bpm" label="BPM" sort={sort} onSort={onSort} />
        <SortHeading field="type" label="Type" sort={sort} onSort={onSort} />
      </div>

      <div className="song-index-list">
        {shownSongs.length === 0 ? (
          <div className="song-index-empty">
            {displaySongs.length === 0 ? 'No mapped songs' : 'No songs match this search'}
          </div>
        ) : (
          shownSongs.map((song) => {
            return (
              <div
                className={`song-index-row${song.color === undefined ? '' : ' colored'}`}
                key={song.firstScene}
                style={
                  song.color === undefined
                    ? undefined
                    : ({
                        '--index-song-rgb': hex(song.color),
                      } as CSSProperties)
                }
              >
                <ControlButton
                  type="button"
                  className="song-index-name"
                  title={`Jump to ${song.name}`}
                  disabled={song.firstScene === undefined}
                  onClick={() => {
                    if (song.firstScene !== undefined) onJump(song.firstScene);
                  }}
                >
                  {song.name}
                </ControlButton>
                <span className={song.key === '' ? 'none' : ''} title={song.key}>
                  {song.key || '—'}
                </span>
                <span className={song.bpm === '' ? 'none' : ''} title={song.bpm}>
                  {song.bpm || '—'}
                </span>
                <span className={song.type === '' ? 'none' : ''} title={song.type}>
                  {song.type || '—'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
}
