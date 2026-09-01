import { Button } from '@openflow/widgets/controls/Button.tsx';
import { STEMS, modelOf } from '../mock.ts';
import { duration } from '../openflow.ts';
import type { Mix } from '../state.ts';
import './Idle.css';

/**
 * What a track with no stems on disk shows: the three models, what each one
 * trades away, and one button.
 *
 * The cards say the trade rather than the score. A model's SDR figure is not
 * something you can act on standing at a laptop; "the piano bleeds badly" is.
 */
export function Idle({ mix }: { mix: Mix }) {
  const song = mix.song;
  const chosen = modelOf(mix.model);
  const factor = Number(chosen.speed.replace(/[^\d.]/g, '')) || 1;
  // A duration nobody has measured cannot be turned into an estimate, and a
  // made-up "about 4 min" is worse than admitting the length is not known yet.
  const estimate =
    song?.seconds == null
      ? null
      : Math.max(1, Math.round(song.seconds / 60 / factor));

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
          <Button onPress={mix.separate} tone="normal" className="mf-primary">
            Generate stems
          </Button>
          <span className="mf-estimate">
            {estimate === null
              ? `${chosen.speed} — length not read yet`
              : `${duration(song.seconds)} at ${chosen.speed} · about ${estimate} min`}
          </span>
        </div>
      </div>
    </div>
  );
}
