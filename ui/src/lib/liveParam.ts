import type { Param } from '../../../widgets/src/param/param.js';

/**
 * A Live parameter, read into the widget library's model of one.
 *
 * This adapter is the whole boundary. `widgets/` knows nothing about `BSV`,
 * the bridge or Live — it takes a `Param` and a number — and this is where the
 * app hands it one. Anything Live-specific about a control stops here.
 *
 * There is deliberately no `unit`. Live spells its own values through
 * `DeviceParameter.str_for_value` and the app already carries that text as
 * `display`, which every widget prefers over its own formatting. A unit style
 * chosen here would be a second conversion that has to keep agreeing with
 * Live's, and eventually wouldn't.
 */

const ABSENT: Param = { kind: 'float', min: 0, max: 1, defaultValue: 0 };

export function liveParam(
  state: BSV.MixerParameterState | null,
  bounds?: { min: number; max: number },
): Param {
  if (!state) return bounds ? { ...ABSENT, ...bounds } : ABSENT;
  return {
    kind: 'float',
    min: state.min,
    max: state.max,
    defaultValue: state.defaultValue,
  };
}
