import { useMemo, type CSSProperties } from 'react';
import { widestText } from '../param/format.ts';
import type { Param } from '../param/param.ts';

/**
 * Space for the longest reading the parameter has, held whatever it reads now.
 *
 * A control is a fixed thing on a panel. It should be the size it is because of
 * what it can say, not because of what it happens to be saying — otherwise the
 * value box grows mid-drag and every control to its right steps sideways, which
 * is exactly when someone is trying to read one of them.
 *
 * The measure is characters rather than pixels: the readouts are mono and
 * tabular, so `ch` is the character advance, and the widgets can reserve space
 * in the host's font at the host's size without measuring anything. Negative
 * letter-spacing means the reservation is a hair generous, which is the right
 * way to be wrong.
 *
 * Recomputed only when the parameter itself changes, never as the value moves.
 * A control with no parameter to ask — a switch, a tab strip — reserves nothing.
 */
export function useReserved(param?: Param): CSSProperties {
  return useMemo(
    () => (param ? ({ '--wdg-chars': widestText(param) } as CSSProperties) : {}),
    [param],
  );
}
