import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Details } from './Details.tsx';
import { StemStrip as Strip } from './Library.tsx';
import { duration, estimate, roughly, type Ready } from '../openflow.ts';
import type { Mix } from '../state.ts';
import './Idle.css';

/**
 * What a track with no stems on disk shows: who it is by, the models this build
 * will actually run, what each one trades away, and one button.
 *
 * **It is also where a separation is redone.** A track with stems reaches it
 * embedded in the details dialog — `DetailsModal.tsx` — because redoing one
 * means *choosing* again: a job is keyed on the file's content hash and the
 * model, so re-running what is already on disk is answered from the cache and
 * looks like nothing happened. The screen says the stems are there.
 *
 * The metadata sits here for the same reason: it is the one moment a person is
 * looking at a track and not yet listening to it. `Details.tsx` has the form.
 *
 * The cards are three stats and no prose: the stems it makes, as the same
 * lettered strip the library shows, and speed and quality as five pips each,
 * the way a game draws a stat — the exact figures are in the tooltip for
 * whoever wants them. Speed is the measured realtime rate against the
 * fastest model here; quality is the registry's rank.
 *
 * The list comes from the main process rather than from a constant here, so
 * what is offered and what a job runs are one registry. Without an app around
 * the page there is nothing to offer and the page says so — which is honest, and
 * is what a `vite` session in a browser tab gets.
 */
export function Idle({ mix, ready, embedded = false }: { mix: Mix; ready: Ready | null; embedded?: boolean }) {
  const song = mix.song;
  const chosen = mix.chosenModel;
  const wait = roughly(estimate(chosen, song?.seconds ?? null));
  /**
   * Said before the button rather than discovered after it.
   *
   * The first separation on a machine also builds the Python engine —
   * `mix/electron/runtime.ts` — which is a few hundred megabytes and some
   * minutes. That is fine to do and not fine to do *silently*: a progress bar
   * that appears without warning is indistinguishable from something being
   * wrong with the song.
   */
  const setup = ready?.ok === true && !ready.built;

  if (!song) return null;

  const fastest = Math.max(1, ...mix.models.map((m) => m.realtime));
  /** Stems already on disk, which is only true when this screen was asked for. */
  const again = song.sources.length > 0;
  /** The same model over the same file is answered from disk, not re-rendered. */
  const same = again && song.model === mix.model;

  return (
    <div className="mf-page">
      <div className="mf-page-body">
        <p className="mf-eyebrow">{again ? `${mix.labelOf(song.model)} · stems on disk` : 'Choose your stems'}</p>
        {!embedded && <h2 className="mf-page-title">{song.title}</h2>}

        <Details mix={mix} song={song} />

        {mix.problem && <p className="mf-page-problem">{mix.problem}</p>}

        {setup && (
          <p className="mf-page-note">
            The first local job on this machine installs the Python engine as well —
            several hundred megabytes, once. It stays installed, and each separation
            model downloads its own checkpoint the first time you use it.
          </p>
        )}

        <div className="mf-models">
          {mix.models.map((model) => (
            <button
              key={model.id}
              type="button"
              className="mf-model"
              data-on={model.id === mix.model || undefined}
              onClick={() => mix.setModel(model.id)}
            >
              <span className="mf-model-name">{model.label}</span>
              <span className="mf-model-stats">
                <span>stems</span>
                <Strip sources={model.sources} />
                <span>speed</span>
                <Pips of={Math.max(1, Math.round((model.realtime / fastest) * 5))} title={`${model.speed} — ${wait === null || model.id !== mix.model ? 'the separation phase, on Apple silicon' : wait}`} />
                <span>quality</span>
                <Pips of={model.quality} title={`${model.quality} of 5 against the models here`} />
              </span>
            </button>
          ))}
        </div>

        <div className="mf-page-actions">
          <Button
            onPress={() => void mix.separate()}
            tone="normal"
            className="mf-primary"
            disabled={!chosen || mix.engineBusy}
          >
            {again ? 'Separate again' : 'Generate stems'}
          </Button>
          <span className="mf-estimate">
            {!chosen
              ? 'separation needs the app around this page'
              : mix.engineBusy
                ? 'one at a time — the local engine is already working'
                : same
                  ? `${mix.labelOf(song.model)} is already on disk — this returns it in a moment`
                  : wait === null
                    ? `${chosen.speed} — length not read yet`
                    : `${duration(song.seconds)} at ${chosen.speed} · ${wait}`}
          </span>
        </div>
      </div>
    </div>
  );
}

/** A stat as a game draws one: five pips, so many of them lit. */
function Pips({ of, title }: { of: number; title: string }) {
  return (
    <span className="mf-pips" role="img" aria-label={`${of} of 5`} title={title}>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} data-on={i < of || undefined} />
      ))}
    </span>
  );
}
