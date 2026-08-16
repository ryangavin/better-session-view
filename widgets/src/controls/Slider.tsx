import type { CSSProperties } from 'react';
import { useParamGesture } from '../gesture/useParamGesture.js';
import type { Param } from '../param/param.js';
import { defaultOrigin, fillFrom, type FillOrigin } from './fill.js';
import './controls.css';

/** `live.slider`. The same gesture as the knob, laid out straight. */
export interface SliderProps {
  param: Param;
  value: number;
  onChange(next: number): void;
  onRelease?(): void;
  disabled?: boolean;
  display?: string;
  label?: string;
  name?: string;
  orientation?: 'vertical' | 'horizontal';
  /** Where the fill grows from. Defaults to the middle when zero is the middle. */
  origin?: FillOrigin;
  showValue?: boolean;
  /** Length along the axis, in px. The other dimension is fixed. */
  length?: number;
  travel?: number;
  className?: string;
  title?: string;
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
    <div
      className={`wdg wdg-slider wdg-slider-${orientation}${className ? ` ${className}` : ''}`}
      style={
        {
          '--wdg-slider-length': `${length}px`,
          ...fillFrom(param, origin, gesture.fraction),
        } as CSSProperties
      }
    >
      {name && <span className="wdg-caption">{name}</span>}
      <div className="wdg-slider-body" title={title} {...gesture.props}>
        <span className="wdg-slider-fill" aria-hidden="true" />
        <span className="wdg-slider-thumb" aria-hidden="true" />
      </div>
      {showValue && <span className="wdg-readout">{gesture.text}</span>}
    </div>
  );
}
