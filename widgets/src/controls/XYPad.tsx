import type { PointerEvent, ReactNode } from 'react';
import { useParamGesture, type ParamAnchor } from '../gesture/useParamGesture.ts';
import type { Param } from '../param/param.ts';
import { Widget, type WidgetProps } from './Widget.tsx';
import './controls.css';

/**
 * A plane two parameters are dragged on at once — Live's X-Y control, and the
 * surface its filter and EQ displays are built over.
 *
 * **One pointer, two gestures.** The plane doesn't know how to drag; it calls
 * [`useParamGesture`](../gesture/useParamGesture.ts) once per axis and hands
 * both the same pointer, so the fine modifier, the write rate and the reset are
 * the ones every other control has rather than a second drag that has to be
 * kept in step with them. An axis is a `Param` and a number, exactly as a
 * knob's is; two of them is the only thing new here.
 *
 * **The handle goes where you press**, which is the one place a plane parts
 * company with a knob. Everything small anchors at its current value, because
 * jumping to the click throws away most of a 26px control's range — but here
 * the pointer is already pointing at a position, and a handle that stays put
 * when you press somewhere else reads as a control that isn't listening. Only
 * the anchor differs; the accrual after it is the same, and because `travel`
 * defaults to the plane's own extent the handle then tracks the pointer exactly.
 * A caller that wants the knob's bargain instead passes `anchor="value"`, which
 * is what a plane full of handles will want when one of them is grabbed.
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
  /** Where a press starts the drag. Defaults to the point pressed. */
  anchor?: ParamAnchor;
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
  anchor = 'pointer',
  disabled = false,
  label,
  name,
  layout,
  className,
  title,
  ink,
  children,
}: XYPadProps) {
  const gx = useParamGesture({
    param: x.param,
    value: x.value,
    onChange: x.onChange,
    onRelease: x.onRelease,
    disabled,
    axis: 'horizontal',
    anchor,
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
    anchor,
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
      ink={ink}
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
        onDoubleClick={(e) => {
          gx.props.onDoubleClick(e);
          gy.props.onDoubleClick(e);
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
