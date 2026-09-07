// @vitest-environment happy-dom
import { createElement as h, Fragment } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ThemeRoot, useTheme } from './ThemeRoot.tsx';
import { DEFAULT_THEME, editRole } from './theme.ts';

afterEach(cleanup);
function Sample({ id }: {id: string}) { const theme = useTheme(); return h('output', { 'data-testid': id }, theme.colors.drums); }
it('isolates nested and sibling themes without changing body or document tokens', () => {
  const before = document.body.getAttribute('style');
  const nested = editRole(DEFAULT_THEME, 'drums', 'h', 310);
  const view = render(h(Fragment, null,
    h(ThemeRoot, { theme: DEFAULT_THEME, id: 'outer' }, h(Sample, {id: 'outside'}),
      h(ThemeRoot, { theme: nested, id: 'inner' }, h(Sample, {id: 'inside'}))),
    h(ThemeRoot, { theme: DEFAULT_THEME }, h(Sample, {id: 'sibling'}))));
  expect(view.getByTestId('inside').textContent).toBe('hsl(310 59% 61%)');
  expect(view.getByTestId('outside').textContent).toBe(view.getByTestId('sibling').textContent);
  expect(view.container.querySelector<HTMLElement>('#inner')!.style.getPropertyValue('--stem-drums')).toBe('hsl(310 59% 61%)');
  expect(view.container.querySelector<HTMLElement>('#outer')!.style.getPropertyValue('--stem-drums')).toBe('hsl(195 59% 61%)');
  expect(document.body.getAttribute('style')).toBe(before);
  view.unmount();
  expect(document.body.getAttribute('style')).toBe(before);
});
it('updates resolved consumers without remounting their DOM', () => {
  const view = render(h(ThemeRoot, {theme: DEFAULT_THEME}, h(Sample, {id: 'sample'})));
  const sample = view.getByTestId('sample');
  view.rerender(h(ThemeRoot, {theme: editRole(DEFAULT_THEME, 'drums', 'h', 80)}, h(Sample, {id: 'sample'})));
  expect(view.getByTestId('sample')).toBe(sample);
  expect(sample.textContent).toBe('hsl(80 59% 61%)');
});
