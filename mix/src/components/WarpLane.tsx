import { useEffect, useRef } from 'react';
import { rankOf, ruleEvery, TICKS_PER_BAR } from '../grid.ts';
import type { Span } from '../zoom.ts';
/**
 * An onset placed in bar space, which is the grid's claim about it rather than
 * a property of the audio. `state.ts` does that placing, so these move when the
 * tempo does — which is the whole point of the lane.
 */
interface Onset {
  at: number;
  strength: number;
  downbeat: boolean;
}

/**
 * Where the grid meets the audio.
 *
 * The bar lines are the grid's claim and the ticks are what the audio actually
 * did, drawn on one strip so a disagreement between them is visible rather
 * than something you infer from a stem lane four rows down. A tempo that is a
 * fraction off does not look wrong at bar 2 and is unmistakable by bar 60,
 * which is why this is full width and not a detail view.
 *
 * Green is a tick detection believes starts a bar. When the green ones sit on
 * the bright lines the grid is right, and when they walk off them it is not.
 */
export interface WarpLaneProps {
  onsets: readonly Onset[];
  bars: number;
  height: number;
  /** Where the user has pinned the grid, in bars. */
  anchors: readonly { at: number; label: string }[];
  onPin?(at: number): void;
  /** Manual mode: the pointer is placing a point rather than scrubbing. */
  pinning?: boolean;
  /**
   * Which slice of the track to draw, as fractions — the whole of it by
   * default, and whatever the lanes are zoomed into otherwise.
   *
   * This is the lane the zoom is *for*: a grid a fraction out is unmistakable
   * at bar 60 and unfixable until you can see the ticks either side of one bar
   * line, which at whole-track width are the same pixel.
   */
  span?: Span;
}

const ink = (el: HTMLElement, name: string, fallback: string): string =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

const WHOLE: Span = { from: 0, to: 1 };

export function WarpLane({ onsets, bars, height, anchors, onPin, pinning, span }: WarpLaneProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const from = span?.from ?? WHOLE.from;
  const to = span?.to ?? WHOLE.to;

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

      const beat = ink(el, '--sel', '#1c1c20');
      const barLine = ink(el, '--idle', '#3a3a41');
      const tick = ink(el, '--detail', '#8b8b93');
      const sure = ink(el, '--green', '#5fbfa8');
      const caption = ink(el, '--caption', '#5e5e66');

      // The width the whole track would have at this zoom. Nothing is drawn
      // that wide: it is what turns a position in the track into an x on a
      // canvas holding a slice of it.
      const track = box.width / (to - from);
      const left = from * track;
      const xOf = (fraction: number) => fraction * track - left;

      // The same ruling the lanes use — `grid.ts` — so the strip that judges
      // the grid and the strip the grid is judged *against* cannot disagree
      // about where a beat is. Bars run the full height, beats most of it, and
      // anything finer a short tick: height is what separates them here, rather
      // than a third colour in a 24px strip.
      //
      // It thins the same way, too. Five hundred beat lines across nine hundred
      // pixels is not a grid, it is a grey wash with a tick rate — and not
      // clamped to the track at either end, because zoomed out there is time on
      // screen that is not in the song and the grid runs through it.
      const ticks = bars * TICKS_PER_BAR;
      const step = ruleEvery(track / ticks);
      const first = Math.floor((from * ticks) / step) * step;
      const last = Math.ceil(to * ticks);
      for (let t = first; t <= last; t += step) {
        const x = Math.round(xOf(t / ticks)) + 0.5;
        const rank = rankOf(t);
        const whole = rank === 'phrase' || rank === 'bar';
        ctx.fillStyle = whole ? barLine : beat;
        const tall = whole ? height : rank === 'beat' ? height * 0.45 : height * 0.26;
        ctx.fillRect(x, height - tall, 1, tall);
      }

      for (const onset of onsets) {
        const place = onset.at / bars;
        if (place < from || place > to) continue;
        const x = xOf(place);
        ctx.globalAlpha = onset.downbeat ? 0.25 + 0.6 * onset.strength : 0.16 + 0.5 * onset.strength;
        ctx.fillStyle = onset.downbeat ? sure : tick;
        const tall = height * 0.56 * (0.35 + 0.65 * onset.strength);
        ctx.fillRect(x, height - tall - 1, onset.downbeat ? 2 : 1, tall);
      }
      ctx.globalAlpha = 1;

      // Numbered every eight bars, and only where eight bars is wide enough to
      // hold a number with air around it. Sixteen numbers in a 24px strip is a
      // grey band, and the point of a number is to be countable from — the
      // slice ruler directly above is what you actually navigate by.
      // Every eight bars where that is legible, then sixteen, then thirty-two.
      // A four-minute track has a hundred and change of them and the old fixed
      // eight would have printed sixteen numbers into a 24px strip.
      let every = 8;
      while ((every / bars) * track < 34 && every < bars) every *= 2;
      if ((every / bars) * track > 34) {
        ctx.font = '500 9px ui-monospace, Menlo, monospace';
        ctx.fillStyle = caption;
        ctx.textBaseline = 'top';
        // Counting carries on past both ends of the song, downwards through
        // bar 1 into 0, -7, -15 — an arrangement's way of saying *before the
        // start*. It is the numbers that make the shaded region legible as
        // somewhere rather than as a margin.
        const start = Math.floor((from * bars) / every) * every;
        for (let b = start; b < to * bars + every; b += every) {
          ctx.fillText(String(b + 1), xOf(b / bars) + 4, 3);
        }
      }
    };

    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(el);
    return () => watch.disconnect();
  }, [onsets, bars, height, from, to]);

  const place = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onPin) return;
    const box = event.currentTarget.getBoundingClientRect();
    const across = (event.clientX - box.left) / box.width;
    onPin((from + across * (to - from)) * bars);
  };

  return (
    <div
      className="mf-warplane"
      data-pinning={pinning || undefined}
      onClick={place}
      role="presentation"
    >
      <canvas ref={canvas} style={{ height }} />
      {anchors.map((anchor, i) => {
        // Dropped rather than positioned when it is off screen: zoomed in, a
        // pin at the far end of the song is a `left` in the millions of per
        // cent, and the browser is being asked to lay out something nobody can
        // see.
        const where = (anchor.at / bars - from) / (to - from);
        if (where < -0.5 || where > 1.5) return null;
        return (
          <span
            key={i}
            className="mf-anchor"
            style={{ left: `${where * 100}%` }}
            title={`Bar ${anchor.label} is pinned here`}
          >
            <i>{anchor.label}</i>
          </span>
        );
      })}
    </div>
  );
}
