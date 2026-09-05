// @vitest-environment happy-dom
import { createElement, type ReactElement } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Param } from '../param/param.ts';
import { useParamGesture, type ParamGestureOptions } from './useParamGesture.ts';
afterEach(cleanup);

/**
 * The drag, driven by a pointer.
 *
 * This module went a long time with none of this, on the reasoning that a
 * gesture needs a hand and so the bench is where it is checked. That holds for
 * how a drag *feels* — the reach, the taper, whether the fine modifier is worth
 * the finger — and none of it is what broke. What broke were the edges: a
 * capture that never came back, a reset nobody asked for, a pointer measured in
 * one unit against a distance written in another. Those have exact answers, and
 * a pointer is something a test can hold.
 */

const VALUE: Param = { kind: 'float', min: 0, max: 1, defaultValue: 0.5, unit: 'float' };

function Surface(options: ParamGestureOptions): ReactElement {
  const gesture = useParamGesture(options);
  return createElement('div', { ...gesture.props, 'data-testid': 'surface' });
}

const surface = (options: Partial<ParamGestureOptions> & { onChange: (n: number) => void }) => {
  const view = render(
    createElement(Surface, { param: VALUE, value: 0.5, travel: 100, ...options }),
  );
  return view.getByTestId('surface');
};

/**
 * A drawn size and a laid-out size that differ, which is what an ancestor
 * `scale()` produces and what happy-dom will never do on its own.
 */
function drawnAt(el: HTMLElement, scale: number, css = 100) {
  Object.defineProperty(el, 'offsetWidth', { value: css, configurable: true });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: css * scale, height: css * scale, top: 0, left: 0,
       right: css * scale, bottom: css * scale, toJSON: () => ({}) }) as DOMRect;
}

const down = (el: HTMLElement, x = 0, y = 0) =>
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: x, clientY: y });
const move = (el: HTMLElement, x: number, y: number) =>
  fireEvent.pointerMove(el, { pointerId: 1, clientX: x, clientY: y });
const up = (el: HTMLElement, x = 0, y = 0) =>
  fireEvent.pointerUp(el, { pointerId: 1, clientX: x, clientY: y });

/** Writes are held to one a frame, so mid-gesture there is a frame to wait for. */
const frame = () => new Promise<void>((settled) => requestAnimationFrame(() => settled()));

beforeEach(() => {
  // happy-dom has no pointer capture, and the gesture is built on it.
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

describe('a drag under a transform', () => {
  it('covers the same ground per drawn pixel however the canvas is zoomed', () => {
    // `travel` is the element's own pixels; a pointer reports the screen's.
    // Half the size on screen is half the screen distance for the same reach.
    const onChange = vi.fn();
    const el = surface({ onChange, axis: 'vertical' });
    drawnAt(el, 0.5);
    down(el, 0, 100);
    move(el, 0, 75);
    up(el);
    // 25 screen pixels is 50 of the element's own, which is half of a 100 reach.
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('keeps a pointer-anchored handle under the pointer at any zoom', async () => {
    // The property the whole plane gesture is built on: press, then drag, and
    // the handle is where the finger is. It was true at zoom 1 and nowhere else.
    const onChange = vi.fn();
    const el = surface({ onChange, axis: 'horizontal', anchor: 'pointer', travel: 100 });
    // 100 of the element's own pixels, drawn 200 wide.
    drawnAt(el, 2);
    down(el, 50, 0);
    await frame();
    // A quarter of the way across the drawn box is a quarter of the range.
    expect(onChange).toHaveBeenLastCalledWith(0.25);
    move(el, 100, 0);
    up(el, 100, 0);
    // And a quarter further along is a quarter more, which is the handle
    // staying with the pointer rather than falling behind it by the zoom.
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it('is unchanged where nothing is transformed', () => {
    const onChange = vi.fn();
    const el = surface({ onChange, axis: 'vertical' });
    drawnAt(el, 1);
    down(el, 0, 100);
    move(el, 0, 50);
    up(el);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });
});

describe('a gesture that ends badly', () => {
  it('lets go when the capture is lost without a pointerup', () => {
    const onChange = vi.fn();
    const el = surface({ onChange });
    down(el, 0, 100);
    move(el, 0, 90);
    fireEvent.lostPointerCapture(el, { pointerId: 1 });
    onChange.mockClear();
    // Nothing is in hand, so a pointer crossing the control moves nothing.
    move(el, 0, 20);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts the value back when the drag is abandoned', async () => {
    const onChange = vi.fn();
    const el = surface({ onChange, value: 0.5 });
    down(el, 0, 100);
    move(el, 0, 60);
    await frame();
    expect(onChange).toHaveBeenLastCalledWith(0.9);
    fireEvent.keyDown(el, { key: 'Escape' });
    expect(onChange).toHaveBeenLastCalledWith(0.5);
    onChange.mockClear();
    move(el, 0, 20);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves escape alone when there is no drag to abandon', () => {
    // The host may be a modal that closes on it.
    const onChange = vi.fn();
    const heard: string[] = [];
    const el = surface({ onChange });
    const listen = (e: Event) => heard.push((e as globalThis.KeyboardEvent).key);
    document.addEventListener('keydown', listen);
    fireEvent.keyDown(el, { key: 'Escape' });
    document.removeEventListener('keydown', listen);
    expect(heard).toEqual(['Escape']);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('restores the range as well, when shift was what moved', () => {
    const onChange = vi.fn();
    const onDepth = vi.fn();
    const el = surface({ onChange, onDepth, depth: 0.4 });
    down(el, 0, 100);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 0, clientY: 60, shiftKey: true });
    expect(onDepth).toHaveBeenLastCalledWith(expect.any(Number));
    fireEvent.keyDown(el, { key: 'Escape' });
    expect(onDepth).toHaveBeenLastCalledWith(0.4);
  });
});

describe('the double-click that resets', () => {
  it('takes the parameter to its default when the pointer stayed put', () => {
    const onChange = vi.fn();
    const el = surface({ onChange, value: 0.9 });
    down(el, 10, 10);
    up(el, 10, 10);
    fireEvent.doubleClick(el);
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it('keeps two quick drags rather than throwing both away', () => {
    // Two drags inside the platform's double-click time are reported as one
    // dblclick, and resetting on that loses work that was meant.
    const onChange = vi.fn();
    const el = surface({ onChange, value: 0.9 });
    down(el, 0, 100);
    move(el, 0, 80);
    up(el, 0, 80);
    onChange.mockClear();
    fireEvent.doubleClick(el);
    expect(onChange).not.toHaveBeenCalled();
  });
});
