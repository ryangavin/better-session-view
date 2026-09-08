// @vitest-environment happy-dom
import { createElement } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ContextControls } from './ContextControls.tsx';
afterEach(cleanup);
it('keeps the primary FX action distinct from its context and restores keyboard focus on Escape',()=>{
  const onPress=vi.fn();const view=render(createElement(ContextControls,{label:'Effects group',face:'FX',pressed:true,onPress,children:'Tail settings'}));
  const trigger=view.getByRole('button',{name:'Effects group'});
  fireEvent.click(trigger);expect(onPress).toHaveBeenCalledOnce();expect(view.queryByRole('dialog')).toBeNull();
  fireEvent.click(trigger,{shiftKey:true});expect(view.getByRole('dialog',{name:'Effects group'})).toBeTruthy();expect(onPress).toHaveBeenCalledOnce();
  fireEvent.keyDown(window,{key:'Escape'});expect(view.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(trigger);
  fireEvent.contextMenu(trigger);expect(view.getByRole('dialog')).toBeTruthy();expect(onPress).toHaveBeenCalledOnce();
  fireEvent.pointerDown(document.body);expect(view.queryByRole('dialog')).toBeNull();
});
