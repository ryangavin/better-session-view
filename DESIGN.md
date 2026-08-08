# Design system

This file records design choices already implemented in the app. Component details and
the reasons behind them remain in [`ui/README.md`](ui/README.md).

## Foundations

- The interface uses dark surfaces. Semantic color tokens live in
  [`ui/src/shared.css`](ui/src/shared.css): neutral foregrounds and borders, amber for
  selection, active toggles and primary actions, green for playback and success, red for
  errors, and purple for previews.
- The sans stack starts with IBM Plex Sans. The mono stack starts with IBM Plex Mono and
  is used for compact labels, facts and grid headings.
- Radii are tokens: 2px, 3px, 4px, 6px and pill. Header controls share a 22px height.
- The grid uses a 2px gutter. Its scene column is 290px and its role chip is 62px; track
  width modes are defined in [`ui/src/lib/columnWidth.ts`](ui/src/lib/columnWidth.ts).

## Controls

- Icon-only buttons use the centered `.icon-btn` primitive and carry both an `aria-label`
  and a `title`.
- Icons are inline SVG on a 24-unit grid, draw with `currentColor`, and render at 14px by
  default. Compact scene-column controls scale the same glyphs down together.
- Related controls share a bordered button group with dividers between segments.
  Controls with different consequences use separate groups: scene folding changes only
  this app's display; the neighboring song actions change the Live Set.
- In the Songs column header, Add follows the label while fold, order and color remain
  right-aligned; fold and the Live Set actions use separate groups.
- Toggles keep one glyph and use the amber-on state. Primary actions use an amber fill.
- The debug console starts closed and its toggle lives with status in the bottom strip.

## Grid

- Scenes run down; tracks run across. The header row and scene column are sticky.
- Song headers are separated with surfaces and the grid gutter rather than borders.
- Live colors are rendered from Live's palette. Text laid over a Live color chooses dark
  or light ink with the helpers in [`core/src/color.ts`](core/src/color.ts).
