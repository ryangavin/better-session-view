Segmented from bsv-widgets. Use via `window.BsvWidgets.Segmented` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface SegmentedProps {
  items: readonly string[];
  index: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: string;
  name?: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
  title?: string;
}
```
