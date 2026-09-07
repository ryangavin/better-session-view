import { useState } from 'react';
import type { Experiment } from '../src/debug/Workspace.tsx';
import { MixerView } from '../src/mixer/MixerView.tsx';
import { Toggle } from '../src/controls/Toggle.tsx';
import { ThemeRoot, useTheme } from '../src/theme/ThemeRoot.tsx';
import { ThemeEditor } from '../src/theme/ThemeEditor.tsx';
import { DEFAULT_THEME } from '../src/theme/theme.ts';
import { usePreviewMixer } from './usePreviewMixer.ts';
import './play.css';

function Preview() {
  const mixer = usePreviewMixer();
  const { colors, deckPairs } = useTheme();
  const theme = {
    primary: colors.primary, signal: colors.signal,
    stems: colors,
    decks: Object.fromEntries(mixer.state.decks.map((deck, i) => [deck.id, deckPairs[i]])),
  };
  return <MixerView {...mixer} theme={theme} />;
}
function PlayCase() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [open, setOpen] = useState(false);
  return <ThemeRoot theme={theme}>
    <div className="play-theme-tools">
      <Toggle label="Show theme editor" on={open} onChange={setOpen} width={66}>Theme</Toggle>
      {open && <div className="play-theme-panel"><ThemeEditor theme={theme} onChange={setTheme} /></div>}
    </div>
    <Preview />
  </ThemeRoot>;
}
export const PLAY_TABS: readonly Experiment<null>[] = [{ id: 'four-decks', title: 'Four-deck mixer', description: '', component: PlayCase }];
