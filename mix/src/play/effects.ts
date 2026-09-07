import type { MixerState } from '@openflow/widgets/mixer/model.ts';
import type { Param } from '@openflow/widgets/param/param.ts';

// Shared UI ranges; MixerEffect maps these parameters to the wet return graph.
const percent = (defaultValue: number): Param => ({ kind: 'float', min: 0, max: 100, defaultValue, unit: 'percent' });
const tone = { id: 'tone', name: 'Tone', param: percent(50) };
export const EFFECTS: MixerState['effects'] = [
  { id: 'delay', name: 'Delay', controls: [{ id: 'feedback', name: 'Feedback', param: percent(35) }, tone] },
  { id: 'reverb', name: 'Reverb', controls: [{ id: 'decay', name: 'Decay', param: { kind: 'float', min: 0.1, max: 12, defaultValue: 2.5, unit: 'custom', customUnit: '%0.1f s' } }, tone] },
  { id: 'echo', name: 'Echo', controls: [{ id: 'feedback', name: 'Feedback', param: percent(45) }, tone] },
  { id: 'chorus', name: 'Chorus', controls: [{ id: 'rate', name: 'Rate', param: { kind: 'float', min: 0.1, max: 10, defaultValue: 1, unit: 'hertz' } }, { id: 'depth', name: 'Depth', param: percent(40) }] },
  { id: 'flanger', name: 'Flanger', controls: [{ id: 'rate', name: 'Rate', param: { kind: 'float', min: 0.1, max: 10, defaultValue: 0.5, unit: 'hertz' } }, { id: 'feedback', name: 'Feedback', param: percent(40) }] },
];
