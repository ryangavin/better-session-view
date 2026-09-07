import type { Mix } from '../state.ts';
import type { Ready } from '../openflow.ts';
import { Idle } from './Idle.tsx';
import './TrackAnalysis.css';

/**
 * A track before it has stems: its details, a model, and Generate stems.
 * Nothing else can be drawn yet, so setup is the whole of the page. Once the
 * stems exist the track opens on the lanes, the grid is checked in a mode
 * over them, and these details come back as a dialog from the header.
 */
export function TrackAnalysis({ mix, ready }: { mix: Mix; ready: Ready | null }) {
  return <div className="mf-track-analysis">
    <header className="mf-analysis-heading">
      <div><p className="mf-eyebrow">New track</p><h2>{mix.song?.title}</h2><p>Separate the audio, then the beats and the sections are found for you.</p></div>
    </header>
    <div className="mf-analysis-content">
      <section className="mf-review-source">
        <p className="mf-eyebrow">Start with the stems</p>
        <h3>Separate the song to find its rhythm</h3>
        <p className="mf-review-hint">Track details save as you edit. Choose a model and generate stems to unlock the lanes, the beat grid and the sections.</p>
        <Idle mix={mix} ready={ready} embedded />
      </section>
    </div>
  </div>;
}
