# The grid

The clip grid itself: what opens and what stays closed, selection and the active cell, column widths, and the ⌘ modifier.

## The grid is the app; everything else opens

Three optional surfaces start **closed**, because none is what you came for. On a 40-track
set every pixel the side panes aren't using is a track column you can see.

- **The song index** opens from the first button group after the logo and lists each
  song once with its artist, key, BPM and type. It starts in set order; its search covers
  every displayed field, and each column heading toggles a local ascending/descending sort.
  That filter and order belong only to the pane — they never reorder scenes or write to
  Live. A song whose scenes agree on one canonical color shows its name in that color;
  mixed and uncolored songs remain neutral.
  Clicking only the name jumps immediately to the first block of that song and selects
  its first scene in Live, which centers it in Live's Session View. It does not select
  anything in this app, open the edit rail, or change the song's fold state. The local
  target is the song header rather than its first scene, so a folded song is just as
  navigable as an open one.

  **Its columns come off individually, and the pane narrows by exactly the column.** That
  is the whole point of the switch: this is a pane whose cost is measured in track columns
  you can no longer see, so the answer to "it's too wide" has to be less pane, not a
  wider name. `songIndexColumns.ts` derives both the pane width and the grid track list
  from one visible-column list, so the header row, every song row and the pane itself
  cannot disagree about how many columns there are. Name and artist are `fr` tracks
  sharing the free space in proportion — both are free text, and giving the artist a fixed
  slot would clip long ones while the three fact slots sat half empty.

  Hiding a column **clears a sort keyed on it**, because the list would otherwise sit in
  an order with nothing on screen to explain it. Search deliberately does *not* narrow to
  the visible columns: a column turned off to save width is still a thing you might be
  looking for.

  The choice is a **browser preference in `localStorage`**, next to track width rather
  than in the device. The line is what the setting is *about*: naming defaults, role
  definitions and allowed colors describe the set and travel in the `.als`, while how much of this screen you want
  spent on a contents pane follows the screen. The name column has no switch — a list of
  songs with the song names turned off is a state nobody wants to find themselves in.

- **The rail** — scene fields, roles, swatches, rename — opens the moment you pick
  something to work on: a clip, a scene name, or a song. Its `×` closes it and gives the
  grid back 264px. There's no way to get stranded shut, because the next click on any of
  those three reopens it.

  It opens from those three handlers rather than from an effect on the selection, and the
  difference matters: an effect would also fire when a selection is *cleared*, so the
  click that empties the grid would reopen the rail you just closed.

- **The log** is diagnostics, so its bug toggle lives in the bottom status strip. It is
  ephemeral UI state: every refresh closes it, nothing is persisted, and neither bridge
  activity nor new errors can open it. The bug toggle is its only opener. Every write in
  this app still goes through `guard()` and lands in the log rather than throwing; the
  user chooses when to reveal that history.

Readiness and counts don't open, so they pay for their pixels differently: `StatsBar` is a
**status strip along the bottom edge**, one line high. Its single readiness pill names the
first unmet dependency — device, then LOM — or says `ready`; the remaining numbers are
glanced at after a snapshot or before an apply. It was a band under the header — two lines
per tile, a 9px label over a 15px number — which is ~52px of chrome across the full width
on a set where the same pixels are two scene rows. A number you check rather than read can
be small, so a tile is label and value on one baseline at 8.5/10.5px, and the whole strip
is ~21px.

It renders **after** the log, so the log opens as a panel above it rather than pushing it
off the bottom, and it's a `div`, not a second `<footer>` — the `footer` selector carries
the log's own type, background and `user-select: text`.

Whichever of the two is *directly* after `main` casts a shadow up over the grid — the log
when it's open, the strip when it isn't. That's what the `main + footer, main + .stats`
pair is for: the strip is one line of the same near-black as everything else, and a 1px
border alone doesn't read as an edge with clip cells scrolling under it. Putting the
shadow on both unconditionally paints the strip's across the bottom of the log.

## Selection, and the active cell

Two separate things, and keeping them separate is the point:

- **selection** — a `Set` of `"t:s"` keys. What `apply` writes to.
- **the active cell** — exactly one cell, `ActiveCell` in
  [`core/src/gridRange.ts`](../../core/docs/gridRange.md). What you're listening to, what the arrow
  keys move, and what will hold the name field. Called *active cell* after spreadsheets
  rather than *cursor*, which in a DAW means a position on the timeline.

The scene name column is one of the grid's cells, so the active cell can sit there;
`moveActive` handles the crossing between it and the track columns at the left edge.
Horizontal movement walks the **rendered column order**, so a collapsed group is invisible
to the arrow keys as well as to the eye — that's why `columns` is computed in
`useTrackColumns` and passed down through `App` rather than living in `ClipGrid`.

Blocks only ever pick up cells that hold a clip. An empty slot has no name and no color,
so sweeping a block over 4,000 of them would make the `Selected` count a lie and hand
`apply` thousands of ops it can only skip.

## Column widths

**Live tells us nothing here.** The LOM has no Session View column width — `Track.View`
is `selected_device` / `device_insert_mode` / `is_collapsed`, and that last one is the
*arranger*, not the session. Real widths live only in the `.als`, which this project
never parses. So the widths are ours to pick.

`columnWidth.ts` holds three pixel presets and three viewport layouts, chosen over
per-column dragging because the point of `s` is fitting a wide set on screen at once —
something per-column widths actively work against.

The header exposes them through one compact native select rather than six persistent
buttons. The selected option is the stored mode, and changing it still applies
immediately.

| | track column | fits in ~1100px |
|---|---|---|
| `s` | 44px | ~24 tracks |
| `m` | 74px | ~14 tracks |
| `l` | 116px | ~9 tracks |
| `auto` | at least 44px | all rendered tracks, when they fit readably |
| `8` | viewport-derived | exactly one 8-track bank |
| `16` | viewport-derived | exactly two 8-track banks |

**Auto divides the width left after the fixed scene column among every rendered track.**
Small's 44px is its floor: a large set keeps horizontal scrolling rather than turning
clip names into unusable slivers.

**8 and 16 divide that same space by a bank size instead.** The full table still contains
every rendered track, so the ninth or seventeenth column begins the horizontal overflow.
These modes deliberately do not inherit Small's floor: their job is to preview the exact
one- or two-device layout, even in a narrow browser.

All three viewport layouts respond to the browser resizing, the rail opening or closing,
and group columns folding or unfolding. `useViewportColumnWidth` observes the grid's own
content box, not `window.innerWidth`, because the rail is part of the space calculation.

**The setting sizes the track columns and nothing else.** The scene name column is a
constant 316px — `SCENE_COL_W` — and the role chip a constant 62px.
They scaled with the presets once; the question the setting answers is *how many tracks
fit on screen*, and a scene name is the same length whatever the answer is. Shrinking it
at `s` truncated the label you navigate the rows by to buy one more column of clips.

The choice persists to `localStorage` under `bsv.columnWidth`, and `saveColumnWidth`
swallows storage failures — a width that doesn't persist isn't worth failing a render
over.

**The scene/song column is sticky on the left.** The header, every scene cell, folded and
open song headers, and the Master meter all pin at the table's existing 2px outer gutter.
The top-left and bottom-left intersections sit above their independently sticky rows.
Scene cells carry an opaque background because a sticky transparent cell would show clips
moving underneath it. Track cells also reserve the pinned width in `scroll-margin-left`,
so keyboard `scrollIntoView({ inline: 'nearest' })` cannot park the active clip behind the
scene column.

Two things in here are load-bearing:

**`table.grid` is `table-layout: fixed`.** Column widths then come from the header row
alone and the 848 rows below it are ignored. Without it a long track name widens its own
column and the grid stops being uniform — and the browser has to measure every cell to
find out. With a fixed table, `width: auto` would stretch to fill the container and dump
the slack into the last column, so `ClipGrid` states the table's own width; the used
width becomes the greater of that and the sum of the columns. `tableWidth()` computes it,
including the `border-spacing` gaps (n + 1 columns means n + 2 gaps).

**Widths ride down as CSS custom properties on the `<table>`, not as props on `Row`.**
`Row` is memoized; a new prop would re-render all 848 scenes on every width change. As
custom properties the browser just recalculates layout and `Row` never re-renders. Don't
"simplify" this by threading the width through as a prop. The viewport observer writes
those same properties directly so a browser resize does not turn into 848 React renders.

## ⌘ is the "talk to Live" modifier

One rule, and it's the reason the grid is safe to click around in while you're labelling
a set: **unmodified input never makes a sound.** Plain clicks and plain arrow keys select,
collapse and move. Add ⌘ and Live responds. Ctrl on non-Mac — and never both, because
Ctrl-click on macOS is the system context-menu gesture and would fire a clip every time
someone reached for a right-click. `keys.ts` owns that decision.

| | organization (silent) | ⌘ |
|---|---|---|
| clip cell | click selects · ⇧ extends a block · **▶ fires the clip** | ⌘-click **fires the clip** |
| scene name | click selects the row · ⇧ extends over scenes · **number drags** | ⌘-click **fires the scene** |
| song header | click folds · title selects · **drag reorders** | — |
| track header | click a group to collapse | ⌘-click **stops that track** |
| keys | `↑↓←→` move the active cell | `⌘↑ ⌘↓` **move and fire** · `⌘⏎` fire |
| | `⌘A` select all scenes · `⌘Z` undo the last write | `esc` stop all clips · `space` transport |

`⌘↓` is the sweep — one keystroke for "next scene, and let me hear it". That deliberately
replaces an audition *mode*: a sticky toggle you can forget you're in is worse than a
modifier you're holding.

The ▶ launchers are the plain-click exceptions, all for the same principled reason:
firing is the button's only job, and the rule exists to keep firing away from
*selection*, which a button that can't select has nothing to take from. The one in the
**scene gutter** fires the scene — the primary gesture, so it has to be visible rather
than a modifier away. The one in a **group's slot** fires the group, which has no
selection to protect. The one in a **clip cell** fires that clip, which is Live's own
launcher in Live's own place; the rest of the cell around it is untouched, so an
unmodified click there still selects and opens the editor. A launcher never moves the
active cell or changes the selection, so ⌘-click and ▶ are not the same gesture even
though they fire the same slot.

A clip cell's launcher is a recessed button at the slot's left end, rounded on the left
to continue the clip's corners and square where it meets the name. It **darkens** the
clip's color rather than taking one of its own, because the ground under it is whatever
Live colored that clip and no fixed color reads on all of them. That surface sits over
the 3px play bar `td.cell.playing` paints down the same edge, so the launcher carries
play state instead — green while sounding, amber while queued, with the app background
as ink. Filling rather than tinting the glyph is what makes that legible: green ink on a
green clip is nothing.

**⌥ means nothing on a click.** It used to add to the selection, which is what ⇧ already
does — extending a selection *is* adding to it, and a second key for the same idea only
made the first look incomplete. There are two selection gestures now, not three. What
went with it is toggling one cell back out of a selection; ⇧ can shrink a block by
re-extending it, so the loss is a cell at a time rather than a range.

## Nothing is selectable text

`body` carries `user-select: none`. The whole app is a click surface, not a document, and
⇧ is both "extend the block" here and "extend the text selection" in the browser — so
without it every range gesture drags a blue smear across the scene names it just selected.

Two exceptions, both because you'd want to copy out of them: fields you type into, and
the footer log. An error message you can't select is one you retype by hand.
