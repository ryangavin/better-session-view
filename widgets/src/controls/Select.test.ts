// @vitest-environment happy-dom
import { createElement } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Select } from './Select.tsx';
afterEach(cleanup);

const MODES = ['neon', 'soft', 'band'];

const select = (props: Partial<Parameters<typeof Select>[0]> = {}) =>
  render(
    createElement(Select, {
      items: MODES,
      index: 0,
      onChange: () => {},
      label: 'Mode',
      ...props,
    }),
  );

const options = (view: ReturnType<typeof render>) =>
  Array.from(view.container.querySelectorAll('[role="option"]')).map((el) => el.textContent);

describe('the closed field', () => {
  it('shows the member it holds, and says a menu is behind it', () => {
    const view = select({ index: 1 });
    const button = view.getByRole('combobox', { name: 'Mode' });
    expect(button.textContent).toBe('soft');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(options(view)).toEqual([]);
  });

  it('keeps the field metrics the suite sizes panels against', () => {
    const view = select();
    const box = view.container.querySelector('.wdg-select') as HTMLElement;
    expect(box.style.getPropertyValue('--wdg-select-chars')).toBe('4');
    expect(view.container.querySelector('.wdg-select-body')).toBeTruthy();
  });
});

describe('the menu', () => {
  it('opens with every member on it and marks the one that is held', () => {
    const view = select({ index: 2 });
    fireEvent.click(view.getByRole('combobox', { name: 'Mode' }));
    expect(options(view)).toEqual(MODES);
    const chosen = view.container.querySelectorAll('[data-chosen]');
    expect(chosen.length).toBe(1);
    expect(chosen[0]?.textContent).toBe('band');
  });

  it('reports the member that was picked, by index', () => {
    const onChange = vi.fn();
    const view = select({ onChange });
    fireEvent.click(view.getByRole('combobox', { name: 'Mode' }));
    fireEvent.click(view.container.querySelectorAll('[role="option"]')[2] as Element);
    expect(onChange).toHaveBeenCalledWith(2);
    expect(view.getByRole('combobox', { name: 'Mode' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('says nothing when the member picked is the one already held', () => {
    // The native element's bargain: a host hears about a change, not a press.
    const onChange = vi.fn();
    const view = select({ index: 1, onChange });
    fireEvent.click(view.getByRole('combobox', { name: 'Mode' }));
    fireEvent.click(view.container.querySelectorAll('[role="option"]')[1] as Element);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves the node under it alone when an option is pressed', () => {
    // A `role="option"` is not one of the interactive elements a canvas steps
    // aside for, so the menu has to say so itself or the node drags.
    const onChange = vi.fn();
    const view = select({ onChange });
    fireEvent.click(view.getByRole('combobox', { name: 'Mode' }));
    const option = view.container.querySelectorAll('[role="option"]')[1] as Element;
    const down = new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    option.dispatchEvent(down);
    expect(down.cancelBubble).toBe(true);
    expect(down.defaultPrevented).toBe(true);
  });

  it('does not open when it is disabled', () => {
    const view = select({ disabled: true });
    fireEvent.click(view.getByRole('combobox', { name: 'Mode' }));
    expect(options(view)).toEqual([]);
  });
});

describe('the keyboard', () => {
  it('picks straight away while closed, and highlights while open', () => {
    const onChange = vi.fn();
    const view = select({ onChange });
    const button = view.getByRole('combobox', { name: 'Mode' });
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(1);
    expect(options(view)).toEqual([]);

    fireEvent.keyDown(button, { key: 'Enter' });
    expect(options(view)).toEqual(MODES);
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(view.container.querySelector('[data-active]')?.textContent).toBe('soft');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('takes the highlighted member on enter, and abandons it on escape', () => {
    const onChange = vi.fn();
    const view = select({ onChange });
    const button = view.getByRole('combobox', { name: 'Mode' });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: 'End' });
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(options(view)).toEqual([]);

    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: 'End' });
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('jumps to a member by its first letters', () => {
    const onChange = vi.fn();
    const view = select({ onChange });
    fireEvent.keyDown(view.getByRole('combobox', { name: 'Mode' }), { key: 'b' });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('walks the members that share a letter when the letter is repeated', () => {
    // Fired as fast as a test can, which is faster than the typing window and
    // is the case that used to break: the second press searched for `ss`,
    // matched nothing, and the walk stopped on its first step.
    const view = select({ items: ['swirl', 'fold', 'slice', 'shear'], onChange: () => {} });
    const button = view.getByRole('combobox', { name: 'Mode' });
    fireEvent.keyDown(button, { key: 'Enter' });
    const walked: (string | null)[] = [];
    for (let press = 0; press < 4; press++) {
      fireEvent.keyDown(button, { key: 's' });
      walked.push(view.container.querySelector('[data-active]')?.textContent ?? null);
    }
    expect(walked).toEqual(['slice', 'shear', 'swirl', 'slice']);
  });

  it('reads a word as a word, however fast it was typed', () => {
    const onChange = vi.fn();
    const view = select({ items: ['pale', 'pixelate', 'plain'], onChange });
    const button = view.getByRole('combobox', { name: 'Mode' });
    fireEvent.keyDown(button, { key: 'p' });
    fireEvent.keyDown(button, { key: 'i' });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('keeps the keystrokes it handled away from the surface underneath', () => {
    // A graph moves its nodes on the arrows, listening above this. A focused
    // control owns its keystroke in any host, not only in one that asks.
    const heard: string[] = [];
    const view = select({ onChange: () => {} });
    const button = view.getByRole('combobox', { name: 'Mode' });
    const listen = (e: Event) => heard.push((e as globalThis.KeyboardEvent).key);
    document.addEventListener('keydown', listen);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'Home' });
    fireEvent.keyDown(button, { key: 'Escape' });
    document.removeEventListener('keydown', listen);
    expect(heard).toEqual([]);
  });

  it('lets a key it did not handle go on to the host', () => {
    // Escape on a shut menu is the case that matters: a select inside a modal
    // must not be the reason the modal stops closing.
    const heard: string[] = [];
    const view = select({ onChange: () => {} });
    const listen = (e: Event) => heard.push((e as globalThis.KeyboardEvent).key);
    document.addEventListener('keydown', listen);
    fireEvent.keyDown(view.getByRole('combobox', { name: 'Mode' }), { key: 'Escape' });
    document.removeEventListener('keydown', listen);
    expect(heard).toEqual(['Escape']);
  });
});
