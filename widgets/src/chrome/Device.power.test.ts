// @vitest-environment happy-dom
import { createElement } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Device } from './Device.tsx';
afterEach(cleanup);

// The dot was a button whether or not anything was behind it, with a click that
// called an optional handler that was usually not there. On a canvas of small
// nodes that is an affordance offering a press it will not answer.

describe('the power dot', () => {
  it('is a control when there is something to control', () => {
    const onToggle = vi.fn();
    const view = render(createElement(Device, { name: 'Gate', on: true, onToggle }));
    const dot = view.getByRole('button', { name: 'Gate active' });
    expect(dot.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(dot);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('offers no press when nothing would answer it', () => {
    const view = render(createElement(Device, { name: 'Gate', on: true }));
    expect(view.queryByRole('button', { name: 'Gate active' })).toBeNull();
  });

  it('still says which way it is, so a node reads the same either way', () => {
    // The anatomy has to survive: a dot that vanishes on the nodes that cannot
    // be turned off would make every face a different shape.
    const off = render(createElement(Device, { name: 'Gate', on: false }));
    expect(off.container.querySelector('.wdg-device-power')).toBeTruthy();
    expect(off.container.querySelector('.wdg-device-power')?.hasAttribute('data-on')).toBe(false);
    cleanup();
    const on = render(createElement(Device, { name: 'Gate', on: true }));
    expect(on.container.querySelector('.wdg-device-power')?.hasAttribute('data-on')).toBe(true);
  });
});
