import { useEffect } from 'react';
import { Workspace, type Experiment } from '@openflow/widgets/debug/Workspace.tsx';
import { useRemembered } from '@openflow/widgets/debug/useRemembered.ts';
import type { Mix } from '../state.ts';
import { Analysis } from './Analysis.tsx';
import { WaveformLab } from './waveforms/WaveformLab.tsx';
import { RenderLab } from './render/RenderLab.tsx';
import { AlignmentLab } from './alignment/AlignmentLab.tsx';

/** Add a component and one entry here. Widgets never need to know about an experiment. */
const experiments: readonly Experiment<Mix>[] = [
  { id: 'alignment', title: 'Musical alignment', description: 'Choose required musical boundaries, preserve interior timing, and audition a shared-stem varispeed render.', component: ({ context }) => <AlignmentLab mix={context} /> },
  { id: 'beats', title: 'Beat analysis', description: 'Inspect, audition and correct the beat grid.', component: ({ context }) => <Analysis mix={context} /> },
  { id: 'waveforms', title: 'Waveform lab', description: 'Compare visual ideas against the same decoded audio. These views do not change the track.', component: ({ context }) => <WaveformLab mix={context} /> },
  { id: 'render', title: 'Waveform rendering', description: 'Browse vector waveform designs and combine geometry, color and energy treatments. The performance bench retains the original drawing comparison.', component: ({ context }) => <RenderLab mix={context} /> },
];
/** `tab` opens on that experiment; without it, on whichever was last open. */
export function DebugWorkspace({ mix, tab }: { mix: Mix; tab?: string }) {
  const [selected, select] = useRemembered('mix-debug-tab', 'beats');
  useEffect(() => {
    if (tab && experiments.some((e) => e.id === tab)) select(tab);
  }, [tab, select]);
  return <Workspace experiments={experiments} context={mix} selected={selected} onSelect={select} />;
}
