import { Button } from '@openflow/widgets/controls/Button.tsx';
import type { Match, Track } from '../openflow.ts';
import type { Mix } from '../state.ts';
import { useDraft } from './draft.ts';

/**
 * Who this track is by, what it is called, and what it looks like.
 *
 * It sits on the setup screen because that is the one moment a person is
 * already looking at a track and not yet listening to it. Every other screen in
 * this app is about the audio — the lanes are for mixing, the header is for
 * transport — and a metadata form on any of them is a form in the way.
 *
 * **The fields are already filled in.** An import reads the filename
 * (`electron/guess.ts`) and then asks a catalogue (`electron/art.ts`), so what
 * is drawn here is usually right and always editable. This is a correction
 * surface, not a data entry one, which is why nothing is marked required and
 * why there is no Save: a field commits when you leave it.
 *
 * **A blur commits, and that is the whole interaction.** A Save button on a
 * three-field form is a button that exists to be forgotten, and its absence is
 * only safe because a wrong value here breaks nothing — it is a name, and the
 * next thing a person does is look at it.
 */
export function Details({ mix, song }: { mix: Mix; song: Track }) {
  const cover = mix.artOf(song);

  return (
    <div className="mf-details">
      <Cover mix={mix} song={song} at={cover} />
      <div className="mf-fields">
        <Field
          label="Title"
          value={song.title}
          required
          onCommit={(next) => void mix.editTrack(song.id, { title: next.trim() })}
        />
        <Field
          label="Artist"
          value={song.artist ?? ''}
          placeholder="unknown"
          onCommit={(next) => void mix.editTrack(song.id, { artist: next.trim() || null })}
        />
        <Field
          label="Album"
          value={song.album ?? ''}
          placeholder="unknown"
          onCommit={(next) => void mix.editTrack(song.id, { album: next.trim() || null })}
        />
      </div>
      <Lookup mix={mix} song={song} />
    </div>
  );
}

/**
 * The cover, or the space one would take.
 *
 * A drawn placeholder rather than a collapsed box, because the row's height is
 * what tells you at a glance whether this track has been identified — and a
 * layout that reflows when the art arrives is a layout that flinches.
 */
function Cover({ mix, song, at }: { mix: Mix; song: Track; at: string | null }) {
  if (!at) {
    return (
      <div className="mf-cover mf-cover-none" aria-hidden="true">
        <span>no art</span>
      </div>
    );
  }
  return (
    <div className="mf-cover">
      <img src={at} alt={`Cover art for ${song.title}`} />
      <button
        type="button"
        className="mf-cover-clear"
        title="Remove this cover"
        aria-label="Remove this cover"
        onClick={() => void mix.editTrack(song.id, { art: null })}
      >
        ×
      </button>
    </div>
  );
}

/**
 * One editable fact, drawn as a field because this screen is a form.
 *
 * The header's two are the same correction with the box taken off — both are
 * `useDraft`, which is where the commit-on-blur, the re-seeding and the escape
 * live.
 */
function Field({
  label,
  value,
  placeholder,
  required,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  onCommit(next: string): void;
}) {
  const props = useDraft(value, onCommit, required);

  return (
    <label className="mf-field">
      <span className="mf-field-label">{label}</span>
      <input {...props} placeholder={placeholder} />
    </label>
  );
}

/**
 * Ask the catalogue again, for when the import's first answer was wrong.
 *
 * The import already took the top match without asking — that is the trade of
 * doing it automatically, and this is the other half of it. The search runs on
 * whatever the fields now say, so correcting the artist and pressing this is
 * the way out of a bad guess.
 *
 * Candidates are shown rather than applied. One result is a fact; five results
 * are a question, and the question is the honest thing to draw when a title
 * exists as a single, an album cut, a remaster and two live takes.
 */
function Lookup({ mix, song }: { mix: Mix; song: Track }) {
  const term = [song.artist, song.title].filter(Boolean).join(' ');

  return (
    <div className="mf-lookup">
      <Button
        onPress={() => void mix.findMatches(term)}
        disabled={mix.matching || !term.trim()}
        title="Search a catalogue for this track's artist, album and cover art"
      >
        {mix.matching ? 'Searching…' : 'Look up'}
      </Button>

      {mix.matches.length > 0 && (
        <ul className="mf-matches">
          {mix.matches.map((found, i) => (
            <MatchRow key={i} found={found} onTake={() => void mix.takeMatch(song.id, found)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchRow({ found, onTake }: { found: Match; onTake(): void }) {
  return (
    <li>
      <button type="button" className="mf-match" onClick={onTake}>
        {found.thumb ? (
          <img src={found.thumb} alt="" />
        ) : (
          <span className="mf-match-none" aria-hidden="true" />
        )}
        <span className="mf-match-words">
          <span className="mf-match-title">{found.title}</span>
          <span className="mf-match-by">
            {[found.artist, found.album, found.year].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
    </li>
  );
}
