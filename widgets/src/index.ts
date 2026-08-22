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
export {
  Widget,
  type WidgetLayout,
  type WidgetProps,
  type WidgetSlots,
  type WidgetVars,
} from './controls/Widget.js';
export { Knob, type KnobProps } from './controls/Knob.js';
export { Slider, type SliderProps } from './controls/Slider.js';
export { Meter, type MeterProps } from './controls/Meter.js';
export { NumberField, type NumberFieldProps } from './controls/NumberField.js';
export { Toggle, type ToggleProps } from './controls/Toggle.js';
export { Segmented, itemsOf, type SegmentedProps } from './controls/Segmented.js';
export { Select, type SelectProps } from './controls/Select.js';
export { Divider, Label, type LabelProps } from './controls/Label.js';

export { Chain, type ChainProps } from './chrome/Chain.js';
export {
  Device,
  DevicePortRow,
  type DevicePortRowProps,
  type DeviceProps,
} from './chrome/Device.js';
export {
  Graph,
  GraphNode,
  type GraphCord,
  type GraphNodeProps,
  type GraphProps,
} from './chrome/Graph.js';
export { GraphContext, portKey, type GraphSurface, type PortSide } from './chrome/graphContext.js';
export { Port, type PortProps } from './chrome/Port.js';
export { Rack, type RackProps } from './chrome/Rack.js';
export { Row, type RowProps } from './chrome/Row.js';
export { Panel, PanelColumn, type PanelProps, type PanelColumnProps } from './chrome/Panel.js';
