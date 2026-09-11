Select from bsv-widgets. Use via `window.BsvWidgets.Select` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface SelectProps {
  items: readonly string[];
  index: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: string;
  name?: string;
  /** In px. Settle caller-owned labels so changing the selection cannot resize a panel. */
  width?: number;
  className?: string;
  title?: string;
}
```
