// @vitest-environment happy-dom
import { createElement, useEffect } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rooms, type Room } from './Rooms.tsx';
import type { Experiment } from './Workspace.tsx';
afterEach(cleanup);

const tab = (id: string, component: Experiment<null>['component'] = () => null): Experiment<null> => ({
  id, title: id.toUpperCase(), description: `${id} description`, component,
});

const rooms: Room<null>[] = [
  { id: 'controls', title: 'Controls', note: 'knobs and the rest', experiments: [tab('knob'), tab('slider')] },
  { id: 'debug', title: 'Debug', experiments: [tab('scope')] },
];

const props = { rooms, context: null, room: 'controls', tab: 'knob', onRoom: vi.fn(), onTab: vi.fn() };

describe('rooms of workspaces', () => {
  it('shows the chosen room’s tabs and nobody else’s', () => {
    const view = render(createElement(Rooms<null>, props));
    expect(view.getByRole('tab', { name: 'KNOB' })).toBeTruthy();
    expect(view.queryByRole('tab', { name: 'SCOPE' })).toBeNull();
  });

  it('counts what is inside each room, so the side says what it holds', () => {
    const view = render(createElement(Rooms<null>, props));
    expect(view.getByRole('tab', { name: /Controls/ }).textContent).toContain('2');
    expect(view.getByRole('tab', { name: /Debug/ }).textContent).toContain('1');
  });

  it('opens a room rather than emptying it when the remembered tab is elsewhere', () => {
    // Rooms get regrouped while the thing being debugged is the actual work, so
    // a tab id that has moved rooms must not leave the panel blank.
    const view = render(createElement(Rooms<null>, { ...props, room: 'debug', tab: 'knob' }));
    expect(view.getByRole('tab', { name: 'SCOPE' }).getAttribute('aria-selected')).toBe('true');
  });

  it('moves through the rooms with the up and down keys', () => {
    const onRoom = vi.fn();
    const view = render(createElement(Rooms<null>, { ...props, onRoom }));
    fireEvent.keyDown(view.getByRole('tablist', { name: 'Debug rooms' }), { key: 'ArrowDown' });
    expect(onRoom).toHaveBeenCalledWith('debug');
    fireEvent.keyDown(view.getByRole('tablist', { name: 'Debug rooms' }), { key: 'End' });
    expect(onRoom).toHaveBeenCalledWith('debug');
  });

  it('mounts only the room being looked at', () => {
    const start = vi.fn();
    function Watched() { useEffect(() => { start(); }, []); return null; }
    const watched: Room<null>[] = [
      { id: 'a', title: 'A', experiments: [tab('one')] },
      { id: 'b', title: 'B', experiments: [tab('two', Watched)] },
    ];
    const view = render(createElement(Rooms<null>, { ...props, rooms: watched, room: 'a', tab: 'one' }));
    expect(start).not.toHaveBeenCalled();
    view.rerender(createElement(Rooms<null>, { ...props, rooms: watched, room: 'b', tab: 'two' }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('says so rather than breaking when there are no rooms', () => {
    const view = render(createElement(Rooms<null>, { ...props, rooms: [] }));
    expect(view.getByText(/No rooms/)).toBeTruthy();
  });
});
