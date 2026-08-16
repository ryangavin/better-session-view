import { fractionOf, type Param } from '../param/param.js';
import type { CSSProperties } from 'react';

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

/** How far off the middle zero may sit and still count as the middle. */
const CENTERED = 0.1;

/**
 * The default: from the middle when zero is the middle, else from `min`.
 *
 * Straddling zero is not the test. A volume fader runs -70 to +6 dB and so
 * straddles it, but 0 dB is near the top of the travel and Live fills that
 * fader from the bottom like any other level. What earns a center fill is zero
 * sitting where the middle is — pan, transpose, an EQ band's gain.
 */
export function defaultOrigin(param: Param): FillOrigin {
  if (param.min >= 0 || param.max <= 0) return 'min';
  return Math.abs(fractionOf(param, 0) - 0.5) <= CENTERED ? 'center' : 'min';
}

export function originFraction(param: Param, origin: FillOrigin): number {
  return origin === 'center' ? fractionOf(param, 0) : 0;
}

export function fillFrom(param: Param, origin: FillOrigin, fraction: number): CSSProperties {
  const from = originFraction(param, origin);
  return {
    '--wdg-fraction': fraction,
    '--wdg-fill-start': Math.min(fraction, from),
    '--wdg-fill-size': Math.abs(fraction - from),
  } as CSSProperties;
}
