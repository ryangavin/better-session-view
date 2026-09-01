import { useEffect, useRef } from 'react';
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
}

const ink = (el: HTMLElement, name: string, fallback: string): string =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

export function WarpLane({ onsets, bars, height, anchors, onPin, pinning }: WarpLaneProps) {
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

      const beat = ink(el, '--sel', '#1c1c20');
      const barLine = ink(el, '--idle', '#3a3a41');
      const tick = ink(el, '--detail', '#8b8b93');
      const sure = ink(el, '--green', '#5fbfa8');
      const caption = ink(el, '--caption', '#5e5e66');

      // Beats where beats fit, bars where they do not, and every fourth bar
      // once even those are crowding. A real track is a hundred-odd bars, and
      // five hundred beat lines across nine hundred pixels is not a grid — it
      // is a grey wash with a tick rate. Stepping in fours keeps whatever
      // survives on a musical boundary rather than on an arbitrary one.
      const beats = bars * 4;
      let step = 1;
      while ((step / beats) * box.width < 3 && step < beats) step *= 4;
      for (let b = 0; b <= beats; b += step) {
        const x = Math.round((b / beats) * box.width) + 0.5;
        const isBar = b % 4 === 0;
        ctx.fillStyle = isBar ? barLine : beat;
        ctx.fillRect(x, isBar ? 0 : height * 0.55, 1, isBar ? height : height * 0.45);
      }

      for (const onset of onsets) {
        const x = (onset.at / bars) * box.width;
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
      while ((every / bars) * box.width < 34 && every < bars) every *= 2;
      if ((every / bars) * box.width > 34) {
        ctx.font = '500 9px ui-monospace, Menlo, monospace';
        ctx.fillStyle = caption;
        ctx.textBaseline = 'top';
        for (let b = 0; b < bars; b += every) {
          ctx.fillText(String(b + 1), (b / bars) * box.width + 4, 3);
        }
      }
    };

    paint();
    const watch = new ResizeObserver(paint);
    watch.observe(el);
    return () => watch.disconnect();
  }, [onsets, bars, height]);

  const place = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onPin) return;
    const box = event.currentTarget.getBoundingClientRect();
    onPin(((event.clientX - box.left) / box.width) * bars);
  };

  return (
    <div
      className="mf-warplane"
      data-pinning={pinning || undefined}
      onClick={place}
      role="presentation"
    >
      <canvas ref={canvas} style={{ height }} />
      {anchors.map((anchor, i) => (
        <span
          key={i}
          className="mf-anchor"
          style={{ left: `${(anchor.at / bars) * 100}%` }}
          title={`Bar ${anchor.label} is pinned here`}
        >
          <i>{anchor.label}</i>
        </span>
      ))}
    </div>
  );
}
