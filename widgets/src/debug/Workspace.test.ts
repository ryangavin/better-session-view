// @vitest-environment happy-dom
import { createElement, useEffect } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workspace, type Experiment } from './Workspace.tsx';
afterEach(cleanup);

describe('experiment workspace', () => {
  it('unmounts inactive work and resets the selected experiment', () => {
    const start = vi.fn(), stop = vi.fn();
    function Content() { useEffect(() => { start(); return stop; }, []); return createElement('p', null, 'active'); }
    const experiments: Experiment<null>[] = [{ id: 'a', title: 'A', description: 'first', component: Content }, { id: 'b', title: 'B', description: 'second', component: () => null }];
    const props = { experiments, context: null, selected: 'a', onSelect: vi.fn() };
    const view = render(createElement(Workspace<null>, props));
    expect(start).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByText('Reset tab'));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(2);
    view.rerender(createElement(Workspace<null>, { ...props, selected: 'b' }));
    expect(stop).toHaveBeenCalledTimes(2);
  });
  it('recovers from a removed remembered tab and supports keyboard navigation', () => {
    const onSelect = vi.fn();
    const experiments: Experiment<null>[] = ['A', 'B'].map((title) => ({ id: title, title, description: '', component: () => null }));
    const view = render(createElement(Workspace<null>, { experiments, context: null, selected: 'missing', onSelect }));
    expect(view.getByRole('tab', { name: 'A' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(view.getByRole('tab', { name: 'A' }), { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith('B');
  });
});
