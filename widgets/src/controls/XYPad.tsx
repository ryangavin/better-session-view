import type { PointerEvent, ReactNode } from 'react';
import { useParamGesture } from '../gesture/useParamGesture.js';
import type { Param } from '../param/param.js';
import { Widget, type WidgetProps } from './Widget.js';
import './controls.css';

/**
 * A plane two parameters are dragged on at once — Live's X-Y control, and the
 * surface its filter and EQ displays are built over.
 *
 * **One pointer, two gestures.** The plane doesn't know how to drag; it calls
 * [`useParamGesture`](../gesture/useParamGesture.ts) once per axis and hands
 * both the same pointer, so the fine modifier, the write rate, the anchor and
 * the reset are the ones every other control has rather than a second drag that
 * has to be kept in step with them. An axis is a `Param` and a number, exactly
 * as a knob's is; two of them is the only thing new here.
 *
 * **The artwork is the caller's.** `children` are drawn behind the handle, and
 * a device's response curve, filter shape or grid goes there — the plane
 * supplies the geometry and the gesture and stays ignorant of what's under it.
 * That is the line that keeps this a widget: an EQ curve is one device's idea
 * of what a plane means, and this module knows about no device.
 */
export interface PadAxis {
  param: Param;
  value: number;
  onChange(next: number): void;
  onRelease?(): void;
  /** Authoritative text — Live's own `str_for_value`, where there is a Live. */
  display?: string;
  /** Drag distance for the full range. Defaults to the plane's own extent. */
  travel?: number;
}

export interface XYPadProps extends WidgetProps {
  x: PadAxis;
  y: PadAxis;
  width?: number;
  height?: number;
  /** Both readings under the plane, the way a knob prints its one. */
  showValue?: boolean;
  /** Drawn behind the handle, in the plane's own box. */
  children?: ReactNode;
}

/** Both axes see every pointer event; each keeps only its own component of it. */
function pair<E>(a: (e: E) => void, b: (e: E) => void) {
  return (e: E) => {
    a(e);
    b(e);
  };
}

function axisLabel(axis: PadAxis, fallback: string) {
  return axis.param.shortName ?? axis.param.name ?? fallback;
}

export function XYPad({
  x,
  y,
  width = 120,
  height = 120,
  showValue = true,
  disabled = false,
  label,
  name,
  layout,
  className,
  title,
  children,
}: XYPadProps) {
  const gx = useParamGesture({
    param: x.param,
    value: x.value,
    onChange: x.onChange,
    onRelease: x.onRelease,
    disabled,
    axis: 'horizontal',
    travel: x.travel ?? width,
    label: axisLabel(x, 'X'),
    display: x.display,
  });
  const gy = useParamGesture({
    param: y.param,
    value: y.value,
    onChange: y.onChange,
    onRelease: y.onRelease,
    disabled,
    axis: 'vertical',
    travel: y.travel ?? height,
    label: axisLabel(y, 'Y'),
    display: y.display,
  });

  return (
    <Widget
      kind="xypad"
      name={name}
      readout={showValue ? `${gx.text} · ${gy.text}` : undefined}
      layout={layout}
      disabled={disabled}
      className={className}
      title={title}
      vars={{
        '--wdg-xypad-width': `${width}px`,
        '--wdg-xypad-height': `${height}px`,
        '--wdg-xypad-x': gx.fraction,
        '--wdg-xypad-y': gy.fraction,
      }}
    >
      {/*
        The plane takes the pointer and the two axes take the keyboard. Tabbing
        lands on one axis at a time, which is what makes the arrow keys mean
        something on a control with two of them — and it costs nothing, because
        each of those elements is a `role="slider"` with the full `aria-value*`
        set that every other control already has.
      */}
      <div
        className="wdg-xypad-body"
        role="group"
        aria-label={label ?? name}
        onPointerDown={pair<PointerEvent<HTMLElement>>(
          gx.props.onPointerDown,
          gy.props.onPointerDown,
        )}
        onPointerMove={pair<PointerEvent<HTMLElement>>(
          gx.props.onPointerMove,
          gy.props.onPointerMove,
        )}
        onPointerUp={pair<PointerEvent<HTMLElement>>(gx.props.onPointerUp, gy.props.onPointerUp)}
        onPointerCancel={pair<PointerEvent<HTMLElement>>(
          gx.props.onPointerCancel,
          gy.props.onPointerCancel,
        )}
        onDoubleClick={() => {
          gx.props.onDoubleClick();
          gy.props.onDoubleClick();
        }}
      >
        {children !== undefined && <div className="wdg-xypad-art">{children}</div>}
        <span className="wdg-xypad-handle" aria-hidden="true" />
        <span className="wdg-xypad-axis" {...gx.props} />
        <span className="wdg-xypad-axis" {...gy.props} />
      </div>
    </Widget>
  );
}
