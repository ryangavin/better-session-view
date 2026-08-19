import { createContext, type PointerEvent } from 'react';

/**
 * Which edge of a node a port sits on, and therefore which way a cord leaves
 * it. `in` is the leading edge, `out` the trailing one, because Ableton's chain
 * runs left to right and a graph over the same `Device` should keep that
 * reading rather than invent a second one.
 */
export type PortSide = 'in' | 'out';

/**
 * What a `Port` and a `GraphNode` need from the surface they are drawn on.
 *
 * It is a context rather than props because a port is nested arbitrarily deep
 * inside whatever faceplate a host composed, and threading a callback down
 * through that would make every device in between know it is in a graph. The
 * things passing through here are all *geometry and gesture* — never what a
 * port means, which stays the host's.
 */
export interface GraphSurface {
  /**
   * A port announces its element so the graph can measure where it is. Called
   * again with `null` when the port unmounts.
   */
  register(id: string, side: PortSide, element: HTMLElement | null): void;
  /** The pointer went down on a port: start drawing a cord from it. */
  startCord(id: string, side: PortSide, event: PointerEvent<HTMLElement>): void;
  /**
   * The keyboard equivalent, and deliberately a toggle: the first press arms a
   * port, the second lands on one. A drag has a beginning and an end in the
   * same gesture; a keyboard doesn't, so it gets two presses instead.
   */
  armCord(id: string, side: PortSide): void;
  /** The pointer entered or left a port, so it can show it would be landed on. */
  hoverPort(id: string | null): void;
  /** The port a cord is being drawn from, or null. */
  cordFrom: string | null;
  /** The port under the pointer, or null. */
  cordOver: string | null;
  /**
   * The current scale, as a function rather than a value so that zooming
   * doesn't re-render every node — only a node mid-drag ever reads it.
   */
  scale(): number;
  /** A node reports where it was dragged to. The host writes it, or doesn't. */
  moveNode(id: string, x: number, y: number): void;
}

export const GraphContext = createContext<GraphSurface | null>(null);
