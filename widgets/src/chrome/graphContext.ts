import { createContext, type PointerEvent } from 'react';

/**
 * Which edge of a node a port sits on, and therefore which way a cord leaves
 * it. `in` is the leading edge, `out` the trailing one, because Ableton's chain
 * runs left to right and a graph over the same `Device` should keep that
 * reading rather than invent a second one.
 */
export type PortSide = 'in' | 'out';

/**
 * A port's address on the canvas, which is its id **and** the side it is on.
 *
 * A cord names two port ids and nothing else, so within a cord an id is
 * unambiguous: `from` is an outlet and `to` is an inlet, always. On the canvas
 * it is not. A host is free to call a node's colour inlet and its colour outlet
 * both `hue1/c` — they are different ports on different sides and no cord can
 * confuse them — and a graph that filed elements by id alone would keep one of
 * the two and draw every cord that landed on the inlet at the outlet instead.
 *
 * So geometry is keyed by both. It is the weakest contract that works: ids have
 * to be unique **per side**, not across the canvas.
 */
export function portKey(id: string, side: PortSide): string {
  return `${side} ${id}`;
}

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
  /**
   * The pointer went down on a port: start drawing a cord from it. Either side
   * may start one — the graph's rule is that a cord has an outlet end and an
   * inlet end, not that the hand has to set them down in that order.
   */
  startCord(id: string, side: PortSide, event: PointerEvent<HTMLElement>): void;
  /**
   * The keyboard equivalent, and deliberately a toggle: the first press arms a
   * port, the second lands on one. A drag has a beginning and an end in the
   * same gesture; a keyboard doesn't, so it gets two presses instead.
   */
  armCord(id: string, side: PortSide): void;
  /** The pointer entered or left a port, so it can show it would be landed on. */
  hoverPort(id: string | null, side?: PortSide): void;
  /** The port a cord is being drawn from, as a `portKey`, or null. */
  cordFrom: string | null;
  /**
   * The side a port must be on to take the cord in flight, or null when none
   * is out. Because a drag runs from either end, what a port needs to know is
   * not which end started it but which end is still missing — and a port that
   * can say so is what stops half the gesture reading as broken.
   */
  cordWants: PortSide | null;
  /** The port under the pointer, as a `portKey`, or null. */
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
