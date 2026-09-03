import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useCanvas } from './useCanvas.ts';
import './debug.css';

/**
 * A titled drawing with a line of text under it.
 *
 * The readout beside a timeline: an autocorrelation, a sweep, an error curve.
 * The canvas is the caller's to draw, given the box and where the pointer is
 * across it, and the caption is whatever the drawing decided — the chosen
 * candidate, the bottom of the curve — so a plot and its sentence stay
 * together.
 */
export interface PlotProps {
  title: string;
  /** Controls in the title bar: a select of what to plot, a button to run it. */
  actions?: ReactNode;
  draw(g: CanvasRenderingContext2D, width: number, height: number, hover: number | null): void;
  /** Under the drawing. */
  caption?: ReactNode;
  /** In px. */
  height?: number;
  className?: string;
}

export function Plot({ title, actions, draw, caption, height = 120, className }: PlotProps) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const paint = useCallback(
    (g: CanvasRenderingContext2D, w: number, h: number) => draw(g, w, h, hover),
    [draw, hover],
  );
  const canvas = useCanvas(paint);
  return (
    <div
      ref={box}
      className={`wdg wdg-plot${className ? ` ${className}` : ''}`}
      style={{ '--wdg-plot-height': `${height}px` } as CSSProperties}
    >
      <div className="wdg-plot-head">
        <span className="wdg-plot-title">{title}</span>
        {actions && <span className="wdg-plot-actions">{actions}</span>}
      </div>
      <canvas
        ref={canvas}
        className="wdg-plot-canvas"
        onPointerMove={(ev) => setHover(ev.clientX - ev.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setHover(null)}
      />
      {caption !== undefined && <div className="wdg-plot-caption">{caption}</div>}
    </div>
  );
}
