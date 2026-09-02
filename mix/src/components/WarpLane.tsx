import { useEffect, useRef, useState } from 'react';
import { rankOf, rulingOf, shaded, TICKS_PER_BAR } from '../grid.ts';
import { barAt, placeOf, type Bars, type Marker } from '../warp.ts';
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
  /** Where the bars fall on the file: bar 1 may be anywhere in it. */
  bars: Bars;
  height: number;
  /** Where the grid is pinned, in bars. */
  anchors: readonly { at: number; label: string }[];
  /** Where the audio is pinned to the grid, once something has pinned it. */
  markers?: readonly Marker[];
  /** The hits the fit listened to, in seconds, for a dragged marker to snap to. */
  hits?: readonly number[];
  /** A marker dragged to another second of the file. */
  onMove?(index: number, at: number): void;
  /** A double-click, as a fraction of the file: pin the audio here to the nearest bar. */
  onAdd?(place: number): void;
  onRemove?(index: number): void;
  /** A click, as a fraction of the file. */
  onPin?(place: number): void;
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

/** How close a dragged marker has to come to a hit to land on it, in pixels. */
const CATCH = 6;

/** A marker's name: the bar, and the beat where it is not on the one. */
const nameOf = (marker: Marker): string => {
  const whole = Math.floor(marker.bar + 1e-9);
  const beat = Math.round((marker.bar - whole) * 4) + 1;
  return beat === 1 ? String(whole + 1) : `${whole + 1}.${beat}`;
};

/** Whether a key press belongs to something being typed rather than to the lane. */
const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

export function WarpLane({
  onsets,
  bars,
  height,
  anchors,
  markers,
  hits,
  onMove,
  onAdd,
  onRemove,
  onPin,
  pinning,
  span,
}: WarpLaneProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const lane = useRef<HTMLDivElement | null>(null);
  /**
   * The marker a hand is on, for the delete key. Held here rather than in the
   * window's state because nothing else needs to know: it is a pin with a
   * ring round it, and it is gone the moment you click anywhere else.
   */
  const [selected, setSelected] = useState<number | null>(null);
  const drag = useRef<{ index: number; pointer: number } | null>(null);
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

      const beat = ink(el, '--bd', '#262629');
      const barLine = ink(el, '--idle', '#3a3a41');
      const tick = ink(el, '--detail', '#8b8b93');
      const sure = ink(el, '--green', '#5fbfa8');
      const caption = ink(el, '--caption', '#5e5e66');
      const block = ink(el, '--sel', '#1c1c20');

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
      // Everything on the strip is placed through the map, never by tick
      // arithmetic of its own: where a bar falls is the map's to say, and a
      // grid that bends between markers bends here the same way it does in
      // the lanes.
      const barFrom = barAt(bars, from);
      const barTo = barAt(bars, to);
      if (!(barTo > barFrom)) return;
      const atTick = (t: number) => xOf(placeOf(bars, t / TICKS_PER_BAR));
      const { step, first, last, shade, block: firstBlock } = rulingOf(barFrom, barTo, box.width);
      // The lanes' staggered blocks, carried up here so the band and the stack
      // agree about which one is lit. Neutral rather than a stem's colour: the
      // band belongs to the mix, not to any one source.
      ctx.fillStyle = block;
      for (let t = firstBlock; t <= last; t += shade) {
        if (!shaded(t, shade)) continue;
        const x = Math.round(atTick(t));
        ctx.fillRect(x, 0, Math.round(atTick(t + shade)) - x, height);
      }
      for (let t = first; t <= last; t += step) {
        const x = Math.round(atTick(t)) + 0.5;
        const rank = rankOf(t);
        const whole = rank === 'phrase' || rank === 'bar';
        ctx.fillStyle = whole ? barLine : beat;
        const tall = whole ? height : rank === 'beat' ? height * 0.45 : height * 0.26;
        ctx.fillRect(x, height - tall, 1, tall);
      }

      for (const onset of onsets) {
        const place = placeOf(bars, onset.at);
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
      const whole = barAt(bars, 1) - barAt(bars, 0);
      const perBar = box.width / (barTo - barFrom);
      while (every * perBar < 34 && every < whole) every *= 2;
      if (every * perBar > 34) {
        ctx.font = '500 9px ui-monospace, Menlo, monospace';
        ctx.fillStyle = caption;
        ctx.textBaseline = 'top';
        // Counting carries on past both ends of the song, downwards through
        // bar 1 into 0, -7, -15 — an arrangement's way of saying *before the
        // start*. It is the numbers that make the shaded region legible as
        // somewhere rather than as a margin.
        const start = Math.floor(barFrom / every) * every;
        for (let b = start; b < barTo + every; b += every) {
          ctx.fillText(String(b + 1), xOf(placeOf(bars, b)) + 4, 3);
        }
      }
    };

    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(el);
    return () => watch.disconnect();
  }, [onsets, bars, height, from, to]);

  useEffect(() => {
    if (selected !== null && (!markers || selected >= markers.length)) setSelected(null);
  }, [markers, selected]);

  // Backspace lets a selected marker go, and Escape lets go of the selection.
  // On the window rather than the lane, because a strip of canvas is not
  // something anybody expects to have to focus first — and not while a slice
  // is being named.
  useEffect(() => {
    if (selected === null) return;
    const key = (event: KeyboardEvent) => {
      if (typing(event.target)) return;
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        onRemove?.(selected);
        setSelected(null);
      } else if (event.key === 'Escape') {
        setSelected(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected, onRemove]);

  /** Where a pointer is, as a fraction of the file. */
  const placeAt = (clientX: number): number => {
    const box = (lane.current ?? canvas.current)!.getBoundingClientRect();
    return from + ((clientX - box.left) / box.width) * (to - from);
  };

  const place = (event: React.MouseEvent<HTMLDivElement>) => {
    setSelected(null);
    if (!onPin) return;
    onPin(placeAt(event.clientX));
  };

  const add = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onAdd || pinning) return;
    onAdd(placeAt(event.clientX));
  };

  /**
   * Dragging a pin moves its second of the file and keeps its bar, which is
   * Live's gesture exactly: the audio under the pointer is what is being said
   * to be that bar. It lands on a hit when it comes close to one — a kick is
   * nearly always what is meant — unless ⌥ is held, which is how you say it
   * is not.
   */
  const take = (index: number) => (event: React.PointerEvent<HTMLElement>) => {
    if (!onMove) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, pointer: event.pointerId };
    setSelected(index);
  };

  const carry = (event: React.PointerEvent<HTMLElement>) => {
    const held = drag.current;
    if (!held || !onMove || !(bars.seconds > 0)) return;
    const box = (lane.current ?? canvas.current)!.getBoundingClientRect();
    let at = placeAt(event.clientX) * bars.seconds;
    if (!event.altKey && hits) {
      let reach = (CATCH * (to - from) * bars.seconds) / box.width;
      for (const hit of hits) {
        const gap = Math.abs(hit - at);
        if (gap < reach) {
          reach = gap;
          at = hit;
        }
      }
    }
    onMove(held.index, at);
  };

  const release = (event: React.PointerEvent<HTMLElement>) => {
    const held = drag.current;
    if (!held) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(held.pointer)) {
      event.currentTarget.releasePointerCapture(held.pointer);
    }
  };

  const swallow = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <div
      ref={lane}
      className="mf-warplane"
      data-pinning={pinning || undefined}
      onClick={place}
      onDoubleClick={add}
      role="presentation"
    >
      <canvas ref={canvas} style={{ height }} />
      {markers?.map((marker, i) => {
        const where = (placeOf(bars, marker.bar) - from) / (to - from);
        if (where < -0.5 || where > 1.5) return null;
        return (
          <span
            key={`m${i}`}
            className="mf-marker"
            data-selected={selected === i || undefined}
            style={{ left: `${where * 100}%` }}
          >
            <i
              title={`Bar ${nameOf(marker)} is pinned to ${marker.at.toFixed(3)} s. Drag to move it; ⌥ to skip the hits; Backspace to let it go`}
              onPointerDown={take(i)}
              onPointerMove={carry}
              onPointerUp={release}
              onPointerCancel={release}
              onClick={swallow}
              onDoubleClick={swallow}
            >
              {nameOf(marker)}
            </i>
          </span>
        );
      })}
      {anchors.map((anchor, i) => {
        // Dropped rather than positioned when it is off screen: zoomed in, a
        // pin at the far end of the song is a `left` in the millions of per
        // cent, and the browser is being asked to lay out something nobody can
        // see.
        const where = (placeOf(bars, anchor.at) - from) / (to - from);
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
