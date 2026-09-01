import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Meter } from '@openflow/widgets/controls/Meter.tsx';
import { modelOf, stemOf } from '../mock.ts';
import type { Mix } from '../state.ts';
import './Running.css';

/**
 * A separation in flight.
 *
 * Per-source progress rather than one bar, because the sources do not finish
 * together and a single bar at 40% tells you nothing about whether the vocal
 * is done. Demucs writes a progress bar to stderr rather than a number, so
 * what feeds this is a parser — see `mix/docs/demucs.md`.
 */
export function Running({ mix }: { mix: Mix }) {
  const job = mix.job;
  if (!job || !mix.song) return null;
  const sources = modelOf(mix.model).sources;

  return (
    <div className="mf-page">
      <div className="mf-page-body mf-running">
        <p className="mf-eyebrow mf-pulse">separating</p>
        <h2 className="mf-page-title">{mix.song.title}</h2>
        <p className="mf-job-stage">{job.stage}</p>

        <div className="mf-job-bar">
          <div className="mf-job-fill" style={{ width: `${Math.round(job.done * 100)}%` }} />
        </div>

        <div className="mf-job-stems">
          {sources.map((id) => {
            const stem = stemOf(id);
            const done = job.perStem[id] ?? 0;
            return (
              <div key={id} className="mf-job-stem" style={{ '--job-ink': stem.ink } as never}>
                <span className="mf-job-name" style={{ color: stem.ink }}>
                  {stem.name}
                </span>
                <Meter value={done} orientation="horizontal" className="mf-job-meter" />
                <span className="mf-job-pct">{Math.round(done * 100)}%</span>
              </div>
            );
          })}
        </div>

        <div className="mf-page-actions">
          <Button onPress={mix.cancel} tone="danger">
            Cancel
          </Button>
          <span className="mf-estimate">
            A job is minutes of the GPU. Cancelling stops the child, it does not orphan it.
          </span>
        </div>
      </div>
    </div>
  );
}
