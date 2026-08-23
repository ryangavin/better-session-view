import { useParamGesture } from '../gesture/useParamGesture.js';
import type { Param } from '../param/param.js';
import { defaultOrigin, fillFrom, type FillOrigin } from './fill.js';
import { Widget, type WidgetProps } from './Widget.js';
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
   * Drawn as a bright pip inside the span, so the row answers *where is it*
   * as well as *how far can it go*. Left out, nothing is drawn — a control
   * nobody is driving has no such position and inventing one would be a lie.
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

  return (
    <Widget
      kind="slider"
      param={param}
      name={name}
      readout={showValue ? gesture.text : undefined}
      layout={layout}
      disabled={disabled}
      className={`wdg-slider-${orientation}${className ? ` ${className}` : ''}`}
      title={title}
      vars={{
        '--wdg-slider-length': `${length}px`,
        ...fillFrom(param, origin, gesture.fraction),
        // The span as a start and a width, both fractions, so the drawing is
        // two custom properties and no arithmetic in CSS. Clamped to the rail
        // because a range carried past the end still reads there, and stored
        // unclamped so it means something again when the value moves back.
        ...(span === null
          ? {}
          : { '--wdg-span-at': span.at, '--wdg-span-size': span.size }),
        ...(live === undefined ? {} : { '--wdg-live': Math.max(0, Math.min(1, live)) }),
      }}
    >
      <div className="wdg-slider-body" {...gesture.props}>
        <span className="wdg-slider-fill" aria-hidden="true" />
        {span !== null && <span className="wdg-slider-span" aria-hidden="true" />}
        {live !== undefined && <span className="wdg-slider-live" aria-hidden="true" />}
        <span className="wdg-slider-thumb" aria-hidden="true" />
      </div>
    </Widget>
  );
}
