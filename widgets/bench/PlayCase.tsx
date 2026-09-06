import { useState, type CSSProperties } from 'react';
import type { Experiment } from '../src/debug/Workspace.tsx';
import { MixerView } from '../src/mixer/MixerView.tsx';
import { usePreviewMixer } from './usePreviewMixer.ts';
import { PlayThemePicker, PRESETS, color, deckColors, DEFAULT_VARIATION } from './PlayTheme.tsx';
import './play.css';

function PlayCase() {
  const mixer = usePreviewMixer();
  const [theme, setTheme] = useState(PRESETS[0].colors);
  const [variation, setVariation] = useState(DEFAULT_VARIATION);
  const inks = deckColors(theme, variation);
  const resolved = {
    primary: color(theme[0]), signal: color(theme[1]),
    stems: Object.fromEntries(['drums', 'bass', 'other', 'vocals'].map((id, i) => [id, color(theme[i + 2])])),
    decks: Object.fromEntries(mixer.state.decks.map((deck, i) => [deck.id, { ink: inks[i], waveform: `color-mix(in srgb, ${inks[i]} ${variation.strength}%, #9ca3ad)` }])),
  };
  return <div style={{ '--amber': resolved.primary } as CSSProperties}>
    <PlayThemePicker theme={theme} onChange={setTheme} variation={variation} onVariation={setVariation} />
    <MixerView {...mixer} theme={resolved} />
  </div>;
}
export const PLAY_TABS: readonly Experiment<null>[] = [{ id: 'four-decks', title: 'Four-deck mixer', description: '', component: PlayCase }];
