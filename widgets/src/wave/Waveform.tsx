import { useCallback, useEffect, useMemo, useRef } from 'react';
import { levelsOf, packedOf, type Peak, type Steps } from './levels.ts';
import { densityFor, edgesOf, pathOf, samplesFrom } from './outline.ts';
import './wave.css';

/**
 * A stem as one shape, at whatever detail the zoom has earned.
 *
 * The drawing every one of these used to be was a column per half pixel with a
 * fill each — honest, and it looks it: at any width the result is a comb, and
 * the fine hair along the top is the loudest sample of a twentieth of a second
 * standing at full height beside its neighbour. Here it is a closed silhouette
 * off a ladder of halvings, so a wide view reads a short copy of the track and
 * draws the shape of an arrangement rather than the shape of a summary.
 *
 * Three things it does that took finding out, and that anything drawing a
 * canvas over time will need:
 *
 *   * **The backing store is sized only when the size changed.** Assigning
 *     `width` or `height` reallocates and zeroes it even when the number is the
 *     same, and doing that per frame was most of the cost of a zoom.
 *   * **It paints once a frame, not once per change.** A trackpad reports at
 *     120Hz against a 60Hz screen, so painting per change drew every lane about
 *     three times for each frame anybody saw and threw two away.
 *   * **It never draws nothing.** A silhouette whose edges meet encloses no
 *     area, so silence and single samples vanished until the edges were held a
 *     pixel apart.
 */

export interface WaveformProps {
  /**
   * The reading, as the lanes hold it or already packed. An array of columns is
   * packed and laddered here and remembered, so passing the same one costs
   * nothing after the first paint.
   */
  peaks: readonly Peak[] | Steps | readonly Steps[];
  /** The window on the whole, as fractions of it. */
  from?: number;
  to?: number;
  /**
   * Any CSS colour, `var(--token)` included.
   *
   * A canvas resolves nothing — handed `var(--stem-drums)` it paints black and
   * says nothing about why — so a token is looked up against this element,
   * which is what makes a themed colour behave the way it does everywhere else
   * in the library.
   */
  ink: string;
  height?: number;
  /** Points per CSS pixel. Omit to let it ride the zoom, which is the point. */
  density?: number;
  /** 0 draws the polyline; 1 curves through every point. */
  smooth?: number;
  /** How much of the half-height the loudest point may reach. */
  headroom?: number;
  /**
   * The audio itself, for views finer than the reading can answer. Without it a
   * deep zoom is a picture being enlarged, which is what stops a kick looking
   * like a kick.
   */
  samples?: readonly Float32Array[];
  className?: string;
  label?: string;
}

/** `var(--token)` or `var(--token, fallback)` against the element, or as given. */
const resolve = (el: Element, ink: string): string => {
  const named = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(ink.trim());
  if (!named) return ink;
  const got = getComputedStyle(el).getPropertyValue(named[1]).trim();
  return got || named[2]?.trim() || 'currentColor';
};

const laddered = (peaks: WaveformProps['peaks']): readonly Steps[] => {
  if (Array.isArray(peaks) && peaks.length && peaks[0] instanceof Float32Array) {
    return peaks as readonly Steps[];
  }
  if (peaks instanceof Float32Array) return levelsOf(peaks);
  return levelsOf(packedOf(peaks as readonly Peak[]));
};

export function Waveform({
  peaks,
  from = 0,
  to = 1,
  ink,
  height = 96,
  density,
  smooth = 1,
  headroom = 0.86,
  samples,
  className,
  label,
}: WaveformProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const pending = useRef(0);
  const latest = useRef<() => void>(() => {});

  // Built once per reading. Everything the ladder saves depends on this not
  // happening on the way to a frame.
  const levels = useMemo(() => laddered(peaks), [peaks]);

  const schedule = useCallback(() => {
    if (pending.current) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = 0;
      latest.current();
    });
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;

    latest.current = () => {
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      const dpr = window.devicePixelRatio || 1;
      const across = Math.round(box.width * dpr);
      const down = Math.round(box.height * dpr);
      if (el.width !== across) el.width = across;
      if (el.height !== down) el.height = down;
      const g = el.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, box.width, box.height);

      const ask = {
        from,
        to,
        width: box.width,
        height: box.height,
        density: density ?? densityFor(to - from),
        smooth,
        headroom,
      };
      const length = samples?.[0]?.length ?? 0;
      // Below what the reading can say, the audio itself — the same shape,
      // built from what is actually there rather than from a summary of it.
      const fine = length > 0 && (to - from) * (levels[0].length >> 1) < box.width * ask.density;
      const edges = fine
        ? samplesFrom(samples!, { ...ask, length })
        : edgesOf(levels, ask);
      g.fillStyle = resolve(el, ink);
      g.fill(pathOf(edges, smooth));
    };
    schedule();
  }, [levels, from, to, ink, height, density, smooth, headroom, samples, schedule]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const watch = new ResizeObserver(schedule);
    watch.observe(el);
    return () => {
      watch.disconnect();
      if (pending.current) cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, [schedule]);

  return (
    <canvas
      ref={canvas}
      className={`wdg wdg-wave${className ? ` ${className}` : ''}`}
      style={{ height }}
      role={label ? 'img' : undefined}
      aria-label={label}
    />
  );
}
