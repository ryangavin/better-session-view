import { useEffect, useRef } from 'react';
import type { Peak } from '../audio.ts';

/**
 * A stem's envelope, drawn on a canvas.
 *
 * Canvas rather than SVG because there are six of these at a thousand columns
 * apiece and they redraw on every resize. A path with six thousand points in it
 * is a document the browser keeps; a canvas is a picture it forgets.
 *
 * **It is not a widget yet, and that is the rule rather than an oversight.**
 * `widgets/docs/catalogue.md` says a control moves into the library when the
 * second caller arrives — that is how `Meter` got there — and this has one.
 * When set[flow] draws a clip's audio it will have two, and this file is what
 * moves.
 */
export interface WaveformProps {
  peaks: readonly Peak[];
  /**
   * The colour to draw in — a literal, or a `var(--name)` this resolves against
   * its own element.
   *
   * A canvas cannot read a custom property, so something has to look it up.
   * Doing it here rather than at the call site keeps the palette in CSS, which
   * is the only place a theme can reach.
   */
  ink: string;
  /** Drawn dimmer, for a stem that is muted or lost to somebody else's solo. */
  quiet?: boolean;
  height: number;
  /** Bars, for the beat grid behind it. Left out, nothing is drawn. */
  bars?: number;
  /**
   * Clicking the lane moves the head there, as a fraction of the track.
   *
   * A fraction rather than a time, because this draws a whole buffer across
   * whatever width it was given and has no idea how many seconds that is. The
   * caller knows.
   */
  onSeek?(fraction: number): void;
  className?: string;
}

/** How much of the lane the loudest column is allowed to reach. */
const HEADROOM = 0.86;

export function Waveform({ peaks, ink, quiet, height, bars, onSeek, className }: WaveformProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;

    const paint = () => {
      const box = el.getBoundingClientRect();
      if (box.width < 1) return;
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(box.width * dpr);
      el.height = Math.round(height * dpr);
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, height);

      const middle = height / 2;

      if (bars) {
        // Every bar, and the fourth one brighter. A grid that treats all bars
        // alike is a ruler you have to count along.
        //
        // Thinned when the bars get closer than four pixels, which a real
        // track reaches easily — a four-minute song at 128 is 128 bars, and a
        // line every three pixels is not a grid, it is a fill. Stepping in
        // powers of four keeps whichever lines survive on musical boundaries.
        let step = 1;
        while ((step / bars) * box.width < 4 && step < bars) step *= 4;
        for (let b = 0; b <= bars; b += step) {
          const x = Math.round((b / bars) * box.width) + 0.5;
          ctx.strokeStyle = b % (step * 4) === 0 ? '#1f1f23' : '#151518';
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = quiet ? 0.22 : 1;
      ctx.fillStyle = ink.startsWith('var(')
        ? getComputedStyle(el).getPropertyValue(ink.slice(4, -1).trim()).trim() || '#8b8b93'
        : ink;
      const step = box.width / peaks.length;
      for (let i = 0; i < peaks.length; i++) {
        const peak = peaks[i];
        const top = middle - peak.max * middle * HEADROOM;
        const bottom = middle - peak.min * middle * HEADROOM;
        // At least a pixel: a quiet column that rounds to nothing leaves a gap
        // in the middle of the lane that reads as silence rather than as quiet.
        ctx.fillRect(i * step, top, Math.max(step - 0.35, 0.6), Math.max(bottom - top, 1));
      }
      ctx.globalAlpha = 1;
    };

    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(el);
    return () => watch.disconnect();
  }, [peaks, ink, quiet, height, bars]);

  // Every lane is scrubbable, not just the ruler. A waveform is the thing you
  // are actually looking at when you decide where to listen from, and reaching
  // back up to a strip at the top to act on it is the sort of gap that makes a
  // window feel like a diagram of a DAW rather than one.
  const scrub = onSeek
    ? (event: React.MouseEvent<HTMLCanvasElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)));
      }
    : undefined;

  return (
    <canvas
      ref={canvas}
      className={className}
      style={{ height, cursor: onSeek ? 'text' : undefined }}
      onClick={scrub}
    />
  );
}
