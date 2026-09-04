import { useId, type ReactNode } from 'react';
import { Workspace, type Experiment } from './Workspace.tsx';
import './debug.css';

/**
 * A list of workspaces, for when one list of tabs has stopped being a list.
 *
 * `Workspace` answers "which experiment am I looking at". It answers it well up
 * to a dozen or so, and then the row of tabs becomes the thing you have to read
 * before you can read anything else — the widget bench reached eighteen, and
 * debugging alone will have that many again on its own.
 *
 * So this is the other axis, and only the other axis: rooms down the side, the
 * chosen room's tabs across the top, and nothing else new to learn. A room owns
 * no layout and no state; it is a title and a set of experiments, which is what
 * makes grouping a matter of moving a line rather than moving a component.
 *
 * Both selections are the caller's, because a harness that remembers where you
 * were is a harness that has decided where that memory lives. `useRemembered`
 * is one line away for anybody who wants it, and a test wants neither.
 *
 * A tab id from another room is not an error. Rooms are regrouped often while
 * the thing being debugged is what is actually being worked on, and a
 * remembered tab that no longer exists should open the room rather than empty
 * it — `Workspace` already falls back to its first experiment, so this leaves
 * that alone.
 */

export interface Room<Context> {
  id: string;
  title: string;
  /** Shown under the title, for a room whose name is not the whole story. */
  note?: string;
  experiments: readonly Experiment<Context>[];
}

export interface RoomsProps<Context> {
  rooms: readonly Room<Context>[];
  context: Context;
  /** The room showing, and the tab within it. */
  room: string;
  tab: string;
  onRoom(id: string): void;
  onTab(id: string): void;
  /** Anything to sit above the rooms — a title, a subject, a global control. */
  aside?: ReactNode;
}

export function Rooms<Context>({
  rooms,
  context,
  room,
  tab,
  onRoom,
  onTab,
  aside,
}: RoomsProps<Context>) {
  const prefix = useId();
  const active = rooms.find((one) => one.id === room) ?? rooms[0];
  if (!active) return <p>No rooms registered.</p>;

  return (
    <div className="wdg wdg-rooms">
      <div className="wdg-rooms-side">
        {aside}
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Debug rooms"
          onKeyDown={(event) => {
            const index = rooms.indexOf(active);
            const next =
              event.key === 'ArrowDown'
                ? (index + 1) % rooms.length
                : event.key === 'ArrowUp'
                  ? (index + rooms.length - 1) % rooms.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? rooms.length - 1
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            onRoom(rooms[next].id);
            document.getElementById(`${prefix}-room-${rooms[next].id}`)?.focus();
          }}
        >
          {rooms.map((one) => (
            <button
              key={one.id}
              type="button"
              role="tab"
              id={`${prefix}-room-${one.id}`}
              aria-controls={`${prefix}-room-panel`}
              aria-selected={one === active}
              tabIndex={one === active ? 0 : -1}
              onClick={() => onRoom(one.id)}
            >
              <span className="wdg-rooms-title">{one.title}</span>
              {one.note ? <small>{one.note}</small> : null}
              <span className="wdg-rooms-count">{one.experiments.length}</span>
            </button>
          ))}
        </div>
      </div>
      <div
        className="wdg-rooms-panel"
        role="tabpanel"
        id={`${prefix}-room-panel`}
        aria-labelledby={`${prefix}-room-${active.id}`}
      >
        <Workspace
          key={active.id}
          experiments={active.experiments}
          context={context}
          selected={tab}
          onSelect={onTab}
        />
      </div>
    </div>
  );
}
