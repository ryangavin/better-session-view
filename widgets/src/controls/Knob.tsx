import { useParamGesture } from '../gesture/useParamGesture.js';
import type { Param } from '../param/param.js';
import {
  DIAL_VIEWBOX_HEIGHT,
  DIAL_VIEWBOX_TOP,
  dialAngle,
  dialArc,
  dialPoint,
} from './arc.js';
import { defaultOrigin, originFraction, type FillOrigin } from './fill.js';
import { Widget, type WidgetProps } from './Widget.js';
import './controls.css';

/** `live.dial`, and the control most of an Ableton device is made of. */
export interface KnobProps extends WidgetProps {
  param: Param;
  value: number;
  onChange(next: number): void;
  onRelease?(): void;
  /** Authoritative text — Live's own `str_for_value`, where there is a Live. */
  display?: string;
  /**
   * Where the filled arc grows from. `live.dial` calls this the needle mode;
   * the default reads it off the range, since a control whose zero sits at the
   * middle of its travel is one whose middle means something.
   */
  origin?: FillOrigin;
  showValue?: boolean;
  size?: number;
  travel?: number;
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
  layout,
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

  const angle = dialAngle(gesture.fraction);
  const from = dialAngle(originFraction(param, origin));
  const fill = dialArc(from, angle);
  const [nx, ny] = dialPoint(angle, 6);
  const [mx, my] = dialPoint(angle, 13.5);
  const height = Math.round((size * DIAL_VIEWBOX_HEIGHT) / 40);

  return (
    <Widget
      kind="knob"
      param={param}
      name={name}
      readout={showValue ? gesture.text : undefined}
      layout={layout}
      disabled={disabled}
      className={className}
      title={title}
      vars={{ '--wdg-knob-size': `${size}px`, '--wdg-knob-height': `${height}px` }}
    >
      <div className="wdg-knob-dial" {...gesture.props}>
        <svg viewBox={`0 ${DIAL_VIEWBOX_TOP} 40 ${DIAL_VIEWBOX_HEIGHT}`} aria-hidden="true">
          <path className="wdg-knob-empty" d={dialArc(dialAngle(0), dialAngle(1)) ?? undefined} />
          {fill && <path className="wdg-knob-fill" d={fill} />}
          <line className="wdg-knob-marker" x1={nx} y1={ny} x2={mx} y2={my} />
        </svg>
      </div>
    </Widget>
  );
}
