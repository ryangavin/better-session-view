import { fractionOf, type Param } from '../param/param.js';
import type { CSSProperties } from 'react';

/**
 * Where a value's fill starts and how far it runs.
 *
 * A control whose range straddles zero fills from the middle, because on one of
 * those the middle means something: a pan at center is not a pan turned all the
 * way down. Live draws the distinction and so does `live.dial`, which calls it
 * the needle mode.
 *
 * The arithmetic is here rather than in a `calc()` because CSS `abs()` is too
 * young to rely on, and because a knob, a slider and a value box asking the
 * same question should not answer it three times.
 */
export type FillOrigin = 'min' | 'center';

/** The default: from the middle when the range has two sides, else from `min`. */
export function defaultOrigin(param: Param): FillOrigin {
  return param.min < 0 && param.max > 0 ? 'center' : 'min';
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
