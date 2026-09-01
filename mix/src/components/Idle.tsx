import { Button } from '@openflow/widgets/controls/Button.tsx';
import { STEMS } from '../mock.ts';
import { duration, estimate, roughly } from '../openflow.ts';
import type { Mix } from '../state.ts';
import './Idle.css';

/**
 * What a track with no stems on disk shows: the models this build will actually
 * run, what each one trades away, and one button.
 *
 * The cards say the trade rather than the score. A model's SDR figure is not
 * something you can act on standing at a laptop; "the piano bleeds badly" is.
 *
 * The list comes from the main process rather than from a constant here, so
 * what is offered and what a job runs are one registry. Without an app around
 * the page there is nothing to offer and the page says so — which is honest, and
 * is what a `vite` session in a browser tab gets.
 */
export function Idle({ mix }: { mix: Mix }) {
  const song = mix.song;
  const chosen = mix.chosenModel;
  const wait = roughly(estimate(chosen, song?.seconds ?? null));

  if (!song) return null;

  return (
    <div className="mf-page">
      <div className="mf-page-body">
        <p className="mf-eyebrow">no stems on disk</p>
        <h2 className="mf-page-title">{song.title}</h2>
        <p className="mf-page-blurb">
          Each model trades render time against bleed between sources. A six-source model
          splits guitar and piano out of the residual; a four-source one folds them back
          into Other.
        </p>

        {mix.problem && <p className="mf-page-problem">{mix.problem}</p>}

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
              <span className="mf-model-blurb">{model.blurb}</span>
              <span className="mf-model-facts">
                <span>{model.sources.length} sources</span>
                <span>{model.speed}</span>
              </span>
              <span className="mf-model-sources">
                {STEMS.map((stem) => (
                  <span
                    key={stem.id}
                    className="mf-model-dot"
                    style={
                      model.sources.includes(stem.id) ? { background: stem.ink } : undefined
                    }
                    title={stem.name}
                  />
                ))}
              </span>
            </button>
          ))}
        </div>

        <div className="mf-page-actions">
          <Button
            onPress={() => void mix.separate()}
            tone="normal"
            className="mf-primary"
            disabled={!chosen || mix.runningId !== null}
          >
            Generate stems
          </Button>
          <span className="mf-estimate">
            {!chosen
              ? 'separation needs the app around this page'
              : mix.runningId !== null
                ? 'one at a time — something else is separating'
                : wait === null
                  ? `${chosen.speed} — length not read yet`
                  : `${duration(song.seconds)} at ${chosen.speed} · ${wait}`}
          </span>
        </div>
      </div>
    </div>
  );
}
