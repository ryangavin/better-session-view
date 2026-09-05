// @vitest-environment happy-dom
import { createElement, useRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popup, type Dismissal } from './Popup.tsx';
afterEach(cleanup);

/** A trigger with a panel hanging off it — the only shape `Popup` is used in. */
function Harness({ onDismiss }: { onDismiss(how: Dismissal): void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  return createElement(
    'div',
    null,
    createElement('button', { ref: anchor, type: 'button' }, 'open'),
    createElement(
      Popup,
      { anchor, onDismiss, role: 'listbox', label: 'Modes', id: 'menu' },
      createElement('div', { role: 'option' }, 'neon'),
    ),
  );
}

const open = (onDismiss: (how: Dismissal) => void = () => {}) =>
  render(createElement(Harness, { onDismiss }));

const panel = (view: ReturnType<typeof render>) =>
  view.container.querySelector('.wdg-popup') as HTMLElement;

describe('the panel', () => {
  it('asks for the top layer, and for none of its dismissal', () => {
    // `auto` would close on the pointerdown heading for the trigger, and the
    // click behind it would open it again.
    const view = open();
    expect(panel(view).getAttribute('popover')).toBe('manual');
  });

  it('carries the name and the role the caller gave it', () => {
    const view = open();
    const box = panel(view);
    expect(box.getAttribute('role')).toBe('listbox');
    expect(box.getAttribute('aria-label')).toBe('Modes');
    expect(box.id).toBe('menu');
    expect(box.querySelector('[role="option"]')?.textContent).toBe('neon');
  });
});

describe('dismissal', () => {
  const down = (on: Element | Document) =>
    on.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
  const wheel = (on: EventTarget) =>
    on.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, cancelable: true }));
  const escape = (on: EventTarget) =>
    on.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  it('says which of the three it was, because only one has focus to put back', () => {
    const onDismiss = vi.fn();
    open(onDismiss);
    down(document.body);
    wheel(window);
    escape(window);
    expect(onDismiss.mock.calls.flat()).toEqual(['pointer', 'wheel', 'escape']);
  });

  it('stays open for a pointer on itself or on the trigger it hangs from', () => {
    // The trigger is the case that matters: it is a toggle, and closing here
    // would let the click behind it open the panel straight back up.
    const onDismiss = vi.fn();
    const view = open(onDismiss);
    down(panel(view).querySelector('[role="option"]') as Element);
    down(view.container.querySelector('button') as Element);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('keeps a wheel over itself off the canvas underneath', () => {
    // A graph zooms on a wheel through a native listener, which no React
    // handler on the panel can stop.
    const heard = vi.fn();
    const view = open();
    window.addEventListener('wheel', heard);
    wheel(panel(view));
    window.removeEventListener('wheel', heard);
    expect(heard).not.toHaveBeenCalled();
  });

  it('keeps escape off the host that is listening for it', () => {
    // A modal closing on the same escape that shut the menu inside it is the
    // failure this prevents.
    const heard = vi.fn();
    open();
    document.addEventListener('keydown', heard);
    escape(window);
    document.removeEventListener('keydown', heard);
    expect(heard).not.toHaveBeenCalled();
  });

  it('lets the window alone once it has gone', () => {
    const onDismiss = vi.fn();
    open(onDismiss).unmount();
    down(document.body);
    escape(window);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
