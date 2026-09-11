# BsvWidgets (bsv-widgets@0.1.0)

This design system is the published bsv-widgets React library, bundled as a single
browser global. All 20 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.BsvWidgets`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).
- `guidelines/` — the design system's own usage guidance (5 doc(s), see `guidelines/index.md`). Read these before composing larger layouts.

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.BsvWidgets.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { Chain } = window.BsvWidgets;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<Chain />);
```

## Tokens

33 CSS custom properties from ../widgets. Names are
preserved verbatim from upstream. See `tokens/` for the full list.

- **color** (5): `--surface-control`, `--surface-stats`, `--surface-cell`, …
- **radius** (5): `--radius-xs`, `--radius-sm`, `--radius-md`, …
- **shadow** (1): `--shadow-edge`
- **other** (22): `--bg`, `--panel`, `--rail`, …

## Components

### chrome
- `Chain`
- `Device`
- `Graph`
- `Panel`
- `Port`
- `Rack`
- `Row`

### general
- `DevicePortRow` — One fixed-height line shared by a port and the control it governs.
- `Divider` — live.line. The rule that separates one section of a device from the next.
- `GraphNode` — One node's place on the canvas.
- `PanelColumn`

### controls
- `Knob`
- `Label`
- `Meter`
- `NumberField`
- `Segmented`
- `Select`
- `Slider`
- `Toggle`
- `Widget`
