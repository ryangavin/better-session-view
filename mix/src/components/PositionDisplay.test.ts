// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { render,fireEvent,cleanup } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { PositionDisplay } from './PositionDisplay.tsx';
afterEach(()=>{cleanup();localStorage.removeItem('mixflow.header-position.v1');vi.restoreAllMocks();});
it('defaults to the existing beat format, toggles to elapsed time and keeps updating its data',()=>{
  const view=render(h(PositionDisplay,{bar:2.3125,bars:32,seconds:187.9}));
  const button=view.getByRole('button',{name:'Beat position 3.2.2. Show elapsed time'});
  expect(button.textContent).toBe('3.2.2');
  fireEvent.click(button);
  expect(button.textContent).toBe('3:07');
  expect(button.getAttribute('aria-label')).toBe('Elapsed time 3:07. Show beat position');
  view.rerender(h(PositionDisplay,{bar:3,bars:32,seconds:188.2}));
  expect(button.textContent).toBe('3:08');
  view.unmount();
  const restored=render(h(PositionDisplay,{bar:3,bars:32,seconds:189}));
  expect(restored.getByRole('button').textContent).toBe('3:09');
  fireEvent.click(restored.getByRole('button'));
  expect(restored.getByRole('button').textContent).toBe('4.1.1');
});
it('recovers invalid or unavailable preference storage',()=>{
  localStorage.setItem('mixflow.header-position.v1','invalid');
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('unavailable');});
  const view=render(h(PositionDisplay,{bar:0,bars:1,seconds:-5}));
  expect(view.getByRole('button').textContent).toBe('1.1.1');
  fireEvent.click(view.getByRole('button'));
  expect(view.getByRole('button').textContent).toBe('0:00');
});
