# Layout and CSS

Token ownership, which file owns which rule, stacking layers, and the styling conventions.

## CSS ownership

`shared.css` is the single source of truth for color, typography, control-height and
radius tokens, plus the small set of primitives genuinely shared across components:
text fields, labels, modal shells and scrollbars. `Control.tsx` and `Control.css` own every
button and select, segmented-group chrome, pressed and primary states, and the compact
select caret; a bare group or native select keeps component-specific layout and field
styling while retaining the same rendering API. Component-specific rules live beside
their `.tsx` owner and are imported from there. The two bulk workflows share
`BulkWorkflow.css`; the grid's table, scene rows and song rows each own separate files.

Keep a value in a component file when it describes that component's layout. Promote it to
`shared.css` only when changing it should intentionally change the same concept everywhere.
In particular, components use `--radius-*` rather than choosing literal corner radii.

### Stacking layers

Root-level stacking values are tokens in `shared.css`. Grid chrome occupies the low tiers,
the mixer owns 100–102, every viewport-sized interaction backdrop owns 200, and modal
content owns 300. That separation is structural: a sticky table cell must never be able to
paint over a dialog. Small literal `z-index` values are reserved for local paint order
inside a component, such as a meter's rules, marker, invisible input and buttons.

## Styling

Plain CSS with custom properties in `:root` — dark, IBM Plex where available with
system fallbacks. No CSS framework, no CSS-in-JS. The tokens (`--amber`, `--detail`,
`--bd`, …) come from the original design mocks; reuse them rather than introducing
new values.

Neutral text is the one family with a rule rather than a habit. Five tokens — `--fg`,
`--ui`, `--detail`, `--caption`, `--idle` — are named for the job the text is doing, so
choosing one is a question about the content and not about the shade; `shared.css`
carries the definition of each. No rule invents its own gray, and text recedes by taking
the next step down rather than by growing an `opacity`, which is reserved for a whole
control being disabled.

`--col-w`, `--scene-col-w` and `--role-chip-w` are the exception: `:root` carries
fallbacks, but `ClipGrid` sets all three on the table element from `columnWidth.ts`, which
stays the one place the grid states a width. Only `--col-w` moves with the
S/M/L/Auto/8/16 setting.
See *Column widths*.
