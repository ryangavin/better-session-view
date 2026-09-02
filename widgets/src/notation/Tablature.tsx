import { useEffect, useRef, type MouseEvent } from 'react';
import './notation.css';

export interface NotationSpan {
  from: number;
  to: number;
}

/**
 * Where the bars fall on the complete timeline, as two functions rather than
 * two numbers, so a grid whose tempo bends is drawn where it bends. Bar 1 is
 * zero; the time before it is negative.
 */
export interface NotationGrid {
  /** The bar at a place on the timeline, in the same zero-to-one space as `view`. */
  barAt(place: number): number;
  /** The place on the timeline a bar falls at. */
  placeOf(bar: number): number;
  /** Finest integer division of a bar. Four-four defaults to sixty-fourths. */
  ticksPerBar?: number;
}

export interface TablatureString {
  label: string;
}

export interface TablatureNote {
  /** Position on the complete timeline, in the same zero-to-one space as `view`. */
  from: number;
  to: number;
  /** String index, low to high. */
  string: number;
  label: string;
  /** Host-chosen ink for the fret label. */
  color?: string;
  kind?: 'note' | 'muted' | 'unplayable';
  /** Confidence or emphasis for the quiet duration cue. It never hides the fret. */
  strength?: number;
}

export interface TablatureProps {
  strings: readonly TablatureString[];
  notes: readonly TablatureNote[];
  view: NotationSpan;
  height: number;
  grid?: NotationGrid | null;
  className?: string;
  onSeek?(place: number): void;
}

const ink = (el: HTMLElement, name: string, fallback: string): string =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

/**
 * String notation over a continuous timeline.
 *
 * This owns only the display contract: string labels, already-fingered events,
 * an optional musical grid and a visible span. It does not know what instrument
 * produced them, how a pitch became a fret, or where the timeline came from.
 */
export function Tablature({ strings, notes, view, height, grid, className, onSeek }: TablatureProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;

    const paint = () => {
      const box = el.getBoundingClientRect();
      const wide = view.to - view.from;
      if (box.width < 1 || height < 1 || !(wide > 0) || strings.length === 0) return;
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(box.width * dpr);
      el.height = Math.round(height * dpr);
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, height);

      const text = ink(el, '--wdg-text', '#b7b7be');
      const quiet = ink(el, '--wdg-caption', '#5e5e66');
      const edge = ink(el, '--wdg-edge', '#2c2c31');
      const major = ink(el, '--wdg-empty', '#3a3a41');
      const face = ink(el, '--wdg-face', '#151517');
      const noteInk = ink(el, '--wdg-fill', '#f0b23c');
      const alarm = ink(el, '--wdg-alarm', '#d4544f');
      const xOf = (place: number) => ((place - view.from) / wide) * box.width;

      const barFrom = grid ? grid.barAt(view.from) : 0;
      const barTo = grid ? grid.barAt(view.to) : 0;
      if (grid && barTo > barFrom) {
        const first = Math.floor(barFrom);
        const last = Math.ceil(barTo);
        for (let bar = first; bar <= last; bar += 1) {
          const x = Math.round(xOf(grid.placeOf(bar))) + 0.5;
          ctx.fillStyle = bar % 4 === 0 ? major : edge;
          ctx.fillRect(x, 0, 1, height);
        }
      }

      const top = 13;
      const bottom = height - 13;
      const gap = strings.length > 1 ? (bottom - top) / (strings.length - 1) : 0;
      const yOf = (string: number) => top + (strings.length - 1 - string) * gap;
      ctx.font = '700 12px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let string = 0; string < strings.length; string += 1) {
        const y = Math.round(yOf(string)) + 0.5;
        ctx.fillStyle = edge;
        ctx.fillRect(0, y, box.width, 1);
      }

      const labelledUntil = new Array<number>(strings.length).fill(-Infinity);
      for (const note of notes) {
        if (note.string < 0 || note.string >= strings.length || note.to < view.from || note.from > view.to) continue;
        const x = xOf(note.from);
        const until = xOf(note.to);
        if (until < 0 || x > box.width) continue;
        const y = yOf(note.string);
        const colour = note.kind === 'unplayable'
          ? alarm
          : note.kind === 'muted'
            ? quiet
            : note.color ?? noteInk;
        // Time remains available, but as a hairline under the string rather
        // than a coloured block competing with the fret number.
        ctx.globalAlpha = Math.max(0.25, Math.min(0.55, note.strength ?? 0.45));
        ctx.fillStyle = note.kind === 'unplayable' ? alarm : quiet;
        ctx.fillRect(
          Math.max(0, x),
          Math.round(y + 2) + 0.5,
          Math.max(1, Math.min(box.width, until) - Math.max(0, x)),
          1,
        );
        ctx.globalAlpha = 1;

        const labelWidth = Math.max(9, ctx.measureText(note.label).width + 4);
        if (x - labelWidth / 2 <= labelledUntil[note.string]!) continue;
        // Like plain text tab, the number interrupts the string. The face fill
        // only erases the rule behind it; there is no badge, border or block.
        ctx.fillStyle = face;
        ctx.fillRect(x - labelWidth / 2, y - 7, labelWidth, 14);
        ctx.fillStyle = colour;
        ctx.fillText(note.label, x, y + 0.5);
        labelledUntil[note.string] = x + labelWidth / 2 + 2;
      }

      // Fixed string names keep the display legible while its time view pans.
      ctx.fillStyle = face;
      ctx.globalAlpha = 0.94;
      ctx.fillRect(0, 0, 24, height);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      for (let string = 0; string < strings.length; string += 1) {
        ctx.fillStyle = text;
        ctx.fillText(strings[string]!.label, 4, yOf(string) + 0.5);
      }
    };

    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(el);
    return () => watch.disconnect();
  }, [strings, notes, view, height, grid]);

  const seek = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const box = event.currentTarget.getBoundingClientRect();
    const across = (event.clientX - box.left) / box.width;
    onSeek(view.from + across * (view.to - view.from));
  };

  return (
    <canvas
      ref={canvas}
      className={`wdg wdg-tablature${className ? ` ${className}` : ''}`}
      style={{ height }}
      onClick={seek}
    />
  );
}
