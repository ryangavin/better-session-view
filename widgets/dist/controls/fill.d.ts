import { type Param } from '../param/param.ts';
import type { WidgetVars } from './Widget.tsx';
/**
 * Where a value's fill starts and how far it runs.
 *
 * A control whose zero sits at the middle of its travel fills from there,
 * because on one of those the middle means something: a pan at center is not a
 * pan turned all the way down. Live draws the distinction and so does
 * `live.dial`, which calls it the needle mode.
 *
 * The arithmetic is here rather than in a `calc()` because CSS `abs()` is too
 * young to rely on, and because a knob, a slider and a value box asking the
 * same question should not answer it three times.
 */
export type FillOrigin = 'min' | 'center';
/**
 * The default: from the middle when zero is the middle, else from `min`.
 *
 * Straddling zero is not the test. A volume fader runs -70 to +6 dB and so
 * straddles it, but 0 dB is near the top of the travel and Live fills that
 * fader from the bottom like any other level. What earns a center fill is zero
 * sitting where the middle is — pan, transpose, an EQ band's gain.
 */
export declare function defaultOrigin(param: Param): FillOrigin;
export declare function originFraction(param: Param, origin: FillOrigin): number;
export declare function fillFrom(param: Param, origin: FillOrigin, fraction: number): WidgetVars;
