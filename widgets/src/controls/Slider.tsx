import { useParamGesture } from '../gesture/useParamGesture.ts';
import type { Param } from '../param/param.ts';
import { defaultOrigin, fillFrom, type FillOrigin } from './fill.ts';
import { useWake, WAKE_MARKS } from './wake.ts';
import { Widget, type WidgetProps } from './Widget.tsx';
import './controls.css';

/** `live.slider`. The same gesture as the knob, laid out straight. */
export interface SliderProps extends WidgetProps {
  param: Param;
  value: number;
  onChange(next: number): void;
  onRelease?(): void;
  /**
   * How far something else may carry this control, signed, drawn as a span.
   *
   * With `onDepth`, holding shift drags this rather than the value. The span
   * runs from the value in the direction of the sign, so which side of the
   * mark it sits on *is* the polarity.
   */
  depth?: number;
  onDepth?(next: number): void;
  /**
   * Where the thing driving this control has it right now, 0 to 1.
   *
   * Drawn as a mark inside the span with a short trail behind it, so the row
   * answers *where is it* and *which way is it going* as well as *how far can
   * it go*. Left out, nothing is drawn — a control nobody is driving has no
   * such position and inventing one would be a lie.
   */
  live?: number;
  display?: string;
  /**
   * Which way the track runs, and so which way the drag goes.
   *
   * Not to be confused with `layout`, which is where the caption and the
   * reading sit. A horizontal fader with its caption above it is ordinary.
   */
  orientation?: 'vertical' | 'horizontal';
  /** Where the fill grows from. Defaults to the middle when zero is the middle. */
  origin?: FillOrigin;
  showValue?: boolean;
  /** Length along the axis, in px. The other dimension is fixed. */
  length?: number;
  travel?: number;
}

export function Slider({
  param,
  value,
  onChange,
  onRelease,
  depth,
  onDepth,
  live,
  disabled = false,
  display,
  label,
  name = param.shortName ?? param.name,
  orientation = 'vertical',
  origin = defaultOrigin(param),
  showValue = true,
  length = 27,
  travel,
  layout,
  className,
  title,
  ink,
}: SliderProps) {
  const gesture = useParamGesture({
    param,
    value,
    onChange,
    onRelease,
    depth,
    onDepth,
    disabled,
    axis: orientation,
    // `length` is the drawn extent, and gearing to it is right for a fader
    // whose size is its own. An `inside` one is stretched to whatever row it
    // landed in, so `length` describes nothing — 27 of them geared a 140px
    // control to 27px of drag, which is 4% of the range per pixel and a thumb
    // running five times ahead of the pointer. Fall through to the hook's own
    // travel instead, which is the 200px an unsized control assumes.
    travel: travel ?? (layout === 'inside' ? undefined : length),
    label: label ?? name,
    display,
  });

  // Where the range sits on the rail, or nothing to draw when it is a plain
  // control or its depth is zero.
  const reach = depth ?? 0;
  const far = Math.max(0, Math.min(1, gesture.fraction + reach));
  const span =
    onDepth === undefined || reach === 0
      ? null
      : { at: Math.min(gesture.fraction, far), size: Math.abs(far - gesture.fraction) };

  // **No range, no wake.** A driven control whose depth is zero is being
  // carried nowhere, so the trail would sit on top of the value's own mark and
  // say that a still row was moving.
  const wake = useWake({
    live: span === null ? undefined : live,
    // Only a row prints its reading inside itself, and the warmth is a thing
    // that happens to a printed number. A caption-and-readout column has the
    // reading somewhere else entirely.
    reading: layout === 'inside' ? gesture.text : undefined,
  });

  return (
    <Widget
      ref={wake}
      kind="slider"
      param={param}
      name={name}
      readout={showValue ? gesture.text : undefined}
      layout={layout}
      disabled={disabled}
      className={`wdg-slider-${orientation}${className ? ` ${className}` : ''}`}
      title={title}
      ink={ink}
      vars={{
        '--wdg-slider-length': `${length}px`,
        ...fillFrom(param, origin, gesture.fraction),
        // The span as a start and a width, both fractions, so the drawing is
        // two custom properties and no arithmetic in CSS. Clamped to the rail
        // because a range carried past the end still reads there, and stored
        // unclamped so it means something again when the value moves back.
        ...(span === null
          ? {}
          : { '--wdg-span-at': span.at, '--wdg-span-size': span.size, '--wdg-span-reach': far }),
        ...(live === undefined ? {} : { '--wdg-live': Math.max(0, Math.min(1, live)) }),
      }}
    >
      <div className="wdg-slider-body" {...gesture.props}>
        {/*
         * A row has no fill, and the reason is the whole of its drawing.
         *
         * A fill from zero is the shape of *how much*, and a parameter is a
         * *where* — so it invents a left-hand side that means nothing, and
         * then it is the loudest thing on the line while carrying the least.
         * On a row the value is a mark, and the range is the only filled
         * shape there is. A fader keeps its fill, because a fader's own
         * length is what it is saying.
         */}
        {layout !== 'inside' && <span className="wdg-slider-fill" aria-hidden="true" />}
        {span !== null && <span className="wdg-slider-span" aria-hidden="true" />}
        {span !== null && <span className="wdg-slider-reach" aria-hidden="true" />}
        {span !== null &&
          live !== undefined &&
          Array.from({ length: WAKE_MARKS }, (_unused, at) => (
            <span key={at} className="wdg-slider-wake" data-wake={at} aria-hidden="true" />
          ))}
        <span className="wdg-slider-thumb" aria-hidden="true" />
      </div>
    </Widget>
  );
}
