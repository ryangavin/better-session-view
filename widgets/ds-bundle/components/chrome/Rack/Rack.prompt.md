Rack from bsv-widgets. Use via `window.BsvWidgets.Rack` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface RackProps {
  /** The macro panel. Knobs the host has bound — this only lays them out. */
  macros?: React.ReactNode;
  /** The chains, by name, the way `Segmented` takes its members. */
  chains?: readonly string[];
  chainAt?: number;
  onChain?: (next: number) => void;
  /** The selected chain's devices. A `Chain`, usually. */
  children?: React.ReactNode;
  className?: string;
  /** `Device.name`. Clipped rather than wrapped, like every other reading. */
  name: string;
  title?: string;
  /** `Device.is_active`. A deactivated device dims; its controls still work. */
  on?: boolean;
  onToggle?: (next: boolean) => void;
  /** `Device.View.is_collapsed`. The triangle only appears if it can move. */
  folded?: boolean;
  onFold?: (next: boolean) => void;
  /** Which device the chain is pointing at. The chain owns this, not the device. */
  selected?: boolean;
  onSelect?: () => void;
  /** The hot-swap button, shown only when the host has somewhere to send it. */
  onHotSwap?: () => void;
  /** Device-specific chrome between the activator and the device name. */
  headerStart?: React.ReactNode;
  /** Status or mode chrome that belongs immediately after the device name. */
  headerAfterName?: React.ReactNode;
  /** Device-specific actions pinned to the far edge of the title bar. */
  headerEnd?: React.ReactNode;
  /** `Port`s on the leading edge, and on the trailing one. In a chain these stay empty, because adjacency *is* the connection */
  inlets?: React.ReactNode;
  outlets?: React.ReactNode;
  /** A picture at the top of the face, inside the frame. A graph preview is the first caller, and the reason this is a slot r */
  screen?: React.ReactNode;
  /** The one fixed-height choice band in a row-aligned face. **Left out entirely when there is nothing to choose.** It used t */
  chooser?: React.ReactNode;
  /** Opts into a face whose ports and controls share rows. Each child should be a `DevicePortRow`. Inlets belong on those row */
  portRows?: React.ReactNode;
  /** Custom properties set on this face, for the host to size its own anatomy. How many port rows a face holds open is the ho */
  vars?: WidgetVars;
}
```
