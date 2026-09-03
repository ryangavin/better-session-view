import { useCallback, useMemo, useRef, useState } from 'react';
import { around, clamped, panned, spanOf, zoomed, type Span, type Window } from './axis.ts';

/** The narrowest window, in seconds: twenty milliseconds across the width is single samples. */
export const NARROWEST = 0.02;

export interface AxisOptions {
  /** The whole length, in seconds. */
  seconds: number;
  /** Where to open: the whole by default. */
  initial?: Window;
  narrowest?: number;
}

/**
 * The time a `Scope` shows, and the head and loop over it.
 *
 * One of these per scope, owned by the harness, so a toolbar button, a keyboard
 * shortcut and the pointer on the ruler all move the same window. The state is
 * three things — the window, the head in seconds, and a loop or none — and the
 * moves are the ones a person makes: zoom about a point, pan, seek, jump to the
 * whole, frame a span.
 */
export interface Axis {
  seconds: number;
  window: Window;
  cursor: number;
  loop: Span | null;
  setWindow(next: Window): void;
  /** Scale the window by `factor` about the second at `share` of its width. */
  zoom(factor: number, share: number): void;
  /** Move the window by a number of seconds. */
  pan(by: number): void;
  /** The window that was showing when a drag began, moved by seconds. */
  panFrom(start: Window, by: number): void;
  whole(): void;
  /** Frame a span with a margin either side. */
  frame(span: Span): void;
  seek(at: number): void;
  setLoop(next: Span | null): void;
}

export function useAxis({ seconds, initial, narrowest = NARROWEST }: AxisOptions): Axis {
  const [window, setRaw] = useState<Window>(() => clamped(initial ?? { from: 0, to: seconds }, seconds, narrowest));
  const [cursor, setCursor] = useState(0);
  const [loop, setLoopState] = useState<Span | null>(null);
  // The latest window, for moves that compose from it inside one event.
  const held = useRef(window);
  held.current = window;

  const setWindow = useCallback(
    (next: Window) => {
      const fixed = clamped(next, seconds, narrowest);
      held.current = fixed;
      setRaw(fixed);
    },
    [seconds, narrowest],
  );

  const zoom = useCallback((factor: number, share: number) => setWindow(zoomed(held.current, factor, share)), [setWindow]);
  const pan = useCallback((by: number) => setWindow(panned(held.current, by)), [setWindow]);
  const panFrom = useCallback((start: Window, by: number) => setWindow(panned(start, by)), [setWindow]);
  const whole = useCallback(() => setWindow({ from: 0, to: seconds }), [setWindow, seconds]);
  const frame = useCallback((span: Span) => setWindow(around(span)), [setWindow]);
  const seek = useCallback((at: number) => setCursor(Math.max(0, Math.min(at, seconds))), [seconds]);
  const setLoop = useCallback((next: Span | null) => {
    setLoopState(next && spanOf(next) < 0.05 ? null : next);
  }, []);

  return useMemo(
    () => ({ seconds, window, cursor, loop, setWindow, zoom, pan, panFrom, whole, frame, seek, setLoop }),
    [seconds, window, cursor, loop, setWindow, zoom, pan, panFrom, whole, frame, seek, setLoop],
  );
}
