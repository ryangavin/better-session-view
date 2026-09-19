import { type Param } from '../param/param.ts';
import { type FillOrigin } from './fill.ts';
import './controls.css';
/** `live.numbox`: drag it like a fader, or type into it. */
export interface NumberFieldProps {
    param: Param;
    value: number;
    onChange(next: number): void;
    onRelease?(): void;
    disabled?: boolean;
    display?: string;
    label?: string;
    name?: string;
    /** Typing a digit or pressing Enter opens the editor. Never for an enum. */
    editable?: boolean;
    /** The value drawn as a bar behind the text, as Live's own value boxes do. */
    showFill?: boolean;
    /** Where that bar grows from. Defaults to the middle when zero is the middle. */
    origin?: FillOrigin;
    /** In px. Defaults to the parameter's longest reading, so it never resizes. */
    width?: number;
    travel?: number;
    className?: string;
    title?: string;
}
export declare function NumberField({ param, value, onChange, onRelease, disabled, display, label, name, editable, showFill, origin, width, travel, className, title, }: NumberFieldProps): import("react").JSX.Element;
