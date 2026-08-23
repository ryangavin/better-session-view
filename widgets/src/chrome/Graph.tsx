import {
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type ReactNode,
} from 'react';
import { GraphContext, portKey, type GraphSurface, type PortSide } from './graphContext.ts';
import './chrome.css';

/**
 * The canvas a chain becomes when the order stops being a line.
 *
 * This is the sibling layout [`Chain`](./Chain.tsx) was written to leave room
 * for, and it is a layout in the same sense: it takes children, never a list of
 * devices, so it never learns why they are arranged the way they are. A strip
 * puts its children in a row; this one puts them where the host says. The same
 * `Device` hangs off either.
 *
 * It marks and reports; it does not perform. A dragged node emits a position
 * and stays where the host last put it, and a cord dragged between two ports
 * emits a pair of ids and is drawn only once the host passes it back in
 * `cords` — the same bargain a control makes when it emits a value and lets the
 * host write it. **The one rule the graph does enforce is sides**, because that
 * one is the drawing's own: an outlet connects to an inlet, and a cord between
 * two outlets has no shape. That is a rule about the *cord*, not about the
 * gesture — a drag runs from either end, and the pair is normalised on its way
 * out. Whether *this* outlet may reach *that* inlet is a question about what
 * they carry, and this module has no idea.
 *
 * Pan and zoom are the graph's own, the way a chain's scroll position is the
 * chain's. A host may read the current zoom through `viewRef`, but cannot write
 * it — publishing a view does not move ownership of it.
 */
export interface GraphCord {
  /** An outlet's `Port` id. */
  from: string;
  /** An inlet's `Port` id. */
  to: string;
  /** Surfaced as `data-kind` so a host can colour its own vocabulary. */
  kind?: string;
}

export interface GraphProps {
  /** `GraphNode`s. */
  children?: ReactNode;
  /**
   * Every cord to draw. A cord naming a port that isn't mounted is skipped
   * rather than dropped — nodes mount in their own time, and a host shouldn't
   * have to sequence its own state against React's.
   */
  cords?: readonly GraphCord[];
  /**
   * A cord was dragged between two ports. Always outlet first, whichever end
   * the gesture started at, so a host never has to ask which way it was drawn.
   */
  onConnect?(from: string, to: string): void;
  /** A node was dragged, or arrow-keyed, to a new position. */
  onMove?(id: string, x: number, y: number): void;
  /** The empty canvas was pressed, for a host that clears a selection on it. */
  onClearSelection?(): void;
  /**
   * An imperative, read-only view of the canvas.
   *
   * A ref keeps a host that only needs the scale out of the graph's render
   * path: wheel zoom updates this component, but does not publish a React value
   * that would re-render every node under it.
   */
  viewRef?: Ref<GraphView>;
  minZoom?: number;
  maxZoom?: number;
  /** Spacing of the background dots, in graph units. */
  grid?: number;
  className?: string;
}

export interface GraphView {
  /** The current zoom, read at the moment it is needed. */
  scale(): number;
}

interface Spot {
  x: number;
  y: number;
  side: PortSide;
  /** The host's id for the port, which is what a cord is reported in. */
  id: string;
}

interface Drawing {
  /** Where it is filed, which is [id and side](./graphContext.ts). */
  at: string;
  id: string;
  side: PortSide;
  /** Where the free end is, in graph coordinates. */
  x: number;
  y: number;
}

const NUDGE: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * What a pointer landing here means "a control has taken this" rather than
 * "drag the node". Deliberately a list of *interactive HTML* and not of
 * anything this module defines: a graph testing for `.wdg-device-head` would
 * know what a device is, which is the boundary `Chain` exists to hold.
 */
const INTERACTIVE = 'button, input, select, textarea, a[href], [role="slider"], [role="radio"]';

const IGNORES_ARROWS = 'input, [role="slider"], [role="radio"], .wdg-port';

/** The end a cord still needs, given the end it already has. */
const opposite = (side: PortSide): PortSide => (side === 'out' ? 'in' : 'out');

function cordPath(a: Spot, b: Spot): string {
  const reach = Math.max(30, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + reach} ${a.y}, ${b.x - reach} ${b.y}, ${b.x} ${b.y}`;
}

export function Graph({
  children,
  cords,
  onConnect,
  onMove,
  onClearSelection,
  viewRef,
  minZoom = 0.25,
  maxZoom = 3,
  grid = 24,
  className,
}: GraphProps) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  /**
   * Where every registered port last measured, and the elements to measure.
   *
   * Refs rather than state, because re-rendering every node whenever one of
   * them moved a pixel is precisely the cost being avoided — and only this
   * component ever draws from the geometry.
   *
   * Filed by [`portKey`](./graphContext.ts) rather than by id, because a port's
   * id is only unique down one side of a node.
   */
  const elements = useRef(new Map<string, { id: string; side: PortSide; el: HTMLElement }>());
  const spots = useRef(new Map<string, Spot>());
  const sizes = useRef<ResizeObserver | null>(null);
  const [, redraw] = useState(0);

  /** Current values for the handlers that outlive a render: capture, pointer, document. */
  const now = useRef({ view, drawing, over, onMove, onConnect });

  useImperativeHandle(viewRef, () => ({ scale: () => now.current.view.k }), [viewRef]);

  /**
   * Screen rectangles back into graph coordinates.
   *
   * It bumps the render counter only when something actually shifted, which is
   * what stops the layout effect below from looping: that effect runs after
   * every commit, and on most commits this finds nothing to say.
   */
  const measure = useCallback(() => {
    const origin = content.current?.getBoundingClientRect();
    if (!origin) return;
    const k = now.current.view.k;
    const next = new Map<string, Spot>();
    let changed = elements.current.size !== spots.current.size;
    for (const [at, { id, side, el }] of elements.current) {
      const box = el.getBoundingClientRect();
      const spot: Spot = {
        x: (box.left + box.width / 2 - origin.left) / k,
        y: (box.top + box.height / 2 - origin.top) / k,
        side,
        id,
      };
      next.set(at, spot);
      const was = spots.current.get(at);
      if (!was || Math.abs(was.x - spot.x) > 0.01 || Math.abs(was.y - spot.y) > 0.01) changed = true;
    }
    spots.current = next;
    if (changed) redraw((n) => n + 1);
  }, []);

  useLayoutEffect(() => {
    now.current = { view, drawing, over, onMove, onConnect };
    measure();
  });

  useEffect(() => () => sizes.current?.disconnect(), []);

  const register = useCallback(
    (id: string, side: PortSide, el: HTMLElement | null) => {
      const at = portKey(id, side);
      const held = elements.current.get(at);
      if (held) {
        sizes.current?.unobserve(held.el);
        elements.current.delete(at);
      }
      if (el) {
        // A port moves when its faceplate resizes, when a font lands, or when
        // a host swaps a face — and none of those re-render this component.
        // Watching the elements is the only thing that catches all three.
        sizes.current ??= new ResizeObserver(() => measure());
        elements.current.set(at, { id, side, el });
        sizes.current.observe(el);
      }
      measure();
    },
    [measure],
  );

  /** A screen point as a graph point, for the free end of a cord being drawn. */
  const toGraph = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const origin = content.current?.getBoundingClientRect();
    if (!origin) return { x: 0, y: 0 };
    const k = now.current.view.k;
    return { x: (clientX - origin.left) / k, y: (clientY - origin.top) / k };
  }, []);

  /**
   * Land a cord, if what it landed on is the end this one is still missing.
   *
   * The gesture's order is not the cord's. An inlet reaching for an outlet
   * makes the same cord as an outlet reaching for an inlet, so the pair is
   * sorted before the host sees it — `from` is the outlet and `to` the inlet
   * either way, which is what lets a host wire on it without asking how the
   * hand moved. A drop on the same side is refused; that is the sides rule,
   * and it is the only one here.
   */
  const land = useCallback((target: string | null) => {
    const held = now.current.drawing;
    setDrawing(null);
    if (!held || !target || target === held.at) return;
    const spot = spots.current.get(target);
    if (!spot || spot.side !== opposite(held.side)) return;
    const [from, to] = held.side === 'out' ? [held.id, spot.id] : [spot.id, held.id];
    now.current.onConnect?.(from, to);
  }, []);

  const startCord = useCallback(
    (id: string, side: PortSide, e: ReactPointerEvent<HTMLElement>) => {
      setDrawing({ at: portKey(id, side), id, side, ...toGraph(e.clientX, e.clientY) });
    },
    [toGraph],
  );

  const armCord = useCallback(
    (id: string, side: PortSide) => {
      const at = portKey(id, side);
      if (now.current.drawing) {
        land(at);
        return;
      }
      const spot = spots.current.get(at);
      setDrawing({ at, id, side, x: spot?.x ?? 0, y: spot?.y ?? 0 });
    },
    [land],
  );

  const hoverPort = useCallback((id: string | null, side?: PortSide) => {
    setOver(id !== null && side ? portKey(id, side) : null);
  }, []);

  /** While a cord is out, the whole document is somewhere it can be let go. */
  const drawingOut = drawing !== null;
  useEffect(() => {
    if (!drawingOut) return;
    const move = (e: PointerEvent) => {
      setDrawing((held) => (held ? { ...held, ...toGraph(e.clientX, e.clientY) } : held));
    };
    const up = () => land(now.current.over);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawing(null);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('keydown', key);
    };
  }, [drawingOut, toGraph, land]);

  /**
   * Zoom about the pointer, on a native listener because React registers wheel
   * passively at the root and a passive handler cannot stop the page scrolling.
   */
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      setView((v) => {
        const k = Math.min(maxZoom, Math.max(minZoom, v.k * Math.exp(-e.deltaY * 0.0015)));
        if (k === v.k) return v;
        // Hold whatever graph point is under the cursor exactly where it is.
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [minZoom, maxZoom]);

  const pan = useRef<{ id: number; fromX: number; fromY: number; atX: number; atY: number } | null>(
    null,
  );

  /**
   * Which end the cord in flight is still short of, and so which ports could
   * take it. Ports read it to mark themselves, because a drag from either end
   * only reads as one feature if it looks like one: an outlet in hand should
   * light the inlets and an inlet in hand should light the outlets, and a
   * canvas that lights the same ports both ways looks broken while working.
   */
  const wants = drawing ? opposite(drawing.side) : null;

  const surface = useMemo<GraphSurface>(
    () => ({
      register,
      startCord,
      armCord,
      hoverPort,
      cordFrom: drawing?.at ?? null,
      cordWants: wants,
      cordOver: over,
      scale: () => now.current.view.k,
      moveNode: (id, x, y) => now.current.onMove?.(id, x, y),
    }),
    [register, startCord, armCord, hoverPort, drawing?.at, wants, over],
  );

  // A cord's ends are named by side and not looked up: `from` is an outlet and
  // `to` is an inlet, which is the whole of what `GraphCord` promises. Reading
  // that promise here is what lets a node call its colour inlet and its colour
  // outlet the same thing.
  const drawn = (cords ?? []).flatMap((cord) => {
    const a = spots.current.get(portKey(cord.from, 'out'));
    const b = spots.current.get(portKey(cord.to, 'in'));
    return a && b ? [{ cord, d: cordPath(a, b) }] : [];
  });

  /**
   * The cord in flight, always drawn outlet-end first — so a drag started at an
   * inlet puts the *pointer* at the outlet end. `cordPath` throws its control
   * points out to the right of the first point and in from the left of the
   * second, which is the shape a landed cord has; anchor it to the inlet
   * instead and the bezier bulges backwards and then flips at the moment it
   * connects.
   */
  const anchor = drawing ? spots.current.get(drawing.at) : undefined;
  const loose =
    drawing && anchor
      ? drawing.side === 'out'
        ? cordPath(anchor, { x: drawing.x, y: drawing.y, side: 'in', id: '' })
        : cordPath({ x: drawing.x, y: drawing.y, side: 'out', id: '' }, anchor)
      : null;

  return (
    <div
      ref={viewport}
      className={`wdg wdg-graph${className ? ` ${className}` : ''}`}
      {...(panning ? { 'data-panning': '' } : {})}
      style={
        {
          '--wdg-graph-grid': `${grid * view.k}px`,
          '--wdg-graph-x': `${view.x}px`,
          '--wdg-graph-y': `${view.y}px`,
        } as CSSProperties
      }
      onPointerDown={(e) => {
        // Only the empty canvas pans. A node is a real box and is its own target.
        if (e.target !== e.currentTarget) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pan.current = {
          id: e.pointerId,
          fromX: e.clientX,
          fromY: e.clientY,
          atX: view.x,
          atY: view.y,
        };
        setPanning(true);
        onClearSelection?.();
      }}
      onPointerMove={(e) => {
        const held = pan.current;
        if (!held || held.id !== e.pointerId) return;
        setView((v) => ({
          ...v,
          x: held.atX + (e.clientX - held.fromX),
          y: held.atY + (e.clientY - held.fromY),
        }));
      }}
      onPointerUp={(e) => {
        if (pan.current?.id !== e.pointerId) return;
        pan.current = null;
        setPanning(false);
      }}
      onPointerCancel={() => {
        pan.current = null;
        setPanning(false);
      }}
    >
      <div
        ref={content}
        className="wdg-graph-content"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <svg className="wdg-graph-cords" aria-hidden="true">
          {drawn.map(({ cord, d }) => (
            <path
              key={`${cord.from} ${cord.to}`}
              className="wdg-graph-cord"
              d={d}
              {...(cord.kind === undefined ? {} : { 'data-kind': cord.kind })}
            />
          ))}
          {loose && <path className="wdg-graph-cord" data-pending="" d={loose} />}
        </svg>
        <GraphContext.Provider value={surface}>{children}</GraphContext.Provider>
      </div>
    </div>
  );
}

export interface GraphNodeProps {
  /** The host's own id for this node. Only ever handed back to it. */
  id: string;
  /** Position in graph coordinates — the canvas's own units, before zoom. */
  x: number;
  y: number;
  /** A `Device`, usually. Whatever it is, it is the size it wants to be. */
  children?: ReactNode;
  className?: string;
}

/**
 * One node's place on the canvas.
 *
 * Positions are the host's, exactly as a chain's order is: this reports a drag
 * and redraws only when the host hands a new `x` and `y` back. That is what
 * lets the same state be undone, saved, or refused.
 *
 * A node drags from anywhere a control hasn't already claimed. `useParamGesture`
 * calls `preventDefault` when it takes a pointer, so a knob turning inside a
 * node says so and the node stays put — which is why there is no drag handle
 * here, and no rule about which part of a faceplate counts as furniture.
 */
export function GraphNode({ id, x, y, children, className }: GraphNodeProps) {
  const graph = useContext(GraphContext);
  const drag = useRef<{ id: number; fromX: number; fromY: number; atX: number; atY: number } | null>(
    null,
  );

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!graph || e.button !== 0 || e.defaultPrevented) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, fromX: e.clientX, fromY: e.clientY, atX: x, atY: y };
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (!held || held.id !== e.pointerId || !graph) return;
    const k = graph.scale();
    graph.moveNode(
      id,
      held.atX + (e.clientX - held.fromX) / k,
      held.atY + (e.clientY - held.fromY) / k,
    );
  };

  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  /**
   * Arrows move the node, and the tab stop they need is the one the device head
   * already has. A wrapper with a `tabIndex` of its own would double the stops
   * in a patch, which is the kind of accessibility that makes a page worse.
   */
  const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = NUDGE[e.key];
    if (!step || !graph) return;
    if ((e.target as HTMLElement).closest(IGNORES_ARROWS)) return;
    e.preventDefault();
    const by = e.shiftKey ? 1 : 8;
    graph.moveNode(id, x + step[0] * by, y + step[1] * by);
  };

  return (
    <div
      className={`wdg-graph-node${className ? ` ${className}` : ''}`}
      style={{ left: `${x}px`, top: `${y}px` }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    >
      {children}
    </div>
  );
}
