// @vitest-environment happy-dom
import { createElement as h, Fragment } from 'react';
import { cleanup, render, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_THEME, editRole } from '@openflow/widgets/theme/theme.ts';
import { useTheme } from '@openflow/widgets/theme/ThemeRoot.tsx';
import { MixTheme, ThemeSettings, readTheme } from './Theme.tsx';
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('loads a complete palette including variation and safely rejects invalid storage', () => {
  const chosen = { ...editRole(DEFAULT_THEME, 'bass', 'h', 250), variation: { ...DEFAULT_THEME.variation, warmth: -12 } };
  localStorage.setItem('mix.theme.v1', JSON.stringify(chosen));
  expect(readTheme()).toEqual(chosen);
  localStorage.setItem('mix.theme.v1', '{');
  expect(readTheme()).toBe(DEFAULT_THEME);
  localStorage.setItem('mix.theme.v1', JSON.stringify({ version: 1, colors: {} }));
  expect(readTheme()).toBe(DEFAULT_THEME);
});
it('applies and persists an edited palette without remounting child UI state', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  function Sample() {
    const { colors } = useTheme();
    return h(Fragment, null, h('input', { 'aria-label': 'Track title', defaultValue: colors.bass }), h('output', { 'data-testid': 'ink' }, colors.bass));
  }
  localStorage.setItem('mix.theme.v1', JSON.stringify(editRole(DEFAULT_THEME, 'bass', 'h', 250)));
  const view = render(h(MixTheme, {children: h(Fragment, null, h(Sample), h(ThemeSettings))}));
  const title = view.getByRole('textbox') as HTMLInputElement;
  expect(title.value).toBe('hsl(250 56% 70%)');
  fireEvent.change(title, { target: { value: 'My track' } });
  fireEvent.click(view.getByRole('button', { name: 'Randomize' }));
  expect(view.getByTestId('ink').textContent).not.toBe('hsl(250 56% 70%)');
  expect(readTheme().colors.bass.h).not.toBe(250);
  expect(title.isConnected).toBe(true);
  expect(title.value).toBe('My track');
});
