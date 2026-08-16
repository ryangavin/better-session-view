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
  disabled = false,
  display,
  label,
  name = param.shortName ?? param.name,
  orientation = 'vertical',
  origin = defaultOrigin(param),
  showValue = true,
  length = 96,
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
    disabled,
    axis: orientation,
    travel: travel ?? length,
    label: label ?? name,
    display,
  });

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
      }}
    >
      <div className="wdg-slider-body" {...gesture.props}>
        <span className="wdg-slider-fill" aria-hidden="true" />
        <span className="wdg-slider-thumb" aria-hidden="true" />
      </div>
    </Widget>
  );
}
