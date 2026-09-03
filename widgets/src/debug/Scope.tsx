import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { spanOf, timeOf, xOf, type View } from './axis.ts';
import type { Axis } from './useAxis.ts';
import { inkOf } from './ink.ts';
import { useCanvas } from './useCanvas.ts';
import './debug.css';

/**
 * Labelled rows of drawing on one time axis.
 *
 * A harness for anything that happens over time — a stem, the onsets heard in
 * it, the beats laid on it, a tempo curve, the truth — is rows that must line
 * up to the pixel, and a scroll or a zoom that moves all of them at once.
 * That alignment is the whole job of this component: every `ScopeRow` draws
 * through a callback that gets the same `View`, and the overlay on top draws
 * the head, the loop and the pointer across all of them.
 *
 * What is drawn is the caller's. A row is a label, a height and a draw
 * callback; the scope knows nothing about beats. The gestures on the row
 * marked `ruler` are the ones every timeline has — click to seek, drag to
 * pan, shift-drag for a loop, alt-drag or a drag on the head to scrub — and a
 * row that wants its own gets the pointer in seconds through `onPointer`.
 */
export interface ScopePointer {
  type: 'down' | 'move' | 'up' | 'double';
  /** Where on the axis, in seconds. */
  at: number;
  x: number;
  y: number;
  alt: boolean;
  shift: boolean;
  view: View;
}

export interface Scrub {
  start(at: number): void;
  to(at: number): void;
  end(): void;
}

interface ScopeState {
  axis: Axis;
  head: number;
  scrub?: Scrub;
  hover: number | null;
  setHover(x: number | null): void;
}

const Context = createContext<ScopeState | null>(null);

export interface ScopeProps {
  axis: Axis;
  /** The moving head, in seconds, while something plays; the axis cursor otherwise. */
  head?: number;
  scrub?: Scrub;
  /** Drawn over every row, after the head and loop. */
  overlay?: (g: CanvasRenderingContext2D, view: View) => void;
  /** Width of the label column, in px. */
  labels?: number;
  className?: string;
  children?: ReactNode;
}

export function Scope({ axis, head, scrub, overlay, labels = 72, className, children }: ScopeProps) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const at = head ?? axis.cursor;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const width = rect.width - labels;
      const x = ev.clientX - rect.left - labels;
      // Scroll pans, on either axis, so a zoomed view moves fast; shift or
      // cmd/ctrl with it zooms about the cursor.
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
        const d = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;
        axis.zoom(Math.exp(d * 0.002), Math.max(0, Math.min(x / width, 1)));
      } else {
        const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
        axis.pan((d / width) * spanOf(axis.window));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [axis, labels]);

  const drawOverlay = useCallback(
    (g: CanvasRenderingContext2D, w: number, h: number) => {
      const view: View = { ...axis.window, width: w, height: h };
      const el = box.current;
      if (axis.loop) {
        g.fillStyle = inkOf(el, 'cool');
        g.globalAlpha = 0.14;
        const x0 = xOf(view, axis.loop.from);
        g.fillRect(x0, 0, xOf(view, axis.loop.to) - x0, h);
        g.globalAlpha = 1;
      }
      if (hover !== null) {
        g.strokeStyle = inkOf(el, 'caption');
        g.beginPath();
        g.moveTo(hover + 0.5, 0);
        g.lineTo(hover + 0.5, h);
        g.stroke();
      }
      const x = xOf(view, at);
      if (x >= 0 && x <= w) {
        g.strokeStyle = inkOf(el, 'strong');
        g.beginPath();
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, h);
        g.stroke();
      }
      overlay?.(g, view);
    },
    [axis.window, axis.loop, hover, at, overlay],
  );
  const canvas = useCanvas(drawOverlay);

  const state = useMemo<ScopeState>(() => ({ axis, head: at, scrub, hover, setHover }), [axis, at, scrub, hover]);

  return (
    <Context.Provider value={state}>
      <div
        ref={box}
        className={`wdg wdg-scope${className ? ` ${className}` : ''}`}
        style={{ '--wdg-scope-labels': `${labels}px` } as CSSProperties}
        onPointerLeave={() => setHover(null)}
      >
        {children}
        <canvas ref={canvas} className="wdg-scope-overlay" aria-hidden="true" />
      </div>
    </Context.Provider>
  );
}

export interface ScopeRowProps {
  label: string;
  /** In px. */
  height: number;
  draw(g: CanvasRenderingContext2D, view: View): void;
  /** The pointer, in seconds. Down captures; moves and the up follow to the same row. */
  onPointer?(ev: ScopePointer): void;
  /** The time gestures live on this row: seek, pan, loop, scrub. */
  ruler?: boolean;
  /** Shown beside the label while the pointer is over the row. */
  legend?: ReactNode;
  className?: string;
}

export function ScopeRow({ label, height, draw, onPointer, ruler = false, legend, className }: ScopeRowProps) {
  const scope = useContext(Context);
  if (!scope) throw new Error('ScopeRow must sit inside a Scope');
  const { axis, head, scrub, setHover } = scope;
  const [over, setOver] = useState(false);

  const paint = useCallback(
    (g: CanvasRenderingContext2D, w: number, h: number) => draw(g, { ...axis.window, width: w, height: h }),
    [draw, axis.window],
  );
  const canvas = useCanvas(paint);

  const viewAt = (el: HTMLCanvasElement): View => {
    const rect = el.getBoundingClientRect();
    return { ...axis.window, width: rect.width, height: rect.height };
  };
  const pointerOf = (ev: ReactPointerEvent<HTMLCanvasElement> | PointerEvent, type: ScopePointer['type']): ScopePointer => {
    const el = canvas.current!;
    const rect = el.getBoundingClientRect();
    const view = viewAt(el);
    const x = ev.clientX - rect.left;
    return { type, at: timeOf(view, x), x, y: ev.clientY - rect.top, alt: ev.altKey, shift: ev.shiftKey, view };
  };

  const onDown = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const el = ev.currentTarget;
    el.setPointerCapture(ev.pointerId);
    const first = pointerOf(ev, 'down');
    if (ruler) {
      rulerDrag(el, first, ev.nativeEvent);
      return;
    }
    onPointer?.(first);
    const move = (m: PointerEvent) => onPointer?.(pointerOf(m, 'move'));
    const up = (u: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      onPointer?.(pointerOf(u, 'up'));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const rulerDrag = (el: HTMLCanvasElement, first: ScopePointer, native: PointerEvent) => {
    const start = axis.window;
    const startX = first.x;
    const selecting = first.shift;
    const onHead = Math.abs(xOf(first.view, head) - first.x) <= 6;
    const scrubbing = scrub && !selecting && (first.alt || onHead);
    let moved = false;
    if (scrubbing) {
      axis.seek(first.at);
      scrub.start(first.at);
      const move = (m: PointerEvent) => {
        const p = pointerOf(m, 'move');
        axis.seek(p.at);
        scrub.to(Math.max(0, Math.min(p.at, axis.seconds)));
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        scrub.end();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      return;
    }
    const move = (m: PointerEvent) => {
      const p = pointerOf(m, 'move');
      if (Math.abs(p.x - startX) > 3) moved = true;
      if (selecting) {
        axis.setLoop({ from: Math.min(first.at, p.at), to: Math.max(first.at, p.at) });
      } else if (moved) {
        axis.panFrom(start, ((startX - p.x) / p.view.width) * spanOf(start));
      }
    };
    const up = (u: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (!moved && !selecting) axis.seek(pointerOf(u, 'up').at);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    void native;
  };

  return (
    <div
      className={`wdg-scope-row${className ? ` ${className}` : ''}`}
      style={{ '--wdg-scope-row-height': `${height}px` } as CSSProperties}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
    >
      <span className="wdg-scope-label">
        {label}
        {legend && over && <span className="wdg-scope-legend">{legend}</span>}
      </span>
      <canvas
        ref={canvas}
        className="wdg-scope-canvas"
        data-ruler={ruler || undefined}
        onPointerDown={onDown}
        onPointerMove={(ev) => {
          if (ev.buttons === 0) {
            setHover(ev.clientX - ev.currentTarget.getBoundingClientRect().left);
            if (onPointer) onPointer(pointerOf(ev, 'move'));
          }
        }}
        onDoubleClick={(ev) => onPointer?.({ ...pointerOf(ev as unknown as ReactPointerEvent<HTMLCanvasElement>, 'double') })}
      />
    </div>
  );
}
