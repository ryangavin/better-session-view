/**
 * The whole library, for consumers that want it in one import.
 *
 * Importing this pulls every control's stylesheet in with it. Anything reaching
 * for the model or the gesture alone — the app's mixer does — should import the
 * file it needs instead, the same way `ui/` reaches into `core/src/`.
 */

export {
  clamp,
  enumParam,
  fractionOf,
  isSwitch,
  quantize,
  span,
  stepSize,
  valueAt,
  type Param,
  type ParamKind,
  type UnitStyle,
} from './param/param.js';
export { format, noteName, widestText } from './param/format.js';

export {
  useParamGesture,
  type ParamAxis,
  type ParamGesture,
  type ParamGestureOptions,
  type ParamSurfaceProps,
} from './gesture/useParamGesture.js';
export { usePendingValue, readbackTolerance, type PendingValue } from './gesture/usePendingValue.js';
export { FINE_KEY, isFine } from './gesture/platform.js';

export { defaultOrigin, fillFrom, originFraction, type FillOrigin } from './controls/fill.js';
export { useReserved } from './controls/reserve.js';
export { Knob, type KnobProps } from './controls/Knob.js';
export { Slider, type SliderProps } from './controls/Slider.js';
export { NumberField, type NumberFieldProps } from './controls/NumberField.js';
export { Toggle, type ToggleProps } from './controls/Toggle.js';
export { Segmented, itemsOf, type SegmentedProps } from './controls/Segmented.js';
export { Divider, Label, type LabelProps } from './controls/Label.js';

export { Device, type DeviceProps } from './chrome/Device.js';
