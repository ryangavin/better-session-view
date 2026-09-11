DevicePortRow from bsv-widgets. Use via `window.BsvWidgets.DevicePortRow` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface DevicePortRowProps {
  /** A `Port` on the leading edge. */
  inlet?: React.ReactNode;
  /** A `Port` on the trailing edge. */
  outlet?: React.ReactNode;
  /** The control or label governed by the ports on this line. */
  children?: React.ReactNode;
  className?: string;
}
```
