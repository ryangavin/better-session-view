import { type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { type Param } from '../param/param.ts';
/**
 * The one gesture every continuous control in a DAW shares.
 *
 * A knob, a fader, a number field and a send amount are the same interaction
 * wearing four faces: grab where you are, drag, hold a modifier for fine, let
 * go. Written per widget it is the same bug four times — which is what it was
 * here, across three `<input type="range">` elements that each jumped to the
 * click instead of grabbing, and two copies of the readback dance around them.
 *
 * So the widgets are skins and this is the control. Nothing below knows what a
 * knob looks like, and nothing in a widget re-derives what a drag means.
 */
export type ParamAxis = 'vertical' | 'horizontal';
/**
 * Where a drag starts from: the value the control already holds, or the point
 * that was pressed.
 *
 * `value` for everything with a knob's problem — a small control where jumping
 * to the click throws away most of the range. `pointer` for a surface where the
 * position *is* the value and the pointer is already pointing at one: a plane
 * you drop a handle onto, a long fader. Accrual after the anchor is identical
 * either way, so a control whose `travel` matches its drawn extent tracks the
 * pointer exactly, and the fine modifier still slows it from where it is.
 */
export type ParamAnchor = 'value' | 'pointer';
export interface ParamGestureOptions {
    param: Param;
    /** What the control currently holds. A drag anchors here and then ignores it. */
    value: number;
    /**
     * How far something else may carry this control from its value, signed.
     *
     * Given together with `onDepth`, holding shift turns the same drag into a
     * drag on *this* instead — so a range is set with the gesture that sets the
     * value, on the control the value is set on, rather than in a second place.
     * Left out, shift does nothing and the control is what it always was.
     */
    depth?: number;
    onDepth?(next: number): void;
    onChange(next: number): void;
    /** The gesture ended — the moment a host can stop preferring its local value. */
    onRelease?(): void;
    disabled?: boolean;
    axis?: ParamAxis;
    /** Defaults to `value` — Live grabs a control where it is rather than jumping. */
    anchor?: ParamAnchor;
    travel?: number;
    label?: string;
    /** Authoritative text, when something else is spelling the value. */
    display?: string;
}
export interface ParamSurfaceProps {
    role: 'slider';
    tabIndex: number;
    'aria-label': string | undefined;
    'aria-valuemin': number;
    'aria-valuemax': number;
    'aria-valuenow': number;
    'aria-valuetext': string;
    'aria-orientation': ParamAxis;
    'aria-disabled': true | undefined;
    'data-dragging': '' | undefined;
    onPointerDown(e: PointerEvent<HTMLElement>): void;
    onPointerMove(e: PointerEvent<HTMLElement>): void;
    onPointerUp(e: PointerEvent<HTMLElement>): void;
    onPointerCancel(e: PointerEvent<HTMLElement>): void;
    onDoubleClick(e: MouseEvent<HTMLElement>): void;
    onKeyDown(e: KeyboardEvent<HTMLElement>): void;
}
export interface ParamGesture {
    dragging: boolean;
    /** Where the value sits on the control, 0 to 1, tapered. */
    fraction: number;
    /** What to print: the authoritative text if there is one, else our own. */
    text: string;
    props: ParamSurfaceProps;
}
export declare function useParamGesture(options: ParamGestureOptions): ParamGesture;
