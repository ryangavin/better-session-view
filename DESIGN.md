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
- Radii are tokens: 2px, 3px, 4px, 6px and pill. Header controls share a 22px height
  and are vertically centered with equal space above and below.
- The grid uses a 2px gutter. Its scene column is 290px and its role chip is 62px; track
  width modes are defined in [`ui/src/lib/columnWidth.ts`](ui/src/lib/columnWidth.ts).
- Grid headings use 9px mono text; the Songs heading uses 16px.
- The Songs header uses an 8px horizontal inset around its title and action group.

## Controls

- Icon-only buttons use the centered `.icon-btn` primitive and carry both an `aria-label`
  and a `title`.
- Icons are inline SVG on a 24-unit grid, draw with `currentColor`, and render at 14px by
  default. The Songs-column controls use the main header's 26×22px icon-button size.
- Related controls share a bordered button group with dividers between segments.
  Controls with different consequences use separate groups: scene folding changes only
  this app's display; the song actions in the Songs header change the Live Set.
- The first button group after the logo holds the app-only song-index and fold toggles.
- In the Songs column header, the label is left-aligned. Order, color and Add share one
  right-aligned button group.
- Toggles keep one glyph and use the amber-on state. Primary actions use an amber fill.
- The debug console starts closed after every refresh, never opens automatically, and its
  toggle lives with status in the bottom strip.
- Mixer strips stack fixed 18×18px Track Activator, Solo and Arm buttons below a vertical
  volume fader and output meter. The activator uses amber when enabled and Arm uses red
  when armed.

## Grid

- Scenes run down; tracks run across. The header row and scene column are sticky.
- The Songs header uses Live's Master track color, with the neutral surface as its fallback.
  Its transparent action group derives borders and icon ink from the same black-or-white
  contrast choice as the title, so it remains coherent on light and dark Master colors
  without covering the header color.
- Song headers are separated with surfaces and the grid gutter rather than borders.
- Live colors are rendered from Live's palette. Text laid over a Live color chooses dark
  or light ink with the helpers in [`core/src/color.ts`](core/src/color.ts).
- The mixer is a resizable sticky footer in the same table, so every strip remains aligned
  with its track column and Master remains pinned under Songs.
