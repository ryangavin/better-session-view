import { useRef, type RefObject } from 'react';
import { rulingOf, TICKS_PER_BAR } from '../grid.ts';
import { barText, lengthText, snappedBar } from '../slices.ts';
import type { Mix } from '../state.ts';
import { barAt, placeOf } from '../warp.ts';
import { shows, under, type View } from '../zoom.ts';
import { QuietField } from './Editable.tsx';

/**
 * The slice ruler: the strip above the lanes you navigate by, and where the
 * arrangement is cut.
 *
 * Every slice is a span you click to go to the top of, with its name typed
 * straight into it. The cut at its left edge is a handle: drag it and the slice
 * starts somewhere else, drag it back onto the cut before it and the slice
 * goes. Double-click the empty part of a slice and it is cut in two under the
 * pointer.
 *
 * **A cut lands on the grid that is drawn.** There is no snap setting; the
 * ruling under the ruler already decides how fine the grid is at this zoom —
 * bars across a song, beats across a phrase, sixteenths across a bar — and a
 * cut goes to the nearest line of it. Zoomed out you cannot put a section on
 * a beat, which is right, because at that width you could not see that you
 * had. Zoom in and you can.
 */

/**
 * How far off screen a slice is allowed to be drawn.
 *
 * Zoomed in far enough, a slice sixty bars wide is a box tens of millions of
 * pixels across — past what a browser will lay out, and pointless besides,
 * since all but a window's worth of it is behind the clip. Anything outside
 * the view is dropped and what is left is trimmed to a screen either side.
 */
const OFF = 0.5;

export function Ruler({
  mix,
  view,
  timeline,
}: {
  mix: Mix;
  view: View;
  /** The element whose box is exactly the timeline, for geometry. */
  timeline: RefObject<HTMLDivElement | null>;
}) {
  const grid = mix.grid;
  const drag = useRef<{ index: number; pointer: number } | null>(null);

  /** The bar under a pointer, on the nearest line the ruler is drawing there. */
  const barUnder = (clientX: number): { bar: number; least: number } | null => {
    const box = timeline.current?.getBoundingClientRect();
    if (!box || box.width < 1) return null;
    const from = barAt(grid, view.from);
    const to = barAt(grid, view.from + 1 / view.zoom);
    const { step } = rulingOf(from, to, box.width);
    const place = under(view, (clientX - box.left) / box.width);
    return { bar: snappedBar(barAt(grid, place), step), least: step / TICKS_PER_BAR };
  };

  const take = (index: number) => (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, pointer: event.pointerId };
    mix.setActiveSlice(index);
  };

  const carry = (event: React.PointerEvent<HTMLElement>) => {
    const held = drag.current;
    if (!held) return;
    const at = barUnder(event.clientX);
    if (at) mix.moveSlice(held.index, at.bar, at.least);
  };

  const release = (event: React.PointerEvent<HTMLElement>) => {
    const held = drag.current;
    if (!held) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(held.pointer)) {
      event.currentTarget.releasePointerCapture(held.pointer);
    }
    // Dragged back onto the cut before it: a slice of no length is no slice.
    const slice = mix.slices[held.index];
    const before = mix.slices[held.index - 1];
    if (slice && before && slice.bar <= before.bar) mix.removeSlice(held.index);
  };

  const split = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const at = barUnder(event.clientX);
    if (at && at.bar > 0 && at.bar < mix.bars) mix.cutSlice(at.bar);
  };

  return (
    <div className="mf-ruler">
      {mix.slices.map((slice, i) => {
        const next = mix.slices[i + 1]?.bar ?? mix.bars;
        const starts = shows(view, placeOf(grid, slice.bar));
        const ends = shows(view, placeOf(grid, next));
        if (ends < -OFF || starts > 1 + OFF) return null;
        const left = Math.max(starts, -OFF);
        return (
          <div
            key={i}
            className="mf-slice"
            data-on={i === mix.activeSlice || undefined}
            style={{
              left: `${left * 100}%`,
              width: `${(Math.min(ends, 1 + OFF) - left) * 100}%`,
            }}
            onClick={(event) => {
              if ((event.target as HTMLElement).tagName !== 'INPUT') mix.pickSlice(i);
            }}
            onDoubleClick={split}
            title={`${slice.name} — bar ${barText(slice.bar)}, ${lengthText(next - slice.bar)} bars. Double-click to cut here`}
          >
            {i > 0 && (
              <span
                className="mf-slice-cut"
                role="separator"
                aria-label={`Where ${slice.name} starts`}
                title="Drag to move where this slice starts. Drag it onto the cut before it to remove the slice"
                onPointerDown={take(i)}
                onPointerMove={carry}
                onPointerUp={release}
                onPointerCancel={release}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              />
            )}
            <span className="mf-slice-num">{String(i + 1).padStart(2, '0')}</span>
            <QuietField
              value={slice.name}
              onCommit={(name) => mix.rename(i, name)}
              label={`Name of slice ${i + 1}`}
              className="mf-slice-name"
              required
            />
          </div>
        );
      })}
    </div>
  );
}
