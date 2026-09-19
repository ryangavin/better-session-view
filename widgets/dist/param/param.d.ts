/**
 * What a parameter is, independent of anything that draws it.
 *
 * Every control on an Ableton device is a rendering of one of four things. That
 * isn't a guess: it's the contract Max for Live publishes in its parameter
 * inspector — type (Int, Float, Enum, Blob), range, unit style, exponential
 * scaling, steps, initial value — and the same shape the Live Object Model
 * exposes as `DeviceParameter` (`value`, `min`, `max`, `default_value`,
 * `is_enabled`, `str_for_value`).
 *
 * So this file is the thing the widget library is actually built on, and a knob
 * is a skin over it. Adding a widget should not require adding anything here.
 *
 * Nothing in this module knows about Live, the bridge, or the protocol. A Param
 * is built by whoever has the data; `widgets/` only ever reads one.
 */
/** Live's four parameter types. `blob` is a list and is not automatable. */
export type ParamKind = 'float' | 'int' | 'enum' | 'blob';
/**
 * How a value is spelled. Max for Live's built-in display styles, verbatim —
 * these are the ones Ableton's own devices choose between.
 */
export type UnitStyle = 'native' | 'int' | 'float' | 'time' | 'hertz' | 'decibel' | 'percent' | 'pan' | 'semitones' | 'midi' | 'custom';
export interface Param {
    readonly kind: ParamKind;
    readonly min: number;
    readonly max: number;
    /** Where a reset lands. `DeviceParameter.default_value`. */
    readonly defaultValue: number;
    readonly unit?: UnitStyle;
    /** A bare symbol (`Voices`) or a sprintf-style string (`%0.2f Bogons`). */
    readonly customUnit?: string;
    /** Exponential scaling. 1 is linear; above 1 gives the low end more travel. */
    readonly exponent?: number;
    /** How many values are reachable across the range. Below 2 means continuous. */
    readonly steps?: number;
    /** The members, for `enum`. The value is an index into this. */
    readonly items?: readonly string[];
    readonly name?: string;
    readonly shortName?: string;
}
/** Guarded, so a degenerate parameter divides by 1 rather than by 0. */
export declare function span(p: Param): number;
/**
 * Only NaN is refused outright. An infinite value clamps like any other, which
 * is what lets a decibel parameter whose floor is silence keep reading `-inf`
 * rather than being quietly pulled up to a finite minimum.
 */
export declare function clamp(p: Param, value: number): number;
/**
 * Snap to what the parameter can actually hold.
 *
 * Steps count *values*, not intervals, which is why the divisor is one less:
 * Max's own example is a 0–64 range with 4 steps reaching 0, 21.33, 42.66 and
 * 64. Steps are measured on the linear position, so the reachable values stay
 * evenly spaced however the control is tapered.
 */
export declare function quantize(p: Param, value: number): number;
/** Where a value sits on its control, 0 at `min` and 1 at `max`, tapered. */
export declare function fractionOf(p: Param, value: number): number;
/** The inverse: a position on the control back to a value the parameter holds. */
export declare function valueAt(p: Param, fraction: number): number;
/**
 * How far one arrow key moves.
 *
 * A quantized parameter moves by exactly one of its own values, so the keyboard
 * can reach every setting and can't land between two of them. Everything else
 * gets a hundredth of its range, or a thousandth held fine.
 */
export declare function stepSize(p: Param, fine?: boolean): number;
/** True when the parameter is a two-state switch, whatever its declared kind. */
export declare function isSwitch(p: Param): boolean;
/** An enumerated parameter over its members, addressed by index. */
export declare function enumParam(items: readonly string[], options?: {
    defaultIndex?: number;
    name?: string;
}): Param;
