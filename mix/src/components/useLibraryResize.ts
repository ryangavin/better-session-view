import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export const LIBRARY_MIN = 190;

/** Leave one deck visible; the mixer owns scrolling the remaining decks. */
export function useLibraryResize(setWidth: (width: number) => void) {
  const rail = useRef<HTMLElement>(null);
  const finish = useRef<() => void>(() => {});
  const [bounds, setBounds] = useState({ maximum: LIBRARY_MIN, current: LIBRARY_MIN });
  const width = () => rail.current?.getBoundingClientRect().width ?? LIBRARY_MIN;
  const maximum = () => {
    const element = rail.current, parent = element?.parentElement;
    if (!element || !parent) return LIBRARY_MIN;
    const deck = parseFloat(getComputedStyle(element).getPropertyValue('--mf-deck-min')) || 260;
    return Math.max(LIBRARY_MIN, Math.floor(parent.getBoundingClientRect().width - deck));
  };
  const held = (value: number) => Math.round(Math.max(LIBRARY_MIN, Math.min(maximum(), value)));

  useLayoutEffect(() => {
    const measure = () => {
      const next = { maximum: maximum(), current: Math.round(width()) };
      setBounds(was => was.maximum === next.maximum && was.current === next.current ? was : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (rail.current) observer?.observe(rail.current);
    if (rail.current?.parentElement) observer?.observe(rail.current.parentElement);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); finish.current(); };
  }, []);

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    finish.current();
    const from = width(), start = event.clientX;
    const move = (moved: PointerEvent) => setWidth(held(from + moved.clientX - start));
    const done = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
    };
    finish.current = done;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
  };
  const nudge = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
    if (!step) return;
    event.preventDefault();
    setWidth(held(width() + step));
  };
  return { rail, drag, nudge, ...bounds };
}
