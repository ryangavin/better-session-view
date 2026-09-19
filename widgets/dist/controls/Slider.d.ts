import type { Param } from '../param/param.ts';
import { type FillOrigin } from './fill.ts';
import { type WidgetProps } from './Widget.tsx';
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
export declare function Slider({ param, value, onChange, onRelease, depth, onDepth, live, disabled, display, label, name, orientation, origin, showValue, length, travel, layout, className, title, }: SliderProps): import("react").JSX.Element;
