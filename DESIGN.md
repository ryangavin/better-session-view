# Design system

This file records design choices already implemented in the app. Component details and
the reasons behind them remain in [`ui/README.md`](ui/README.md).

## Foundations

- The interface uses dark surfaces. Semantic color tokens live in
  [`ui/src/shared.css`](ui/src/shared.css): neutral foregrounds and borders, amber for
  selection, active toggles and primary actions, green for playback and success, blue for
  Solo, red for errors, and purple for previews.
- The sans stack starts with IBM Plex Sans. The mono stack starts with IBM Plex Mono and
  is used for compact labels, facts and grid headings.
- Radii are tokens: 2px, 3px, 4px, 6px and pill. Header controls share a 22px height
  and are vertically centered with equal space above and below.
- The grid uses a 2px gutter. Its scene column is 290px and its role chip is 62px; track
  width modes are defined in [`ui/src/lib/columnWidth.ts`](ui/src/lib/columnWidth.ts).
- The song index is as wide as the columns it shows and no wider: both its width and its
  grid track list are computed from the same visible-column list in
  [`ui/src/lib/songIndexColumns.ts`](ui/src/lib/songIndexColumns.ts), so turning a column
  off narrows the pane instead of widening the name. Name and artist are `fr` tracks;
  key, BPM and type are fixed. Which columns are on is a browser preference in
  `localStorage`, alongside track width — set-owned configuration goes to the device.
- Grid headings use 9px mono text; the Songs heading uses 16px.
- The Songs header uses an 8px horizontal inset around its title and action group.

## Controls

- Icon-only buttons use the centered `.icon-btn` primitive and carry both an `aria-label`
  and a `title`.
- Icons are inline SVG on a 24-unit grid, draw with `currentColor`, and render at 14px by
  default. The Songs-column controls use the main header's 26×22px icon-button size.
- Related controls generally share a bordered button group with dividers between segments.
  Controls with different consequences use separate groups: scene folding changes only
  this app's display; the song actions in the Songs header change the Live Set. The Songs
  header keeps its action buttons borderless while grouping them by adjacency.
- The first button group after the logo holds the app-only song-index and fold toggles.
- The gear at the right opens set configuration: naming defaults and role definitions.
  It stays separate from Live's control-bar groups and from Snapshot because it writes the
  device state saved in the `.als`, not Live transport or grid content.
- In the Songs column header, the label is left-aligned. Order, color and Add share one
  right-aligned button group.
- Toggles keep one glyph and use the amber-on state. Primary actions use an amber fill.
- A small set of same-kind switches is disclosed as a row of labelled toggles rather than
  a popover menu — the song index's column pickers are the case. Which ones are on is most
  of what the control is for, and a menu hides that behind a press.
- The debug console starts closed after every refresh, never opens automatically, and its
  toggle lives with status in the bottom strip.
- Mixer strips place a 26×26px Track Activator above 26×13px Solo and Arm buttons down
  the lower left side of a full-height output meter. Volume is a draggable triangular
  indicator beside that meter instead of a second vertical rail. Resettable peak and
  exact volume readouts occupy the top-left; each readout and the pan field is 26×19px
  so the entire control column grows without changing any control's aspect ratio. Pan
  sits above the switch stack. Optional sends occupy their own A/B-labelled footer section
  above ordinary-track faders; opening them grows the footer instead of shortening the
  meters. Master has no sends. The activator
  uses amber when enabled, Solo uses blue when selected and Arm uses red when armed.
  Group tracks retain the Arm button's layout slot but make the button itself invisible.
  Ordinary tracks and Master render the same 56px fader subtree. Master retains the track
  switch stack invisibly so pan stays aligned and leaves that unused area unlabelled; only
  sends differ outside the shared fader.

## Grid

- Scenes run down; tracks run across. The header row and scene column are sticky.
- The Songs header uses Live's Master track color, with the neutral surface as its fallback.
  Its transparent action group derives borders and icon ink from the same black-or-white
  contrast choice as the title, so it remains coherent on light and dark Master colors
  without covering the header color.
- Song headers are separated with surfaces and the grid gutter rather than borders.
- A song header stacks the artist in dim mono under the song name, and only when the set
  names one. The name and artist are the only part that stacks: the fold glyph, bpm, key,
  tag chip and part marker stay single items centered on the row, so a two-line header
  reads as one taller block rather than as a row whose annotations rode up to the top.
- **Every song header is 36px, artist or none** — a collapsed set is a list of nothing
  else. The height is a floor set by the folded shape strip, and the two text lines are
  sized to fit inside it, so naming an artist costs no vertical space at all. The line
  heights and the padding are tokens on `tr.song-row` because their sum has to equal the
  cell's content box.
- Live colors are rendered from Live's palette. Text laid over a Live color chooses dark
  or light ink with the helpers in [`core/src/color.ts`](core/src/color.ts).
- One ▶ launcher means "fire this" everywhere it appears: the scene gutter, a group's slot
  and a clip cell. All three turn green while they sound and amber while they wait.
- A clip cell's launcher is a button-shaped surface at the slot's left end, rounded on the
  left to continue the clip's own corners and square where it meets the name. It darkens
  the clip's color rather than taking a fixed one, since the ground under it is whatever
  Live colored that clip; its lit states fill instead, with the app background as ink.
- An empty slot carries a button in that same strip, so one column of buttons runs down a
  track whether its slots hold clips or not. It is ■ while the track is unarmed and ●
  once it is armed — one Live call whose meaning the glyph states in advance. The ● takes
  the same red Arm does on the mixer strip, so which tracks are armed is answerable from
  the grid; the ■ takes the quietest ink and brightens on hover. Both are bare rather than
  recessed: only the clip launcher needs a ground, because only it sits on a Live color.
  Their lit states fill, like the launcher's.
- The mixer and stop slots are one resizable sticky table footer, so every strip remains
  aligned with its track column and Master remains pinned under Songs. Optional stop,
  sends and meter sections stack as table rows and use one 2px border for every join; that
  same border is the meter resize handle. The output rail grows from 8px to 16px when the
  column has room, then stops so whitespace remains.
- The stop-clips row starts visible and has its own header toggle. Each visible track owns
  its stop slot; Stop All occupies the same slot in the pinned Master column instead of
  living in the global transport controls.

## Stacking

- Root-level layers are centralized as CSS tokens: ordinary grid chrome stays below 100,
  the mixer occupies 100–102, viewport overlays use 200, and modal content uses 300.
- Component-internal paint order may use small local values, but must not introduce a new
  root-level stacking tier.
