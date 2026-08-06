# ui/

React 19 + Vite. Builds to `bridge/public/`, which the device serves.

```
index.html            vite entry
vite.config.ts        build target + dev proxy
src/main.tsx          root
src/App.tsx           the composition root — hooks in dependency order, wiring
src/shared.css        design tokens, global reset, shared controls and primitives
src/App.css           app shell, empty state and log
src/components/       one component per file
  *.css               component styles, imported by the component that owns them
  ClipGrid/
    ClipGrid.tsx      scenes × tracks — colgroup, sticky header, group bands, the tbody
    Row.tsx           one scene's row, memoized
    SongHeaderRow.tsx a song block's header row, memoized
    constants.ts      surfaces, contrast ratios, shared empties
  Header.tsx          header bar — pills, Arrangement position, playback, view controls
  Icon.tsx            the header's glyphs, as inline SVG
  StatsBar.tsx        the bottom status strip — stat tiles + the key-hint line
  Stat.tsx            one tile
  Rail.tsx            the rail's chrome; App nests the panels inside it
  ScenePanel.tsx      song/bpm/key fields, role chips, role→color
  Inspector.tsx       rename pattern, swatches, apply
  SwatchGrid.tsx      the palette as clickable swatches, shared by all three pickers
  RoleMenu.tsx        the picker that hangs off a scene's role chip
  RolesManager.tsx    the vocabulary editor — modal, owned by App
  SongsModal.tsx      what the app read back out of the set — read-only
  ReorderModal.tsx    the running order — drag songs, apply once
  RecolorModal.tsx    coloring every song from a rule
src/hooks/            one hook per file
  useBridge.ts        React face of the client; composes the three below
  useLog.ts           the shared say sink
  useRolesConfig.ts   roles.json fetch + save (useVocabulary merges it with the set)
  usePalette.ts       palette cache + the once-per-Live-version derivation
  useSnapshotLookups.ts  the lookup Maps every other hook reads
  useTrackColumns.ts  rendered column order + group collapsing
  useSongLayout.ts    derivation, song folding, folded-header shapes
  useGridSelection.ts both selections + the active cell (and its ref)
  useGridKeyboard.ts  the window keydown effect
  useSongDrag.ts      drag state + the move plan (and its ref)
  useRailAndLog.ts    rail/log visibility, error-opens-the-log
  useSceneTitles.ts   TitlePatch, rename + tempo ops
  useSongColor.ts     song-scoped coloring
  useColorRules.ts    the allowed colors, and coloring every song from a rule
  useVocabulary.ts    merged vocabulary, in-use keys, roleColors
  useRoleAssignment.ts  role writes + the floating menu's state
  useClipInspector.ts clip color + rename pattern
  useCloseOnEscape.ts / useDismissOnScroll.ts /
  useAnchoredPosition.ts / useMenuKeyboard.ts   generic overlay behavior
src/lib/
  client.ts           typed WebSocket client, framework-free
  selection.ts        clip addressing + selection set
  keys.ts             the launch modifier, and who owns a keystroke
  columnWidth.ts      S/M/L grid width presets + persistence
  allowedColors.ts    which of Live's colors a rule may use + persistence
  rowMarks.ts         play state flattened to memo-safe strings
  snapshotTiming.ts   the console phase breakdown + error text
```

## CSS ownership

`shared.css` is the single source of truth for color, typography, control-height and
radius tokens, plus the small set of primitives genuinely shared across components:
buttons, text fields, labels, modal shells and scrollbars. Component-specific rules live
beside their `.tsx` owner and are imported from there. The two bulk workflows share
`BulkWorkflow.css`; the grid's table, scene rows and song rows each own separate files.

Keep a value in a component file when it describes that component's layout. Promote it to
`shared.css` only when changing it should intentionally change the same concept everywhere.
In particular, components use `--radius-*` rather than choosing literal corner radii.

## Dev

```sh
npm run dev            # from repo root — starts this plus the bridge watchers
npm run dev:ui         # this alone, against a device someone else is running
```

Use **<http://localhost:5173>**, not :17800. Vite proxies `/ws` and `/palette.json`
through to the device, so you get HMR with React Fast Refresh — a loaded snapshot and
your current selection survive edits, which matters when a snapshot takes seconds.

Two env vars, both optional:

| var | default | for |
|---|---|---|
| `BSV_UI_PORT` | `5173` | a second UI alongside the first — one per worktree |
| `BSV_BRIDGE` | `http://127.0.0.1:17800` | pointing at a device other than the local one |

`strictPort` is on, so a port collision fails loudly instead of drifting to the next
free one. That's deliberate: assign the port, don't discover it.

Several dev servers can share one device — they all proxy to the same bridge, and
`BridgeClient` derives its socket URL from `location.host`, so nothing needs telling
which port it's on. That's the multi-client path, so see
[`bridge/README.md`](../bridge/README.md) for what the bridge does and doesn't yet
guarantee when more than one client is connected.

:17800 serves the built output and stays available for testing what actually ships.
When you edit `public/` directly, `bridge.js` watches it and pushes a `reload` event;
`useBridge` calls `location.reload()`. That path only exists for the built output —
in dev, Vite's HMR wins.

**Nothing loads from a CDN.** No external fonts, scripts, or stylesheets. This
eventually runs on stage, where there may be no network. Vite bundles everything;
keep it that way.

## The client / hook split

`client.ts` is framework-free on purpose — it's the piece most likely to get reused
(a CLI, a stage display, a test harness).

- Requests carry an `id`; `request()` resolves with the **terminal** event for that id,
  per the `TERMINAL` map. Add a row there when you add an awaitable message.
- Non-terminal traffic (`progress`, `changed`, `reload`, `status`) goes to
  `subscribe()` listeners instead.
- `error` rejects any pending request with that id.
- Auto-reconnects after 1s on close, unless we closed it ourselves. All pending
  requests reject on disconnect rather than hanging.
- `lastWireTiming` holds round-trip, parse cost and payload size for the most recent
  reply. Read it synchronously right after the `await`. This is safe because UI
  requests are serialized behind `busy`; it would need per-id storage if that changed.

`hooks/useBridge.ts` wraps it in React state. The separable pieces — the log
(`useLog`), the roles.json fetch/save (`useRolesConfig`), the palette
(`usePalette`) — are their own hooks that it composes; the connection, the
snapshot walk and the apply/undo/moveScenes write path stay together in
`useBridge` itself because they share `guard`, the snapshot ref and the undo
entry. `guard()` wraps every operation so failures land in the log rather than
as unhandled rejections.

## The grid is the app; everything else opens

Two panes start **closed**, because neither is what you came for. On a 40-track set every
pixel the rail isn't using is a track column you can see.

- **The rail** — scene fields, roles, swatches, rename — opens the moment you pick
  something to work on: a clip, a scene name, or a song. Its `×` closes it and gives the
  grid back 264px. There's no way to get stranded shut, because the next click on any of
  those three reopens it.

  It opens from those three handlers rather than from an effect on the selection, and the
  difference matters: an effect would also fire when a selection is *cleared*, so the
  click that empties the grid would reopen the rail you just closed.

- **The log** is diagnostics, so it's behind the header's bug toggle — and it
  **opens itself on an error**. Every write in this app goes through `guard()` and lands
  in the log rather than throwing, so a hidden log is the difference between a failed
  write and a silent one. The effect watches for ids above the highest seen rather than
  looking at `log[0]`, because `say` prepends and a burst can put an info line in front of
  the error that arrived with it.

The counts don't open, so they pay for their pixels differently: `StatsBar` is a **status
strip along the bottom edge**, one line high. It was a band under the header — two lines
per tile, a 9px label over a 15px number — which is ~52px of chrome across the full width
on a set where the same pixels are two scene rows. Nothing in it is read *while* you work;
it's glanced at after a snapshot or before an apply, and a number you check rather than
read can be small. So a tile is now label and value on one baseline at 8.5/10.5px, and the
whole strip is ~21px.

It renders **after** the log, so the log opens as a panel above it rather than pushing it
off the bottom, and it's a `div`, not a second `<footer>` — the `footer` selector carries
the log's own type, background and `user-select: text`.

Whichever of the two is *directly* after `main` casts a shadow up over the grid — the log
when it's open, the strip when it isn't. That's what the `main + footer, main + .stats`
pair is for: the strip is one line of the same near-black as everything else, and a 1px
border alone doesn't read as an edge with clip cells scrolling under it. Putting the
shadow on both unconditionally paints the strip's across the bottom of the log.

## The header is glyphs

Every button in the header is an icon: sync for Snapshot, a hamburger for fold, a bug for
the log, play / stop / struck-through-slot for playback. Live's bars, beats and sixteenths
sit immediately left of playback while the buttons remain at the header's exact center.
The three equal flex regions make that centering independent of the controls on either
side. **S M L stay as letters** —
they're a scale, and a scale is what letters are for. That takes the bar to
`--ctl-h + 12px`, one height for every control in it and 6px of air either side.

- **`Icon.tsx` is inline SVG**, not an icon font and not a Unicode character. A font is out
  because nothing loads from a CDN. A character is out because ▶, ⏹ and 🐛 render at
  whatever size, weight and baseline the user's installed fonts decide, and the emoji ones
  arrive in full color at a size nothing asked for. Drawing in `currentColor` means the
  button's hover, `:disabled` and `.on` states reach the glyph for free.
- **Every icon button carries an `aria-label` as well as a `title`.** An icon-only control
  with no accessible name is a button for sighted mouse users and nobody else, and the
  `title` is now the only place the longer meanings — what "stop clips" spares, that
  Snapshot re-walks the whole set — can still be said in words.
- **Fold keeps one glyph and lights instead of swapping.** A folded set already *is* a list
  of lines, so that's the state the icon draws; a second icon for unfold would mean reading
  the button to find out which way it goes. Same lit-when-on treatment as the width presets.
- **The empty state shows the glyph, not the word.** It used to say *hit **Snapshot***, and
  pointing at a label that no longer exists is worse than no instruction.

## Color writes on click, naming doesn't

The asymmetry in the Inspector is deliberate. A color is instantly legible in the grid and
picking a different one costs nothing, so the swatch *is* the action — click it and it's
written. A name overwrites something you can no longer see, so it keeps its preview and an
explicit **Rename N** button.

The fast path this buys is the one the app exists for: **click a scene name, click a
swatch.** Selecting a scene name selects every clip in that row, so those two clicks
recolor a whole scene.

Both paths filter out writes that would change nothing — `colorOps` and the `nameOps` memo.
Recoloring a scene where 22 of 30 clips are already that color writes 8, and the progress
bar says 8. A count that includes no-op writes is a lie about how much work is happening.

## The snapshot happens by itself

`useBridge` walks the set as soon as the LOM reports ready. **Snapshot** was the first
thing anyone pressed every time, so it was a button that existed only to be pressed; it
stays for re-walking after a change made in Live.

It fires once per *session*, guarded by a ref, and that guard is the point: a walk that
**fails** leaves `snapshot` null with `lomReady` still true, so without it the effect
would re-run and retry forever — hammering the LOM with the walk that just broke.

## Working on a whole song

Clicking a **song title** in a header selects every scene of that song, across all its
blocks, and unfolds it first — offering to rename eighteen rows you can't see is exactly
the kind of write the pending-changes idea exists to prevent. The rest of the header row
folds; only the title selects, because folding is the frequent navigation gesture and
"work on this song" is the deliberate one.

From there the rail does the three things at song scale:

- **Rename** — the song/bpm/key fields, which prefill from what the song already agrees on.
- **Set tempo on N scenes** — writes Live's own `Scene.tempo`, and is deliberately *not*
  part of Rename. Everything else in the panel changes what a scene is called; this
  changes what the set does, since Live takes a scene's tempo the moment it fires. Folding
  it into a rename would make a naming pass silently alter playback. Clearing the bpm
  field turns the button into **Clear tempo on N scenes**.
- **Song color** — a swatch grid that paints the scene rows themselves, so a song becomes
  a band of color in Live's own session view. Writes on click, like the clip swatches.

The header's **hamburger** folds or unfolds every song at once — a view control, so it
sits with the width presets rather than only inside the songs modal.

## A song is one color

Coloring is **song-scoped, not selection-scoped**. Touch any scene of Nightfall and a
swatch writes all twelve, reprise included — `scenesOfSongs` widens the selection before
the ops are built. The panel says which songs and how many scenes before you press
anything, because the write reaches rows you may not be able to see.

That's a deliberate loss of flexibility. A solid block of color in Live's own session view
is what a 100-song set is navigated by, and a per-scene brush is precisely what puts holes
in it. Two things follow:

- **Roles color clips only.** The old *Paint scenes* button gave each scene its role's
  color, which stripes a song into as many colors as it has sections. Role color still
  reaches clips, where it reads as structure *inside* the band instead of breaking it.
- **A half-painted song shows as a fault, not as a color.** `derive` observes
  `colorIndex` per song the way it observes bpm and key, and **-1 is a value there, not an
  omission** — a song where some scenes are colored and some aren't reports two
  observations. The header then says `mixed color` rather than picking one, and
  `disagreements()` lists it for lint.

The song's color rides on the header as a solid left bar plus a wash across the whole row,
so a fully folded set is a column of bands. The wash **halves outside the first cell**:
the cell holding the title is the song, the track cells are what's inside it, and a folded
row reads faster when the two are told apart by weight than by a border. It also stops the
section marks competing with a field of color behind them. Three separate things want that row's edges,
so they get one property each and never negotiate: the **bar** is a `::before` on the
first cell, the **wash** is `background`, and the **collapsed and drop-target indicators**
are `box-shadow`. A border is out because it would change the row's height, which the
sticky header arithmetic depends on.

That split is newer than it looks. The bar and the indicators used to share `box-shadow`
and `background-image` by turns, at equal specificity, resolved by source order — folded
edge, then song color, then drop line — with a comment warning that raising any of them
with a `:not()` would silently take the drop indicator off folded rows. A folded header is
several cells wide now, which broke that arrangement and forced the better one.

Live's palette holds colors dark enough to vanish on `--rail`, so the band goes through
`legibleOn` at a low ratio (2.2). It's a block of color rather than text, so it needs far
less contrast than a scene name — but a band you can't see is the whole thing failing.

## Song headers, and folding

Each song block gets a **full-width header row** above its first scene, which is what
actually segments the grid. It carries **no border at all**. It began as a 1px light rule
along the top, which is how you draw a bevel — and once a folded header became several
cells the table's 2px `border-spacing` chopped that highlight into a segment over each one,
so the row read as raised tiles. Repainting the rule in the page's own color fixed the
bevel but left the header in a 5px gutter where every other gap in the grid is 2px, and one
axis spaced differently from the other is its own kind of depth cue. So the separator is
`border-spacing` and nothing else: every gutter in the table, both axes, is the same 2px.
What sets a header apart is its own surface — `--rail` against the clip cells' lighter
fill, the song's wash, and the bar down its left edge. **Surfaces, not edges.**
Clicking one folds the song to just that header. A hundred songs fold to a hundred rows,
which is the point: **Collapse all** in the songs modal turns the whole set into a table
of contents.

Three things about it are load-bearing:

- **Folding is keyed by song, not by scene index**, so it survives a re-snapshot. Every
  write re-walks the set, and a fold state that reset each time would make the grid
  useless during a mapping pass. Like collapsing a track group, it never writes to Live.
- **`rows` replaces `sceneCount` everywhere movement or selection happens.**
  `useSongLayout` computes it from `songRows`, and `App` threads it into
  `moveActive` and `cellsInBlock` exactly as it threads `trackColumns`. Without that, `⌘↓` walks into folded scenes and fires
  them — see [`core/README.md`](../core/README.md).
- **`SongHeaderRow` is memoized on primitives**, for the same reason `Row` is. There can
  be a hundred of them and they must not all re-render because one song folded.

A song in more than one block says `part 2 of 2` rather than being silently merged, and
a song whose scenes disagree about a fact shows the clash in amber. Both are the grid
telling you something the library will later have to arbitrate.

### The header is a table, not a line

A hundred headers stacked up **are** a table of contents, so the row is laid out as
columns rather than as a sentence. Folded, it's the whole song on one row — what it's
called, what it's built from, and what's in it:

```
▾  128  Bm  NIGHTFALL··················   mixed color · part 2 of 2
   └bpm┘└key┘└──────── 170px ─────────┘   └── exceptions, unaligned ──┘

▸  124  F#m GLASS TUNNEL··············· │  ■■  │      │ ■■■■ │  ■   ← folded
   └────────── the scene column ───────┘ └ the sections each track plays ┘
```

- **Every slot keeps its width whether or not the song fills it.** That's the whole
  mechanism: the fixed facts strip is what keeps the next song's name where your eye
  already is. A song that states neither shows `---` and `--` rather than a gap: an empty
  slot reads as a rendering fault, where a dash says the set never named one — which is a
  thing to go and fix. Dimmer than any real value, and it stays dim under a clash, because
  nothing said is not the same as two scenes disagreeing.
- **The facts lead**, so the key sits immediately left of the name it describes. bpm
  before key is the order the naming convention itself writes — `@128-Bm`. Both are
  right-aligned: `94` and `128` are the same fact at different widths and it's their
  right edges that should line up.
- **Every slot is sized to its values, not to its words.** Matching the name slot to
  `--scene-col-w` was the tidier rule and the wrong one: at `l` it spends 290px on names
  rarely half that. Same for the facts — a bpm is three digits and a key is at most
  three characters, so any extra is dead space on every song carrying neither, which in
  most sets is a lot of them.
- **No scene count.** A set built to a house length says the same number a hundred times,
  and the block's size is legible from the rows it spans anyway. It survives as the fill
  tiles' denominator and in their tooltips.
- **Flex lives on a wrapper `div`, not the `td`.** `display: flex` on a table cell stops
  it being a table cell and takes the grid's fixed layout down with it.
- **Open, the row is one spanning cell**; folded, it's the scene column plus one cell per
  track column. Both shapes come out of the same component and share the same title
  block. Only the folded shape can carry tiles, because only real cells land under the
  columns they describe.

### One row, not two

The content strip used to be a second row under the header. It isn't, because it never
needed to be: a folded header's scene column has room for the name *and* the shape, and
the track columns to its right were empty. Merging them halves the height of a folded set
and puts everything about a song on one line.

What that cost, and what paid for it:

- **The name flexes when folded** instead of taking a fixed 170px, because the scene
  column is all the room there is. It gets nearly all of it: the shape lives out in the
  track columns, not beside the name.
- **`part 2 of 2` shortens to `2/2`** when folded — it shares the scene column now, and
  the tooltip still spells it out. It stays beside the name rather than moving out with
  the other exceptions, because a reprise is exactly where the tiles are worth most.
- **`mixed color` and the drop note take the tile region**, as one cell spanning the
  track columns. Both are things you have to *act* on — a fault to fix, a move about to
  happen — and both outrank a summary of what the song contains. The drop note in
  particular is far too long for the scene column and can't be abbreviated: it's the only
  warning before the one write no undo of ours can reverse.
- **The left edge moved to `::before` on the first cell.** A folded header is several
  cells wide now, so a background gradient would repeat the bar at the left of every
  tile and a `box-shadow` would draw it down the whole row. That turned out to be a
  simplification: the bar used to be a background layer and a box-shadow taking turns,
  with a comment warning that source order was load-bearing and a stray `:not()` would
  silently take the drop line off folded rows. Now the bar owns `::before`, the wash owns
  `background`, and the drop indicators own `box-shadow` — three jobs, three properties,
  no ordering.

### What a folded song holds, track by track

Each track column of a folded header carries **one small square per section that track
plays** — the sparkle pad marked chorus and jam, the trance pad marked practice, intro,
ending. Folded, a song otherwise tells you what it's *called*; this tells you what's *in*
it, and at which point of the song, which is the question you're actually asking when
you're choosing what to blend into next.

It replaced a density bar — one bar per column, opacity by how much of the song that track
covered. That answered "is this track used", which turned out to be the smaller half of
the question, and it could never answer the other half.

It works because the marks are **in the track columns**, not merely near them, and the
track-name row is sticky: scroll a fully-folded set and every mark still has its track
named above it. `blockTrackRoles` in core does the counting; `useSongLayout`
memoizes it against the *derivation*, not against `collapsedSongs`, so folding one
song doesn't rebuild the map and hand all hundred headers a new prop.

- **Color only, names on the cell's tooltip.** A hundred folded songs are a page of color
  signatures, and at that density a word per role is what turns a table of contents into a
  wall of text. The vocabulary's colors are already doing the naming — that's what they're
  for. Named chips still belong beside a *scene* name, where there's one role and room to
  spell it.
- **Dimmed to 60%, up to 90% on row hover.** These are a signature to recognise, not a
  label to read, and at full strength a row of saturated palette colors shouts louder than
  the song name beside it.
- **Deduped, in first-appearance order, and never numbered.** `VERSE CHORUS VERSE CHORUS`
  is the arrangement, not the shape. The per-role scene count is in the tooltip, where
  reading it is a decision rather than a tax on every glance.
- **Clips on untagged scenes get a neutral grey mark**, not nothing. A set mid-mapping is
  mostly untagged, and a track used only there still has to read as used or the header
  lies about what the song holds. Grey rather than the song's own color, so an unmapped
  track can't look like it was given a section.
- **Centred in the column**, matching the track name in the sticky row above, so a column
  of marks reads as belonging to it. An empty column draws nothing at all: an absence
  answers faster than a faint presence does.
- **9px, square, 2px apart, 2px corners** — the grid's own spacing, so a folded row reads
  as one language of tiles left to right. An uncolored role is hollow rather than dashed:
  at 9px a dashed edge is mush.
- **A folded track group shows the union of its members**, via `mergeShapes`, and counts
  in tracks rather than scenes — "3 of 5 used" — the same stand-in a folded clip cell
  already shows, because the column stands for several tracks.

There is no aggregate run of marks beside the song title. Once each track says which
sections it plays, a second copy of the same vocabulary next to the name is the crowding
without the information — and dropping it gives the name the rest of the scene column.

## Rearranging songs

**Drag a song header to move that whole run of scenes.** An amber line shows where it
lands, and the line carries the cost — `10 scenes · 84 clips copied · 10 deleted`.

This is the only gesture in the app that can destroy work, and four decisions follow from
that:

- **A drag moves one block, not one song.** A song is a label rather than a range, so it
  can appear in several runs, each with its own header — dragging "part 2 of 2" moves the
  part you grabbed. Gathering both runs is something `planSceneMove` supports and
  something you can do by dragging one next to the other; doing it as a side effect of
  grabbing one header would move sixty scenes nobody pointed at.
- **The cost is on the drop line, not in the log.** There's no undo for this on our side,
  so what's about to happen has to be readable while the mouse button is still down. A log
  line afterwards is too late to be a decision.
- **Dropping a song back where it already is does nothing at all** — `planSceneMove`
  returns `null` rather than an empty plan, and the indicator doesn't draw. That's how most
  drags end, and the cheapest way to never delete a scene by accident is to not run.
- **The drop clears the selection and the undo entry.** Every `(track, scene)` address
  just came to mean a different row, so keeping either would leave the rail offering to
  rename scenes you never picked.

A folded song is draggable, which is the point of folding: **Fold songs**, then reorder a
hundred-song set as a table of contents.

Two things in here are load-bearing for performance, and they're the same trap as `Row`:

- **`onSongDrop` reads the plan from a ref.** Closing over it would give the callback a new
  identity every time the drop gap changes — every time the pointer crosses a boundary —
  and re-render all hundred headers mid-drag.
- **`dragover` sets state through an identity bail-out.** It fires continuously for the
  whole drag; returning `prev` unchanged when the gap hasn't moved lets React skip the
  render entirely.

The drop edge is resolved *toward `above`*, because a gap between two adjacent songs is
addressable from both sides — a song ending at scene 5 and the next starting at 6 are both
"gap 6". `below` therefore only renders where no header begins, which is the tail of the
set and the one gap `above` can't express.

What it costs in Live, and the four passes it runs, is in
[`bridge/README.md`](../bridge/README.md) under *Reordering scenes*. **It is unverified
against a real set.**

## Two workflows over the whole set

The scene column's header carries **order…** and **color…**. They're at the head of the
column the songs are read down, because both act on every song at once rather than on a
selection — which is also why neither is in the rail, and the rail can be shut anyway.

Both work the same way: a draft you can push around for free, a preview of exactly what
will be written, and one button that writes it. That shape is the point of them. Doing
either through the grid is one write per song, each with its own round trip and
re-snapshot, and the waiting is what stops anyone *trying* an arrangement.

### The running order

**Drag songs into the order you want, then Apply.** One row per song, however many runs it
has, because a running order is written in songs — and that has two consequences the modal
has to say out loud rather than spring on you:

- **Applying gathers a song found in more than one run.** The row says `2 runs → 1` and a
  line under the list names the songs it will collect. A reprise stops being a reprise,
  which is a real change to the set that nobody dragged.
- **A scene the pattern couldn't read isn't in the list**, so it travels with the song it
  currently sits after; above the first song it stays at the top. The alternative — pinning
  it to the index it holds now — cuts a song in half the moment the songs above it change
  length. The count is shown, per row and in total.

Everything else follows the drag in the grid. The cost is stated before it runs
(`18 scenes · 142 clips copied · 18 deleted`), the no-undo warning is permanent rather
than conditional, and applying **closes the modal and clears the selection**, because every
scene index is about to mean a different row.

It is one plan and one `move` message, not a move per song. Live's undo grouping is
per-message, a half-applied order is the worst state this app can leave a set in, and
`planSceneReorder` is what makes one plan possible — see [`core/README.md`](../core/README.md).

### Coloring by rule

**A song is one color**, and which color is only worth deciding across the whole set:
*by key* the bands say what will mix into what, *by bpm* they say where the set changes
gear. *rainbow* and *random* say nothing and are for when you just need a hundred songs
told apart. The rules are pure functions in core; this modal is the preview and the
allowed colors.

- **Which of Live's 70 colors a rule may use is a setting** — `bsv.allowedColors` in
  `localStorage`, machine-wide like the column width, because it's a preference about how
  you like to look at a set rather than a fact about this set. Eight chosen colors read
  better across a hundred songs than seventy: several of Live's are hard to tell apart at
  the size a scene row draws them. `null` means "whatever the palette holds" and is
  deliberately not the same as a list of all 70 — a Live that shipped more colors should
  hand them to someone who never chose, and not to someone who did.
- **A song the rule can't answer for is left alone**, and named. No key means no color
  here, not "the no-key color" — painting a song by a fact nobody wrote down is how a
  color stops meaning anything. A song whose scenes *disagree* about the fact counts as
  not stating it, for the same reason the header renders the clash instead of picking.
- **The count on the button is scenes, not songs.** A song already carrying its color
  writes nothing, so applying the same rule twice says `every song already carries its
  color` rather than claiming a hundred writes.
- **It stays open after applying**, unlike the reorder: the write is undoable, the scene
  indexes still mean what they meant, and trying a second rule against what the first did
  is the point of having four. The preview repaints itself off the re-snapshot.
- **`random` takes a seed, and *roll again* is a different seed** rather than a different
  function. The preview and the write have to be the same deal, and colors are dealt from
  a shuffled bag so every allowed color is used before any repeats and no two songs in a
  row match. Independent draws clump, and a clump is precisely what the band prevents.

## Songs, and the mapping read back

The **Songs** and **Unmapped** tiles in the status strip are derived, not stored — every
snapshot re-reads the scene names through the scene pattern and works out which song each
scene belongs to (see [`core/README.md`](../core/README.md)). Clicking either opens
`SongsModal`, and clicking a song there selects its scenes.

**The modal is read-only on purpose.** Its job is to answer "does derivation work on a
real set" before anything is built on top of it, and it can't give a misleading answer if
it has nothing to write with.

Two things it deliberately does not smooth over. A song whose scenes **disagree** about a
fact shows every value in amber rather than picking one — the library arbitrates that
later, and showing one value as though it were the answer is how drift hides. And a song
found in **more than one block** gets a flag rather than an error, because a song is a
label rather than a range: two blocks is a reprise, or it's two different songs sharing a
name, and only you know which.

`SCENE_PATTERN` is compiled once at module scope in `useSongLayout` from `DEFAULT_SCENE_PATTERN`.
The `!` is safe there and nowhere else — there's a test in `namePattern.test.ts` holding
that exact constant down. It becomes editable when the scheme file lands.

## Nothing is selectable text

`body` carries `user-select: none`. The whole app is a click surface, not a document, and
⇧ is both "extend the block" here and "extend the text selection" in the browser — so
without it every range gesture drags a blue smear across the scene names it just selected.

Two exceptions, both because you'd want to copy out of them: fields you type into, and
the footer log. An error message you can't select is one you retype by hand.

## Scenes: title and role

The rail is `<aside>` (`Rail.tsx`), holding `ScenePanel` above `Inspector` — scenes first,
because naming a song and tagging its roles is the pass you make before touching
individual clips, and the swatch grid below is the fallback for everything a role
doesn't cover.

A scene name is `[ROLE] @{bpm}-{key} {SONG}` — `[CHORUS] @128-Bm NIGHTFALL`. The panel
edits both halves and they **commit differently, on purpose**: a role writes on click, a
title edit needs the button. See below for why.

**Role first, facts second, name last**, so a column of scene names reads as structure
rather than as a list of titles. Live's own scene column is narrow, so the trade is that
*there* the song name truncates before the metadata does; here it doesn't, because the
grid lifts the role into a chip. Why the facts need only `@` and `-` while the role keeps
its brackets is in [`core/README.md`](../core/README.md).

**The chip leads the row, ahead of the name.** Everything to the left of the title is then
a fixed width — fire button, scene number, chip — so a column of scene names starts on one
vertical line and the roles beside them are a column of their own. Same reasoning as the
song header's slots: a hundred rows of this is a table, and a table has columns.

- **One width for every role.** `[JAM1]` weighs the same as `[PRACTICE]`, which it does.
  Longer names ellipsis and the tooltip spells them out.
- **The width is a grid metric**, in `columnWidth.ts` beside the column widths, rather
  than a constant in the stylesheet. It's sized to its content — nine characters covers
  nearly every role and a wider chip is only more whitespace — and it doesn't move with
  the S/M/L setting; see *Column widths*.
- **A scene with no role draws a pill saying so** — same box as a real chip, a shade
  quieter, its text dimmer still. Filled rather than dashed: a dashed chip already means
  something else here, a role that exists and has no color.
- **The chip is a `<button>`**, real one and placeholder alike — it opens the role menu
  below. That means undoing the global button rule in `td.scene .role-chip`, and it means
  an untagged scene is one click from a role rather than a trip to the rail.
- **The gutter is on the chip's right**, between it and the title, and tight to the scene
  number on the left, which it belongs with. Live's own text on one side of that gap, our
  reading of it on the other.

An existing set named the old way (`Nightfall 128 Bm [chorus]`) still shows its songs —
derivation reads both conventions, and any rename converts a scene. See *Reading more
than one convention* in [`core/README.md`](../core/README.md).

### The title fields

Three fields, and the rule is **a field you leave alone stays as it is on each scene; a
field you clear is cleared.** That's what makes "select two songs, set one shared key"
work without flattening their different names. It can't come from the value alone —
blank means "these scenes disagree" on arrival and "delete this part" once you've
deleted it — so `useSceneTitles` holds a `TitlePatch` of which fields have been
*touched*, reset whenever the selection changes. The preview line is what makes the rule legible; keep it.

Fields prefill from `commonTitle`, which returns `null` where the selection disagrees, so
a mixed field shows a `mixed` placeholder rather than one scene's answer. `bpm` and `key`
are validated inline and block the button, because a bad key is a rename you'd have to
undo across a whole song.

### Roles

The gesture is **click a scene name, click a role, click Color clips.** The role is
written to the front of the scene's own name as `[ROLE]` (see
[`core/README.md`](../core/README.md) for why the set is the storage), and the grid shows
the title with the tag lifted out into a colored chip — so Live holds
`[CHORUS] @128-Bm NIGHTFALL` and we render `@128-Bm NIGHTFALL · CHORUS`.

**Clicking a role writes immediately, which only looks like it breaks the rule above.**
That rule exists because a rename overwrites a name you can no longer see. A role tag is
additive — it goes on the front, the rest of the name is untouched — and the result is
visible as a chip the moment it lands. There's nothing to preview. A *title* edit does
overwrite, which is why that half keeps its preview and its button.

### The role menu

Clicking a chip in the grid — a role or the `no role` placeholder — opens `RoleMenu` on
it. The rail can do this already; this exists anyway because tagging is a
scene-at-a-time pass down the grid, and routing every one through the rail means picking
the row, looking away, and coming back. Here the chip you're reading is the chip you
press. It writes on click, like the rail's chips and for the same reason.

- **Scope is the chip's own scene, unless that scene is already in the scene selection**
  — then it's the whole selection, because that's the pass you're in the middle of.
  Worked out at render from the selection as it stands, not captured when the menu opens.
  The header says the count out loud either way, so it's never inferred from the chip.
- **`onRoleMenu` is identity-stable and the menu renders in `App`,** not in `Row`.
  Opening a menu must not re-render 848 memoized rows — same rule as `active` and the
  drag plan. The chip passes its own bounding box up, because it's the only thing that
  knows where it landed.
- **Positioned against the viewport**, measured in `useLayoutEffect`, flipping above the
  chip near the bottom of the window. It closes on scroll and resize (capture phase — a
  scroll inside `.grid-wrap` doesn't bubble) rather than drifting off the row it points at.
- **The backdrop is a transparent full-screen div**, not a document click listener: it
  eats the dismissing click, so closing the menu can't also fire a scene or move the
  selection. Esc and the arrows are swallowed in capture phase, ahead of `App`'s window
  listener — otherwise Esc would also stop every clip in Live.
- **Manage roles… opens `RolesManager`**, which is why that modal is owned by `App`
  rather than by the rail: two things reach it, and the rail can be shut.

**Scene selection is separate state from clip selection**, and can't be derived from it: a
scene with no clips contributes no cells and still needs to be assignable a role. It's set
only by the scene-name column and cleared by a clip click, so "which scenes am I about to
tag" is never a guess. Selected scene rows get an amber left edge.

**Color clips uses each scene's own role**, so one press works across a selection spanning
several roles. It's the only thing role color writes: scene rows carry the *song's* color,
and painting them per role would break the band — see *A song is one color* above.

The vocabulary is `bridge/roles.json`, unioned with every role actually tagged in the set
(`mergeVocabulary`). A role typed straight into Live shows up in the manager uncolored
rather than being invisible until it mysteriously colors nothing. Deleting a role only
forgets its color — the scenes keep their tags, so it reappears uncolored, and the manager
says so.

One wart worth knowing: **undo can't take a scene color back off.** Live has no writable
"no color", so a scene that had none can't be restored to none. `useBridge` logs a line
saying so rather than letting the undo button promise more than it delivers.

`roleColors` is memoized in `useVocabulary` because it reaches the memoized `Row`; a
fresh Map per render would re-render all 848 scenes. It changes only when the
vocabulary or palette does, which is rare.

## Undo is ours to provide

`⌘Z`, or the button. One level, and there is no redo. **Reordering scenes is outside it
entirely** — see below.

**LOM writes don't reach Live's own history**, so Live's ⌘Z will not bring a rename back —
this is the only way back that exists. `useBridge` captures the reverse batch from the
snapshot before every write (see [`core/src/ops.ts`](../core/README.md)), which costs
nothing because the snapshot already holds every clip's name and color.

One level rather than a stack, on purpose: every write re-snapshots, so a stack would have
to stay valid across that, and a stale entry that quietly restores the wrong thing is worse
than having no stack. The entry is consumed whether or not the undo succeeds, so a failed
undo can't be replayed into a half-reverted state by pressing ⌘Z twice.

`⌘Z` doesn't conflict with the ⌘-makes-a-sound rule below — it isn't a grid gesture, and
it's guarded by `isTypingInto` so the rename field keeps its own undo.

**Moving scenes has no undo here, and can't.** `inverseOps` works by reading "before" out
of the snapshot, which holds every clip's name and color — and nothing that could rebuild a
deleted scene's clips. So `moveScenes` *clears* the undo entry rather than replacing it:
every scene index means something different afterwards, and a ⌘Z that wrote clip names
against the wrong rows would be worse than no undo at all. The move asks Live to group
itself into one step in Live's *own* history instead, and the log says whether Live agreed,
because that mechanism is undocumented and unverified.

## Palette

`refresh()` derives the palette before the walk **if there isn't one**, so it never needs a
button. Three things make that safe, and all three are the reason it isn't simply run every
time:

- **Once per Live version, not once per snapshot.** The sweep appends and deletes a track
  (it has to be a clip — see [`bridge/README.md`](../bridge/README.md)), so every refresh would
  mark the set dirty, churn Live's undo, and trip the structural observer, whose entire job
  is to prompt a re-snapshot. That's a feedback loop the moment `observe` is enabled.
- **Strictly before the walk, never overlapping it.** Otherwise the snapshot sees the
  scratch track as a real one.
- **Failure never blocks the walk.** A set you can see without swatches beats an error
  where the grid should be, so the derivation is caught and logged. `derivedRef` then stops
  it retrying — a sweep that fails must not append a track on every subsequent refresh.

The "have we got one?" question is answered by re-reading `/palette.json` rather than by
React state, which may still be waiting on the mount-time fetch if Snapshot was clicked
immediately. A local GET is cheap; appending a track to re-derive what we already have is
not. The **Re-derive palette** button remains for a Live upgrade, and as the retry after an
automatic attempt failed.

## Snapshot timing readout

Every snapshot prints a phase breakdown to the browser console — the answer to "is
this design going to scale":

```
⏱ snapshot  243 clips · 100 scenes · 1041ms end-to-end
  lom: tracks / scenes / slot scan / clip reads
  v8 → dict        JSON.stringify + Dict.parse
  node getDict     Max dict → JS object
  wire + parse     payload size
  react commit
projection to 848 scenes (×8.5, linear): ~8.8s end-to-end
```

The projection is honest because every phase is a linear scan. `TARGET_SCENES` in
`lib/snapshotTiming.ts` sets the reference size.

The status strip also shows `LOM walk` and `Slot scan` tiles, and the log carries the
headline numbers.

## ⌘ is the "talk to Live" modifier

One rule, and it's the reason the grid is safe to click around in while you're labelling
a set: **unmodified input never makes a sound.** Plain clicks and plain arrow keys select,
collapse and move. Add ⌘ and Live responds. Ctrl on non-Mac — and never both, because
Ctrl-click on macOS is the system context-menu gesture and would fire a clip every time
someone reached for a right-click. `keys.ts` owns that decision.

| | organization (silent) | ⌘ |
|---|---|---|
| clip cell | click selects · ⇧ extends a block · ⌥ toggles | ⌘-click **fires the clip** |
| scene name | click selects the row · ⇧ extends over scenes | ⌘-click **fires the scene** |
| song header | click folds · title selects · **drag reorders** | — |
| track header | click a group to collapse | ⌘-click **stops that track** |
| keys | `↑↓←→` move the active cell | `⌘↑ ⌘↓` **move and fire** · `⌘⏎` fire |
| | `⌘Z` undo the last write | `esc` stop all clips · `space` transport |

`⌘↓` is the sweep — one keystroke for "next scene, and let me hear it". That deliberately
replaces an audition *mode*: a sticky toggle you can forget you're in is worse than a
modifier you're holding.

Two exceptions, both principled. The **▶ in the scene gutter fires on a plain click** —
firing is the button's only job, and scene launching is the primary gesture so it has to
be visible rather than a modifier away. And **⌥, not ⌘, adds to the selection**, inverting
the usual macOS idiom, because ⌘ is spoken for above and launching earns the scarcer key.

## Selection, and the active cell

Two separate things, and keeping them separate is the point:

- **selection** — a `Set` of `"t:s"` keys. What `apply` writes to.
- **the active cell** — exactly one cell, `ActiveCell` in
  [`core/src/gridRange.ts`](../core/README.md). What you're listening to, what the arrow
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

`columnWidth.ts` holds three presets, chosen over per-column dragging because the point
of `s` is fitting a wide set on screen at once — something per-column widths actively
work against.

| | track column | fits in ~1100px |
|---|---|---|
| `s` | 40px | ~26 tracks |
| `m` | 74px | ~14 tracks |
| `l` | 116px | ~9 tracks |

**The setting sizes the track columns and nothing else.** The scene name column is a
constant 290px — `SCENE_COL_W`, what `l` used to be — and the role chip a constant 62px.
They scaled with the presets once; the question the setting answers is *how many tracks
fit on screen*, and a scene name is the same length whatever the answer is. Shrinking it
at `s` truncated the label you navigate the rows by to buy one more column of clips.

The choice persists to `localStorage` under `bsv.columnWidth`, and `saveColumnWidth`
swallows storage failures — a width that doesn't persist isn't worth failing a render
over.

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
"simplify" this by threading the width through as a prop.

## Track groups

**A group track is a column, like it is in Live.** It's a real track with real clip
slots, and firing its slot fires every clip the group holds in that scene. Collapsing
hides its *members*, not the group — so the column is there either way, and there is no
separate "stands in for its members" column kind.

Clicking the group's header folds and unfolds it. ⌘-click stops the group, the same
gesture as any track header; on a group Live's `stop_all_clips` takes the members with
it.

The group's cell carries a launcher and a count — how many of its tracks have a clip in
that scene — tinted with the first of those clips, which is the color Live paints the
slot. The count is the one thing a collapsed group hides that nothing else on screen
answers. Plain click fires it, which is the second exception to the ⌘-to-fire rule after
the scene button, and for the same reason: there is nothing in a group slot to select,
so there's no selection for the modifier to protect.

**Every track header is filled with that track's own Live color**, group tracks
included, and grouping reads as a colored rule along the top of the columns in a run,
capped where the run starts. Both halves are load-bearing and the fills are the half
that took two tries: with only the group's color painted, a group read as a track
sitting *beside* its members rather than containing them. The band says how far the
group reaches; the fills underneath say these are tracks. `inkOn` picks the label's
black or white per swatch, because Live's palette runs from near-black to near-white
and no single text color survives it.

The rule used to be a header row of spanning cells carrying the group's name; a group
track carries its own name now, so that row was repeating a word the column already had.
Nesting falls out of it — a group inside another opens its own run, in its own color.

The band is deliberately heavy — 5px above, 3px closing it below — because a group and
its tracks are usually near-neighbours in Live's palette, a green group over light-green
tracks, and a hairline rule lost that argument every time. The header grew to fit rather
than the label shrinking; 9px uppercase mono is already the floor. `--band-top`,
`--band-bottom` and `--header-h` are written as one calculation in `ClipGrid.css`, and
the padding that produces the height is written from the same variables, so the two
can't drift.

A group track also wears **Live's circled chevron** rather than a bare `▸`. The ring is
the part that matters: a plain chevron reads as an ordinary disclosure arrow, and the
badge is what makes group tracks findable at a glance down the header row.

Live draws that rule as **one unbroken bar** across the group. Ours is still a segment
per column: the gaps are `border-spacing`, which the sticky header already paints into,
and bridging them is a separate problem from the color being bridged.

**Play state on a header is a bar down the left edge, not the text color** — the same
language the clip cells use for the same fact. Once the header carries the track's own
fill, a green *word* on a green track says nothing, and overriding the label color
throws away the contrast `inkOn` just chose.

The layout lives in [`core/src/trackColumns.ts`](../core/README.md) and what a group
slot shows in [`core/src/groupSlot.ts`](../core/README.md), both with tests — nesting,
ancestry and "which clip is first" are exactly the kind of logic that breaks quietly.

**None of this costs the snapshot anything.** The LOM does expose group slots directly
(`ClipSlot.controls_other_clips` and the slot's own `color`), but only per slot, which
is trackCount × sceneCount reads for something the clips already answer. Firing is the
one thing that goes to Live, and it needs no new message: `launch` addresses a *slot*,
not a clip, so a group slot fires over the path that was already there.

**Folding writes back to Live** (`setFold` → `fold_state`), so the grid and the Session
view agree and a fold survives the next snapshot. The folded set is still seeded from
Live's `fold_state` on every snapshot; that's only safe *because* it writes back —
before it did, every write silently unfolded whatever you had folded. The write is
fire-and-forget: the columns move before Live is told, because waiting a round trip to
redraw a fold you just clicked is the one thing that would feel slow.

Selection is deliberately left alone when a group collapses: hidden clips stay
selected and still apply. Collapsing is about what you're looking at, not what you've
picked — but it does mean the `Selected` count can exceed what's on screen. A group
column is never selectable and the arrow keys step over it, for the same reason its
slots can't be named or colored: there is no clip there.

## Scene colors

Scene names render in the scene's Live color. Two things make that work:

- **`colorIndex` of -1 means no color at all**, which is not palette slot 0. Live
  documents `Scene.color_index` as "Can be None for no color"; an uncolored scene keeps
  the default dim treatment rather than being painted slot 0's color.
- **`legibleOn()` guarantees the name stays readable.** Live's palette contains colors
  far too dark to read on `--bg`, so the color is blended toward white only as far as a
  4.5:1 contrast ratio demands. Hue survives; pure black lifts to grey rather than
  vanishing.

## Performance notes

**Two sticky header rows, and they pin where they already are.** The rule is that a
stuck offset must equal the row's *flow* position, or the header changes height the
moment you scroll — which it did, by 4px. `border-spacing: 2px` applies at the table's
top edge as well as between rows, so measured down from the scroll box the group row
sits at 2 and the track-name row at `--group-h + 4`. Pinning them at `0` and
`var(--group-h)` swallowed both gaps. They now pin at `2px` and
`calc(var(--group-h) + 4px)`, so nothing moves at all.

That leaves two 2px bands of `border-spacing` inside the header for body rows to show
through, plus the side gutters between cells. Both are plugged by flat `box-shadow`
copies in `--bg` — a `0 0 0 2px` ring on the group row, and one either side on the
track-name row. Same color the gaps already were, so nothing looks different at rest.

The track-name row carries a **drop shadow** in the same list, last so the opaque plugs
paint over it — the header has to read as sitting *over* the grid rather than as another
row of it, the same job the footer's does pointing the other way. Each cell casts its
own; at a 14px blur two neighbours' falloff meets across a 2px gutter at slightly less
than one cell's centre, which is invisible. A hard-edged shadow would have striped the
grid once per column.

`--group-h` must still equal the group row's *rendered* height exactly. A table cell
treats `height` as a minimum, so nothing in that row may add to it — no vertical
padding, no inner element, and `line-height` plus the 1px rule fill the box. It was
1.5px off when an inner bordered span was doing the underline. **Measure after changing
it.** `.grid-wrap` carries no `padding-top`: the header pins 2px below it and the ring
covers exactly that, so padding there is a band where scrolled clip cells show through.

The whole block is **32px** — 13 + 2 + 15, one `line-height` and 2px of padding per row.
`button.bulk` is sized to the row rather than the row to it: 11px plus its 1px borders
is the track-name row's 13px, so *order…* and *color…* cost the header no height.

**Rows are `memo`ized.** `ClipGrid` renders `sceneCount` rows × non-group tracks —
around 6,800 cells at full size. Memoizing the row is what keeps toggling one cell
from re-rendering all 848 scenes. Without it this is *slower* than the vanilla
`innerHTML` version it replaced. Don't pass fresh object or array props into `Row`.

**No virtualization yet.** Mounting all rows is acceptable at current sizes. If it
stops being acceptable, `@tanstack/react-virtual` on the row list is the contained
fix — but measure first; the console breakdown reports `react commit` separately for
exactly this reason.

**Selection is a `Set` of `"t:s"` keys** held in `useGridSelection`. `selection.ts`
owns the encoding. Clips have no stable LOM id, so `(track, scene)` is the addressing within a
session.

**Play state must not reach `Row` as an object.** It changes several times a second while
the set is rolling, and the whole `PlayState` as a prop would re-render all 848 rows on
every change. `marksByScene` reduces it to one short string per *affected* scene — the
~846 rows with nothing happening get `undefined`, memo's identity check passes, and only
the one or two rows that changed re-render. Tokens are delimited (`|p3|`) so `p1` can't
match inside `p10`. That map is also built by walking the **tracks**, not the scenes: a
track contributes to at most two rows, so it's `O(trackCount)` rather than
`848 × trackCount` per change.

**The active cell lives in a ref as well as in state**, and this is not a micro-optimisation.
`onClip` is a prop on the memoized `Row`; if it closed over `active` it would get a new
identity on every arrow press and re-render the entire grid. `goActive` writes the ref and
the state together, so two keystrokes in one frame can't both read a stale value. The same
applies to `play.isPlaying`, which Space reads. **Don't put either in a dependency array of
anything that reaches `Row`.**

**Auto-scroll reads the DOM** — `querySelector('[data-active="1"]')` — rather than
threading a ref down, for the same reason: a fresh ref callback per render is a fresh prop.

**Lookups are `Map`s, not `.find()`.** Block selection can hand op assembly
thousands of cells at once, and a linear scan of the clip list per cell makes that O(n²),
which is enough to lock the tab up on a real set. The `clips` map is built once in
`useSnapshotLookups` and passed everywhere — `ClipGrid` included — rather than rebuilt
per consumer.

## Styling

Plain CSS with custom properties in `:root` — dark, IBM Plex where available with
system fallbacks. No CSS framework, no CSS-in-JS. The tokens (`--amber`, `--dim`,
`--bd`, …) come from the original design mocks; reuse them rather than introducing
new values.

`--col-w`, `--scene-col-w` and `--role-chip-w` are the exception: `:root` carries
fallbacks, but `ClipGrid` sets all three on the table element from `columnWidth.ts`, which
stays the one place the grid states a width. Only `--col-w` moves with the S/M/L setting.
See *Column widths*.
