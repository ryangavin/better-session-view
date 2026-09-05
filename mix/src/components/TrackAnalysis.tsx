import { AnalysisHeading, TrackReview } from './TrackReview.tsx';
import type { Mix } from '../state.ts';
import type { Ready } from '../openflow.ts';
import { Idle } from './Idle.tsx';
import './TrackAnalysis.css';

/** One analysis page, including source details and separation on first import. */
export function TrackAnalysis({ mix, ready }: { mix: Mix; ready: Ready | null }) {
  const hasStems = Boolean(mix.song?.sources.length);
  const details = <section className="mf-review-source">
    <p className="mf-eyebrow">{hasStems ? '03 / STEMS & TRACK DETAILS' : 'START WITH THE STEMS'}</p>
    <h3>{hasStems ? 'Track details and separation' : 'Separate the song to find its rhythm'}</h3>
    <p className="mf-review-hint">Track details save as you edit. {hasStems ? 'Your current stems stay in place until you press Separate again.' : 'Choose a model and generate stems to unlock the waveform, beat grid and section review.'}</p>
    <Idle mix={mix} ready={ready} embedded />
  </section>;
  return <div className="mf-track-analysis">
    {hasStems && !mix.decoding && mix.playable ? <TrackReview mix={mix} details={details} /> : <>
      <AnalysisHeading mix={mix} />
      <div className="mf-analysis-content">{hasStems && <p className="mf-analysis-empty" role="status">{mix.audioProblem || 'Reading stems…'}</p>}{details}</div>
    </>}
  </div>;
}
