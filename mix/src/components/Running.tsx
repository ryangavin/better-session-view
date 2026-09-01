import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Meter } from '@openflow/widgets/controls/Meter.tsx';
import { stemOf } from '../mock.ts';
import { roughly } from '../openflow.ts';
import type { Mix } from '../state.ts';
import './Running.css';

/**
 * A separation in flight, reported by the process actually doing it.
 *
 * The worker hands back the quantities `demucs.api`'s callback carries — how
 * many chunks of how many models have finished — rather than a bar drawn on a
 * terminal, so this is a number all the way down. `mix/docs/demucs.md` has why
 * that route was taken over parsing stderr.
 *
 * **Per-stem meters appear only when the model has stems to report.** Only a bag
 * of per-source checkpoints — `htdemucs_ft` — separates one source at a time.
 * Every other model produces all of them in one pass and they finish in the same
 * instant, so four meters would be the overall bar drawn four times with four
 * different labels. When there is nothing per-stem to say, the sources are
 * listed and light up as their files are written, which is a thing that really
 * does happen one at a time.
 */
export function Running({ mix }: { mix: Mix }) {
  const job = mix.job;
  if (!job || !mix.song) return null;
  const sources = job.sources.length > 0 ? job.sources : (mix.chosenModel?.sources ?? []);
  // Not an estimate from the registry: this is the length the worker measured
  // when it decoded the file, against the rate the chosen model runs at.
  const left = mix.chosenModel && job.seconds !== null
    ? roughly(Math.max(0, (job.seconds / mix.chosenModel.realtime) * (1 - job.done)))
    : null;

  return (
    <div className="mf-page">
      <div className="mf-page-body mf-running">
        <p className="mf-eyebrow mf-pulse">separating</p>
        <h2 className="mf-page-title">{mix.song.title}</h2>
        <p className="mf-job-stage">{job.stage}</p>

        {/* Nothing has a percentage yet — the model is loading, or the engine is
            being installed. A bar sitting at zero reads as stuck, so it paces
            instead, and the stage line above is what is actually saying. */}
        <div className="mf-job-bar" data-waiting={job.done === 0 || undefined}>
          <div className="mf-job-fill" style={{ width: `${Math.round(job.done * 100)}%` }} />
        </div>

        <div className="mf-job-stems">
          {sources.map((id) => {
            const stem = stemOf(id);
            const done = job.perStem
              ? (job.perStem[id] ?? 0)
              : job.written.includes(id)
                ? 1
                : 0;
            return (
              <div key={id} className="mf-job-stem" style={{ '--job-ink': stem.ink } as never}>
                <span className="mf-job-name" style={{ color: stem.ink }}>
                  {stem.name}
                </span>
                <Meter value={done} orientation="horizontal" className="mf-job-meter" />
                <span className="mf-job-pct">
                  {job.perStem ? `${Math.round(done * 100)}%` : done === 1 ? 'written' : '—'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mf-page-actions">
          <Button onPress={mix.cancel} tone="danger">
            Cancel
          </Button>
          <span className="mf-estimate">
            {left ? `${left} left · ` : ''}
            Cancelling stops the child, it does not orphan it.
          </span>
        </div>
      </div>
    </div>
  );
}
