import type { CSSProperties } from 'react';
import { useParamGesture } from '../gesture/useParamGesture.js';
import type { Param } from '../param/param.js';
import { dialAngle, dialArc, dialPoint } from './arc.js';
import { defaultOrigin, originFraction, type FillOrigin } from './fill.js';
import { useReserved } from './reserve.js';
import './controls.css';

/** `live.dial`, and the control most of an Ableton device is made of. */
export interface KnobProps {
  param: Param;
  value: number;
  onChange(next: number): void;
  onRelease?(): void;
  disabled?: boolean;
  /** Authoritative text — Live's own `str_for_value`, where there is a Live. */
  display?: string;
  /** For assistive technology. Defaults to the printed caption. */
  label?: string;
  /** The printed caption. Defaults to the parameter's own short name. */
  name?: string;
  /**
   * Where the filled arc grows from. `live.dial` calls this the needle mode;
   * the default reads it off the range, since a control whose zero sits at the
   * middle of its travel is one whose middle means something.
   */
  origin?: FillOrigin;
  showValue?: boolean;
  size?: number;
  travel?: number;
  className?: string;
  title?: string;
}

export function Knob({
  param,
  value,
  onChange,
  onRelease,
  disabled = false,
  display,
  label,
  name = param.shortName ?? param.name,
  origin = defaultOrigin(param),
  showValue = true,
  size = 34,
  travel,
  className,
  title,
}: KnobProps) {
  const gesture = useParamGesture({
    param,
    value,
    onChange,
    onRelease,
    disabled,
    axis: 'vertical',
    travel,
    label: label ?? name,
    display,
  });

  const reserved = useReserved(param);
  const angle = dialAngle(gesture.fraction);
  const from = dialAngle(originFraction(param, origin));
  const fill = dialArc(from, angle);
  const [nx, ny] = dialPoint(angle, 6);
  const [mx, my] = dialPoint(angle, 13.5);

  return (
    <div
      className={`wdg wdg-knob${className ? ` ${className}` : ''}`}
      style={{ ...reserved, '--wdg-knob-size': `${size}px` } as CSSProperties}
    >
      {name && <span className="wdg-caption">{name}</span>}
      <div className="wdg-knob-dial wdg-body" title={title} {...gesture.props}>
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path className="wdg-knob-empty" d={dialArc(dialAngle(0), dialAngle(1)) ?? undefined} />
          {fill && <path className="wdg-knob-fill" d={fill} />}
          <line className="wdg-knob-marker" x1={nx} y1={ny} x2={mx} y2={my} />
        </svg>
      </div>
      {showValue && <span className="wdg-readout">{gesture.text}</span>}
    </div>
  );
}
