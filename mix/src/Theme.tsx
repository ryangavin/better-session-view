import { createContext, useContext, useState, type ReactNode } from 'react';
import { ThemeRoot } from '@openflow/widgets/theme/ThemeRoot.tsx';
import { ThemeEditor } from '@openflow/widgets/theme/ThemeEditor.tsx';
import { DEFAULT_THEME, isTheme, type Theme } from '@openflow/widgets/theme/theme.ts';

const KEY = 'mix.theme.v1';
export function readTheme(): Theme {
  try { const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return isTheme(value) ? value : DEFAULT_THEME; }
  catch { return DEFAULT_THEME; }
}
const Settings = createContext<{theme: Theme; change(theme: Theme): void} | null>(null);
/** App preference ownership stays here; widgets only resolves and edits the document. */
export function MixTheme({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(readTheme);
  const change = (next: Theme) => {
    setTheme(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Still usable for this window. */ }
  };
  return <Settings.Provider value={{ theme, change }}><ThemeRoot theme={theme}>{children}</ThemeRoot></Settings.Provider>;
}
export function ThemeSettings() {
  const settings = useContext(Settings);
  if (!settings) return null;
  return <ThemeEditor theme={settings.theme} onChange={settings.change} />;
}
