/**
 * The whole library, for consumers that want it in one import.
 *
 * Importing this pulls every control's stylesheet in with it. Anything reaching
 * for the model or the gesture alone — the app's mixer does — should import the
 * file it needs instead, the same way `set/` reaches into `core/src/`.
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
} from './param/param.ts';
export { format, noteName, widestText } from './param/format.ts';

export {
  useParamGesture,
  type ParamAxis,
  type ParamGesture,
  type ParamGestureOptions,
  type ParamSurfaceProps,
} from './gesture/useParamGesture.ts';
export { usePendingValue, readbackTolerance, type PendingValue } from './gesture/usePendingValue.ts';
export { FINE_KEY, isFine } from './gesture/platform.ts';

export { defaultOrigin, fillFrom, originFraction, type FillOrigin } from './controls/fill.ts';
export { useReserved } from './controls/reserve.ts';
export {
  Widget,
  type WidgetLayout,
  type WidgetProps,
  type WidgetSlots,
  type WidgetVars,
} from './controls/Widget.tsx';
export { Knob, type KnobProps } from './controls/Knob.tsx';
export { Slider, type SliderProps } from './controls/Slider.tsx';
export { Meter, type MeterProps } from './controls/Meter.tsx';
export { NumberField, type NumberFieldProps } from './controls/NumberField.tsx';
export { Toggle, type ToggleProps } from './controls/Toggle.tsx';
export { Button, type ButtonProps } from './controls/Button.tsx';
export { Segmented, itemsOf, type SegmentedProps } from './controls/Segmented.tsx';
export { Select, type SelectProps } from './controls/Select.tsx';
export { XYPad, type PadAxis, type XYPadProps } from './controls/XYPad.tsx';
export { Divider, Label, type LabelProps } from './controls/Label.tsx';

export { Chain, type ChainProps } from './chrome/Chain.tsx';
export {
  Device,
  DevicePortRow,
  type DevicePortRowProps,
  type DeviceProps,
} from './chrome/Device.tsx';
export {
  Graph,
  GraphNode,
  type GraphCord,
  type GraphNodeProps,
  type GraphProps,
  type GraphView,
} from './chrome/Graph.tsx';
export { GraphContext, portKey, type GraphSurface, type PortSide } from './chrome/graphContext.ts';
export { Modal, type ModalProps } from './chrome/Modal.tsx';
export { Port, type PortProps } from './chrome/Port.tsx';
export { Rack, type RackProps } from './chrome/Rack.tsx';
export { Row, type RowProps } from './chrome/Row.tsx';
export { Panel, PanelColumn, type PanelProps, type PanelColumnProps } from './chrome/Panel.tsx';

export {
  Tablature,
  type NotationGrid,
  type NotationSpan,
  type TablatureNote,
  type TablatureProps,
  type TablatureString,
} from './notation/Tablature.tsx';
export {
  PianoRoll,
  type PianoRollKey,
  type PianoRollNote,
  type PianoRollProps,
} from './notation/PianoRoll.tsx';

export * from './debug/index.ts';
