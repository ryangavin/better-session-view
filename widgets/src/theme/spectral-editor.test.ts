// @vitest-environment happy-dom
import { createElement as h, useState } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemeEditor } from './ThemeEditor.tsx';
import { DEFAULT_THEME, type Theme } from './theme.ts';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('edits and rolls a spectral band without changing stem identities',()=>{
  vi.spyOn(Math,'random').mockReturnValue(.5);
  let current:Theme=DEFAULT_THEME;
  function Editor(){const [theme,set]=useState(DEFAULT_THEME);return h(ThemeEditor,{theme,onChange:next=>{current=next;set(next);}});}
  const view=render(h(Editor));
  fireEvent.click(view.getByRole('button',{name:'Edit Low frequencies color'}));
  fireEvent.click(view.getByRole('button',{name:'Randomize Low frequencies hue'}));
  expect(current.spectral?.colors.low.h).toBe(180);
  expect(current.colors).toBe(DEFAULT_THEME.colors);
  expect(current.spectral?.colors.mid).toBe(DEFAULT_THEME.spectral?.colors.mid);
});
