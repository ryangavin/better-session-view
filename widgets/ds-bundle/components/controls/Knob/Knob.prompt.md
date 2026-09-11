Knob from bsv-widgets. Use via `window.BsvWidgets.Knob` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface KnobProps {
  param: Param;
  value: number;
  onChange: (next: number) => void;
  onRelease?: () => void;
  /** Authoritative text — Live's own `str_for_value`, where there is a Live. */
  display?: string;
  /** Where the filled arc grows from. `live.dial` calls this the needle mode; the default reads it off the range, since a con */
  origin?: "min" | "center";
  showValue?: boolean;
  travel?: number;
  /** The printed caption. Controls that read a `Param` default to its short name. */
  name?: string;
  /** For assistive technology. Defaults to the caption. The frame doesn't render it — it belongs on whatever element the cont */
  label?: string;
  layout?: "stacked" | "inline" | "inside";
  disabled?: boolean;
  className?: string;
  title?: string;
}
```
