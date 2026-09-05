import { useState } from 'react';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { Analysis } from '../debug/Analysis.tsx';
import type { Mix } from '../state.ts';
import type { Ready } from '../openflow.ts';
import { Idle } from './Idle.tsx';
import './TrackAnalysis.css';

/** The track's analysis home, on first import and whenever Analyze is opened again. */
export function TrackAnalysis({ mix, ready }: { mix: Mix; ready: Ready | null }) {
  const hasStems = Boolean(mix.song?.sources.length);
  const [view, setView] = useState(hasStems ? 0 : 1);
  return <div className="mf-track-analysis">
    <div className="mf-analysis-heading">
      <div><p className="mf-eyebrow">Track analysis</p><h2>{mix.song?.title}</h2>
        <p>{hasStems ? 'Review the rhythm, refine the grid, or revisit the stems.' : 'Start by separating the audio. Then review its rhythm and beat grid.'}</p></div>
      {hasStems && <Button onPress={mix.keepStems}>Back to mix</Button>}
    </div>
    <div className="mf-analysis-nav">
      <Segmented items={['Beat grid', 'Stems & details']} index={view} onChange={setView} label="Analysis view" />
      {view === 0 && hasStems && <>
        <Button onPress={() => { mix.keepStems(); mix.startManual(); }} title="Count two downbeats in the mixer timeline to set the grid">Set grid by hand…</Button>
        <Button onPress={mix.keepStems} title="Zoom into the mixer timeline and drag individual beat markers">Edit beat markers…</Button>
      </>}
    </div>
    {view === 1 ? <Idle mix={mix} ready={ready} embedded /> : !hasStems ?
      <div className="mf-analysis-empty"><h3>Separate stems to hear the rhythm clearly</h3><p>The beat analysis works from the drums or the recombined stems.</p><Button onPress={() => setView(1)}>Choose a separation model</Button></div> :
      mix.decoding || !mix.playable ? <p className="mf-analysis-empty" role="status">{mix.audioProblem || 'Reading stems…'}</p> : <Analysis mix={mix} editing />}
  </div>;
}
