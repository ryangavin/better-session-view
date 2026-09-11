NumberField from bsv-widgets. Use via `window.BsvWidgets.NumberField` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface NumberFieldProps {
  param: Param;
  value: number;
  onChange: (next: number) => void;
  onRelease?: () => void;
  disabled?: boolean;
  display?: string;
  label?: string;
  name?: string;
  /** Typing a digit or pressing Enter opens the editor. Never for an enum. */
  editable?: boolean;
  /** The value drawn as a bar behind the text, as Live's own value boxes do. */
  showFill?: boolean;
  /** Where that bar grows from. Defaults to the middle when zero is the middle. */
  origin?: "min" | "center";
  /** In px. Defaults to the parameter's longest reading, so it never resizes. */
  width?: number;
  travel?: number;
  className?: string;
  title?: string;
}
```
