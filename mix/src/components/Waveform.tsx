import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Peak } from '../audio.ts';
import { levelsOf, packedOf } from '@openflow/widgets/wave/levels.ts';
import { densityFor, edgesOf, pathOf, samplesFrom } from '@openflow/widgets/wave/outline.ts';
import { rankOf, rulingOf, shaded, TICKS_PER_BAR, type Rank } from '../grid.ts';
import { barAt, placeOf, type Beats } from '../warp.ts';
import type { Span } from '../zoom.ts';

/**
 * A stem's envelope, drawn on a canvas.
 *
 * Canvas rather than SVG because there are six of these at a thousand columns
 * apiece and they redraw on every resize. A path with six thousand points in it
 * is a document the browser keeps; a canvas is a picture it forgets.
 *
 * **There are two drawings here, and which one you get is a measurement.**
 * Peaks are a summary of the track scanned once — the right thing to draw while
 * a column of them is at most a pixel wide. Past that they are a picture being
 * magnified, so the drawing switches to the samples themselves, and past *that*
 * to a line through them with a point on each. The switch is not a setting: it
 * happens exactly where the peaks stop being finer than the screen.
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
   * The audio itself, for when the view is finer than the peaks are.
   *
   * The same buffer the transport plays — `engine.ts` holds it and hands it
   * over rather than a copy being kept beside it. Left out, the lane draws
   * peaks however far it is zoomed, which is a picture being enlarged.
   */
  buffer?: AudioBuffer | null;
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
  /**
   * How tall to draw, in px. Left out, it fills whatever box it is given.
   *
   * The lanes leave it out: how tall a stem is depends on how many stems the
   * model made and how tall the window is, and that is a question CSS answers
   * better than a component can. What is measured either way is the element —
   * `ResizeObserver` is already watching it for width, and a canvas has to be
   * told its pixel size in the end regardless.
   */
  height?: number;
  /**
   * Where the bars fall on the file, for the grid behind the drawing. Left out,
   * nothing is ruled.
   *
   * A map rather than a count, because a grid has a phase: a song with air in
   * front of it starts on the second half of bar zero, and a lane told only how
   * many bars there are can do nothing but start one at the left edge.
   */
  bars?: Beats;
  /**
   * Which slice of the track to draw, as fractions. The whole of it by default.
   *
   * The canvas stays the width it is on screen and draws less of the track into
   * it, rather than growing with the zoom: at the depths this reaches that
   * would be a canvas of a hundred million pixels, six times over. It also
   * means zooming costs a repaint and never a re-scan of the whole track —
   * `zoom.ts`.
   */
  span?: Span;
  /**
   * Clicking the lane moves the head there, as a fraction of the track.
   *
   * A fraction rather than a time, because this draws a buffer across whatever
   * width it was given and has no idea how many seconds that is. The caller
   * knows. It is a fraction of the whole track and not of what is on screen, so
   * a click means the same thing at every zoom.
   *
   * `extend` is the shift key: the same click, meaning *to here* rather than
   * *at here*. Which is the caller's business too — a waveform has no idea
   * there is such a thing as a loop.
   */
  onSeek?(fraction: number, extend: boolean): void;
  className?: string;
}

/** How much of the lane the loudest column is allowed to reach. */
const HEADROOM = 0.86;

/**
 * The finest an envelope goes: columns per CSS pixel.
 *
 * Two, because a column is a min and a max and one pixel of a waveform is an
 * up-stroke and a down-stroke. Past that the extra columns land on the same
 * pixel and cost a `fillRect` each — and there are six lanes of them. It is
 * also the point where an envelope stops being the honest drawing: with fewer
 * than two samples to a pixel there is nothing left to summarise, so the line
 * takes over.
 */
const PER_PIXEL = 2;

/** How far apart samples have to be before each one is drawn as a point. */
const DOT = 4;

/**
 * What each kind of grid line is drawn in.
 *
 * Four weights rather than two, because there are four things to tell apart
 * once the grid subdivides — and the hierarchy is what lets you read the ruling
 * without counting it. Ranked by `grid.ts` from what a line *is*, so a bar line
 * stays a bar line as the grid thins around it.
 */
const RULE: Record<Rank, string> = {
  phrase: '#2b2b30',
  bar: '#222227',
  beat: '#1a1a1e',
  sub: '#141417',
};

const WHOLE: Span = { from: 0, to: 1 };

/** Which of the three drawings a lane is showing. */
export type Drawing = 'peaks' | 'envelope' | 'points';

/**
 * Which drawing the view has earned.
 *
 * Peaks while a column of them holds more of the track than a pixel does —
 * that is the whole rule, and it makes the handover a measurement rather than
 * a zoom level somebody picked. Below it the peaks would be a picture being
 * enlarged, so the samples take over: an envelope of them while there are more
 * samples than the lane has columns, and the points themselves once there are
 * fewer. With no audio to hand there is only ever one answer.
 */
export const drawingOf = (
  columns: number,
  samples: number,
  span: number,
  width: number,
): Drawing => {
  if (samples <= 0 || width <= 0) return 'peaks';
  const perPixel = (samples * span) / width;
  if (columns > 0 && perPixel >= samples / columns) return 'peaks';
  return perPixel >= PER_PIXEL ? 'envelope' : 'points';
};

export function Waveform({
  peaks,
  buffer,
  ink,
  quiet,
  height,
  bars,
  span,
  onSeek,
  className,
}: WaveformProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const from = span?.from ?? WHOLE.from;
  const to = span?.to ?? WHOLE.to;

  /**
   * One paint a frame, however fast the wheel talks.
   *
   * `paint` used to run straight out of the effect, so a lane redrew once per
   * state change — and a state change is one wheel event. A trackpad reports at
   * 120Hz against a 60Hz screen, so a fast zoom repainted every lane about
   * three times for each frame anybody saw and threw two of them away. The work
   * scaled with the input device rather than with the display, which is why it
   * stuttered under a hand and never under a test that moved one step a frame.
   *
   * A frame is the right unit rather than a timer. A debounce would hold the
   * drawing back after the gesture stopped, which reads as lag; this draws as
   * often as there is something new to show and no oftener.
   *
   * Both of these are refs on purpose. The handle has to outlive one run of the
   * effect, or two changes in a frame each book their own; and the frame has to
   * call the newest `paint` there is, because whichever one booked the frame
   * closed over the zoom as it was when it did.
   */
  /**
   * The stem at halving resolutions, built once when the peaks arrive.
   *
   * A wide view reads a short copy instead of the whole track, and — the part
   * that shows — the drawing stops being a comb of columns whose fine hair at a
   * wide zoom is the loudest sample of a twentieth of a second standing beside
   * its neighbour.
   */
  const levels = useMemo(() => levelsOf(packedOf(peaks)), [peaks]);

  const pending = useRef(0);
  const latest = useRef<() => void>(() => {});
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

    const paint = () => {
      const box = el.getBoundingClientRect();
      const tall = height ?? box.height;
      if (box.width < 1 || tall < 1) return;
      const dpr = window.devicePixelRatio || 1;
      // Only when it actually changed. Assigning either of these reallocates
      // the backing store and zeroes it even when the number is the same, and
      // a lane is megabytes: doing it per draw is the whole cost of a zoom,
      // paid again by every lane. `clearRect` below is what wipes the canvas.
      const across = Math.round(box.width * dpr);
      const down = Math.round(tall * dpr);
      if (el.width !== across) el.width = across;
      if (el.height !== down) el.height = down;
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, tall);

      const middle = tall / 2;
      const reach = middle * HEADROOM;
      const yOf = (value: number) => middle - value * reach;

      // The width the whole track would have at this zoom, which is the one
      // number every position on the lane is measured against. Nothing is
      // drawn that wide — it is what turns a fraction of the track into an x
      // on a canvas that only holds a slice of it.
      const track = box.width / (to - from);
      const left = from * track;
      const xOf = (fraction: number) => fraction * track - left;

      const colour = ink.startsWith('var(')
        ? getComputedStyle(el).getPropertyValue(ink.slice(4, -1).trim()).trim() || '#8b8b93'
        : ink;
      const alpha = quiet ? 0.22 : 1;

      const barFrom = bars ? barAt(bars, from) : 0;
      const barTo = bars ? barAt(bars, to) : 0;
      if (bars && barTo > barFrom) {
        // As fine as there is room for, from bars down to sixty-fourths —
        // `grid.ts` picks the rung and says what each line is. Measuring
        // against the bars on *screen* is what makes zooming in hand back the
        // divisions it thinned: a song wide is bars, a bar wide is beats, and a
        // kick drum wide is whatever fits under it.
        //
        // Counted in absolute ticks — bar 1 is tick zero wherever in the file
        // it falls — so that what a line *is* does not change when the downbeat
        // moves. Where a tick falls is the map's to say, and nothing here does
        // the arithmetic itself: a grid that bends between markers bends here
        // exactly as it does on the warp lane.
        const atTick = (t: number) => xOf(placeOf(bars, t / TICKS_PER_BAR));
        // Neither end is clamped to the track: zoomed out past the lane there
        // is time on screen that is not in the song, and the grid carries on
        // through it — what says it is outside is the shading over it, not a
        // gap in the ruling.
        const { step, first, last, shade, block } = rulingOf(barFrom, barTo, box.width);
        // Every other block between the dividers, in the stem's own colour —
        // which is what makes a lane readable as an arrangement and as *this*
        // stem's arrangement at the same time. Under the ruling, so a bar line
        // still reads as a line rather than as the edge of a shape.
        ctx.save();
        ctx.fillStyle = colour;
        ctx.globalAlpha = quiet ? 0.015 : 0.05;
        for (let t = block; t <= last; t += shade) {
          if (!shaded(t, shade)) continue;
          const x = Math.round(atTick(t));
          ctx.fillRect(x, 0, Math.round(atTick(t + shade)) - x, tall);
        }
        ctx.restore();
        for (let t = first; t <= last; t += step) {
          const x = Math.round(atTick(t)) + 0.5;
          ctx.strokeStyle = RULE[rankOf(t)];
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, tall);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = colour;
      ctx.strokeStyle = colour;

      // How much of the track a pixel is being asked to hold, against how much
      // a column of peaks holds. While a pixel covers more than a column, the
      // peaks are a summary of what is on screen and drawing them is exact;
      // once it covers less, they are a picture being enlarged and the samples
      // are what is actually there.
      const length = buffer?.length ?? 0;
      const drawing = drawingOf(peaks.length, length, to - from, box.width);

      if (drawing === 'peaks') {
        // One silhouette off the ladder: along the top of what the sound
        // reached, back along the bottom, filled once. Detail rides the zoom,
        // because a point per pixel across a whole track draws hair that says
        // only that the summary moved.
        if (peaks.length) {
          const edges = edgesOf(levels, {
            from,
            to,
            width: box.width,
            height: tall,
            density: densityFor(to - from),
            smooth: 1,
            headroom: HEADROOM,
          });
          ctx.fill(pathOf(edges, 1));
        }
        ctx.globalAlpha = 1;
        return;
      }

      // Zero, which only means something once the drawing is of values rather
      // than of an envelope around them.
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1f1f23';
      ctx.fillRect(0, Math.round(middle), box.width, 1);
      ctx.restore();

      const channels = Array.from({ length: buffer!.numberOfChannels }, (_, c) =>
        buffer!.getChannelData(c),
      );
      // A sample either side of the view, so the line reaches the edges rather
      // than starting a pixel inside them.
      const first = Math.max(0, Math.floor(from * length) - 1);
      const last = Math.min(length, Math.ceil(to * length) + 1);
      const wide = box.width / (length * (to - from));
      // Measured off the sample index rather than through the track fraction:
      // at these depths the fraction is a difference between two numbers in the
      // tens of millions, and the sample is the thing being pointed at.
      const xAt = (i: number) => (i - from * length) * wide;

      if (drawing === 'envelope') {
        // Past what the peaks can say, the same silhouette off the audio
        // itself, so nothing about the drawing changes at the handover except
        // where its numbers came from. Channels fold by widest excursion, the
        // rule `peaksOf` uses — a hard-panned hat at its real height rather
        // than half of it.
        const edges = samplesFrom(channels, {
          from,
          to,
          width: box.width,
          height: tall,
          density: densityFor(to - from),
          smooth: 1,
          headroom: HEADROOM,
          length,
        });
        ctx.fill(pathOf(edges, 1));
        ctx.globalAlpha = 1;
        return;
      }

      // Fewer samples than pixels: the points themselves, with the line the
      // converter will draw between them. Both channels, because at this depth
      // the question is what the audio did and the two of them did different
      // things — folding them here would be inventing a signal that is not in
      // the file.
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * (channels.length > 1 ? 0.75 : 1);
      for (const channel of channels) {
        ctx.beginPath();
        for (let i = first; i < last; i++) {
          const x = xAt(i);
          const y = yOf(channel[i]);
          if (i === first) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (wide >= DOT) {
          const dots = new Path2D();
          for (let i = first; i < last; i++) {
            dots.rect(xAt(i) - 1.5, yOf(channel[i]) - 1.5, 3, 3);
          }
          ctx.fill(dots);
        }
      }
      ctx.globalAlpha = 1;
    };

    latest.current = paint;
    schedule();
  }, [schedule, peaks, buffer, ink, quiet, height, bars, from, to]);

  /**
   * The observer is made once, and a booked frame is only ever dropped when the
   * lane goes away.
   *
   * Cancelling it on a change was the bug this replaces. The effect above lists
   * the zoom among its dependencies, so every wheel event tore down the frame
   * that was owed and booked another — and a hand that kept moving kept moving
   * the drawing out of its own way, which is a stutter that gets worse the less
   * you stop. Scrolling on is not a reason to abandon a frame already promised:
   * it is finished, with the newest zoom there is, and the next change books
   * the next one.
   */
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


  // Every lane is scrubbable, not just the ruler. A waveform is the thing you
  // are actually looking at when you decide where to listen from, and reaching
  // back up to a strip at the top to act on it is the sort of gap that makes a
  // window feel like a diagram of a DAW rather than one.
  const scrub = onSeek
    ? (event: React.MouseEvent<HTMLCanvasElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        const place = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
        onSeek(from + place * (to - from), event.shiftKey);
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
