import type { Param } from '../param/param.ts';
import { type FillOrigin } from './fill.ts';
import { type WidgetProps } from './Widget.tsx';
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
    travel?: number;
}
export declare function Knob({ param, value, onChange, onRelease, disabled, display, label, name, origin, showValue, travel, layout, className, title, }: KnobProps): import("react").JSX.Element;
