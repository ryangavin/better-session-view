Widget from bsv-widgets. Use via `window.BsvWidgets.Widget` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface WidgetProps {
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
