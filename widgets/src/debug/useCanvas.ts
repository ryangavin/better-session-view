import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * A canvas that fits its box at the device's pixel density and redraws when
 * asked.
 *
 * The draw callback gets a context already scaled to CSS pixels, and the box
 * in CSS pixels. It runs on mount, whenever the box changes size, and whenever
 * the callback's identity changes — so a caller wraps it in `useCallback` with
 * the data it draws in the deps, and the redraws follow the data.
 */
export type Draw = (g: CanvasRenderingContext2D, width: number, height: number) => void;

export function useCanvas(draw: Draw): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const watch = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((was) => (was.width === width && was.height === height ? was : { width, height }));
    });
    watch.observe(canvas);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || box.width === 0 || box.height === 0) return;
    const scale = window.devicePixelRatio || 1;
    const w = Math.round(box.width * scale);
    const h = Math.round(box.height * scale);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, box.width, box.height);
    draw(g, box.width, box.height);
  }, [draw, box]);

  return ref;
}
