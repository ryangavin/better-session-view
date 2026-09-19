import type { ReactNode } from 'react';
import { type ParamAnchor } from '../gesture/useParamGesture.ts';
import type { Param } from '../param/param.ts';
import { type WidgetProps } from './Widget.tsx';
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
export declare function XYPad({ x, y, width, height, showValue, anchor, disabled, label, name, layout, className, title, children, }: XYPadProps): import("react").JSX.Element;
