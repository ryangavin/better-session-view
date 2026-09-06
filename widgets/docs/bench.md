# The bench

`bench/`, served by `widgets/vite.config.ts`. A page of every control in every state, with
no app around it.

```sh
npm run dev              # everything at once — the bench is one of the six processes
npm run dev:widgets      # the bench alone, http://localhost:5273
npm run dev:devices      # its opposite number, the device bench, on :5373
```

It rides along in the full dev stack because it costs nothing to: no device, no Live, no
socket, and a Vite server that idles until something asks it for a module.

## Ports, and the one shared thing that isn't

The bench port counts from the same base every dev server here does — `OPENFLOW_PORT_BASE`
moves both, and `OPENFLOW_BENCH_PORT` overrides it outright. **The offset is 100, not 1**,
because worktree ports get picked adjacently: with +1, a worktree on 5174 would put its
bench on the UI of the worktree on 5175. `strictPort` is on for both, so a genuine
collision fails loudly rather than drifting.

| | default | |
|---|---|---|
| set[flow] | 5173 | `OPENFLOW_PORT_BASE` (the base itself) |
| widget bench | UI + 100 | `OPENFLOW_BENCH_PORT` |
| device bench | UI + 200 | `OPENFLOW_DEVICE_BENCH_PORT` |

The device bench is [`set/bench/`](../../set/docs/device-faces.md#the-device-bench) and holds
the faces, which are composed in the app. Same offset reasoning at +200: a worktree keeps
all three of its servers clear of the next worktree's.

The subtler one: **all three Vite servers must name their own `cacheDir`.** The default
resolves to the same `node_modules/.vite` for both, and Vite hashes the config into that
cache's metadata — so two servers sharing it each decide the other's cache is stale and
re-optimize on every start, which is a browser full of `504 Outdated Optimize Dep` waiting
to happen. `set/` uses `node_modules/.vite/set`, the widget bench uses `node_modules/.vite/bench`, and
the device bench uses `node_modules/.vite/devices`.

## Why it's here rather than in the app

Iterating on a knob inside the session view means opening a set, opening the mixer, and
reasoning about a control while 848 rows of unrelated state are also on screen. The bench
shows every variant at once, including the ones that are annoying to reach in the app: a
disabled control, a parameter at its extremes, a taper you'd never set on a real device.

It also proves the boundary. The bench imports `widgets/src` and nothing else — no bridge,
no protocol, no `core/`. If a widget ever needs something from the app, the bench stops
building, which is the earliest possible warning.

## What's on it

Rooms down the side, and the chosen room's tabs across the top —
[`Rooms`](../src/debug/Rooms.tsx) over [`Workspace`](../src/debug/Workspace.tsx), which are
this module's own, so the page you read a widget on is built out of the widgets. Most rooms
are a section per control: a grid of cases with a note saying what the case is for, each
genuinely live and holding its own value. The chrome sections follow and stop where a shell
with a faceplate under it stops.

**Graph is the exception, and is a room rather than a section for a reason.** A knob is
right or wrong in a screenshot; a canvas is not. A cord that lands nine times out of ten
looks exactly like one that lands ten times out of ten, so that room carries an instrument
instead of more cases — see [the graph](graph.md#where-to-work-on-it) for what it counts and
why. It lives in `bench/GraphCases.tsx` and `bench/trace.ts` rather than in `Bench.tsx`.

**A whole stock device face is not on this page**, and the omission is the boundary again.
Composing one means naming a particular device, and a page that reproduces Live's EQ Eight
is a page that has to be right about Live's EQ Eight — which is a claim this module makes
about none of them. The face is composed in the app instead, out of these parts:
[`set/src/components/devices/eq8/Eq8.tsx`](../../set/src/components/devices/eq8/Eq8.tsx),
reasoned about in
[set/docs/device-faces.md](../../set/docs/device-faces.md). What the bench owes it is the
parts: a knob at every taper, a `Panel`'s aligned lanes, a `Device` shell folded and open.

The last section is the point of the whole page: **the model playground**. Change the unit
style, range, exponent or step count and watch a knob, a slider and a number field all
change together, with the raw value and the formatted string printed underneath. It is the
fastest way to check a formatter, and it makes the model-first design visible — you are
changing the parameter, not the widget.

## The host-tokens switch

`widgets/src/tokens.css` defines every colour and type token as `var(--host-token,
fallback)`, so a widget picks up the app's palette when it's mounted in the app and uses
its own when it isn't. The metrics below them — height, track, gap — are the widget's own
and take no host token, because a control's size is the module's decision; a host that
wants them different sets `--wdg-height`, `--wdg-field-height` and the rest directly. The switch in the bench header adds and removes the app's palette from the page, so
both halves of that chain can be seen. A widget that looks right only with host tokens
present is a widget that will look wrong the first time it's used anywhere else.

## What it doesn't do

No connection to Live, and there won't be one — that's what makes it worth having.

It is also **never built**. `widgets/vite.config.ts` has no `outDir`; `npm run build`
doesn't touch this module, and nothing in `bench/` ships. `npm run typecheck` does cover
it, which is what stops it rotting.

## Adding a case

Add it to the section's grid in `Bench.tsx`. `Held` and `Case`, and the made-up parameters
every case runs on, are in `bench/parts.tsx` — shared, because the page is no longer one
file. Use `Held` so the case has its own value, and write the note as what the case is
*for*, not what the control is — "four steps across the range, Max's own worked example"
earns its space; "a knob" doesn't. Every new widget needs at least a default case and a
disabled one.

## Adding a room

A room is a line in `ROOMS` at the top of `Bench.tsx`. Usually it is a title and a list of
section names, and the sections are drawn out of `Cases` like every other. A room that needs
more than that passes `tabs` instead — its own `Experiment`s, mounted directly — which is
what **Graph** does. Prefer the section list: bringing your own tabs is worth it when the
room is an instrument rather than a page, and not before.

## Play: a complete composition

The **Play** room mounts `bench/PlayCase.tsx`, a silent four-deck study for a future
mix[flow] play view. It composes existing widgets and `Waveform`, imports no app code,
and uses fictional tracks, sections and peaks. Reset tab restores its local state.

Four full-width waveforms share a 32-bar ruler and aligned playheads. Below them, five
strips appear in A, B, Master, C, D order. A shared subgrid aligns headers, launchers,
effects, mixer controls and footers. The master gets 156px; each deck shares the remaining
width with a 200px minimum. A single full-width master grid column centers every
row; paired controls, effect selectors and the crossfader use a common 126px span. Narrow panes scroll horizontally. Deck metadata fits within
the letter’s 24px header height. The compact launcher uses aligned 24px rows; there is
no alternate touch-target mode. Physical iPad usability still requires device testing.

Each deck has six named section buttons and four stem columns. A section button launches
all stems; a cell launches only its stem. Individual stops and the deck Stop follow the
same launch timing: immediate while paused or in Now mode, otherwise queued to the next
four-beat boundary. Switching to Now applies pending choices. Pause preserves selections
and pending changes. Master Stop clears selections, pending changes, the clock and loop.
There is no mute/solo state; launching and stopping stems chooses what plays.

The master groups Run/Pause and Stop, BPM and 1 bar/Now timing, two FX selectors and
global loop controls. FX A defaults to Delay and FX B to Reverb; both also offer Echo,
Chorus and Flanger. In marks the current integer beat. Out marks a later beat and engages
the loop across all four preview lanes. Exit loop releases it; Reloop returns to its
start. The same outlined region appears on every lane, and the ruler follows the current
32-bar page. These controls operate the silent preview, not an audio engine.

Fractional beat position advances with requestAnimationFrame and elapsed time. Playhead
refs update every frame; the React clock updates only on whole beats. A separate monotonic
beat counter keeps queued launches advancing even inside loops. Each PreviewMeter owns
its frame updates, samples the fractional clock, and applies 35ms attack/140ms release
smoothing before rendering the existing Meter. The whole mixer does not rerender per frame.
Pausing preserves fractional position; animation effects cancel their frame on cleanup.

Every strip has standard-sized FX A / Filter / FX B knobs. In the deck mixer, stem levels
stack left, the fader and meter occupy the middle, and Trim/High/Mid/Low stack right.
Master output sits left of the same trim/EQ stack. Output faders have 210px travel and
28px tracks, with adjacent 14px meters of the same length. Stem/channel levels, ±12dB trim,
crossfade assignments, crossfader and master level affect illustrative meters. Sends,
EQ, filter and headphone cue retain UI settings only.

Cue, A/Thru/B and Full share the shallow deck footer. The master footer holds the
crossfader without a visible caption/readout, retaining its accessible label and value.
Full selects an original unseparated track: stem cells, individual stops and levels dim
and disable, while section-name buttons and deck Stop control an independent full-mix
selection. Entering Full starts at the first selected stem section, or remains stopped
if none is selected. Stem state is preserved for switching back. Source changes are
immediate; section launches retain the selected timing. Full-mix meters ignore stem
levels but still follow trim, deck gain, crossfader and master.

## Play theme roles

`bench/PlayTheme.tsx` owns eight HSL roles: Primary, Signal, four stems, and the left
and right deck families. Existing widget inks and CSS variables apply them; no shared
palette or widget implementation changes. The Theme button opens a floating editor
built from Toggle, Select, Button and editable NumberField controls. It has Current favorite, Soft studio,
Night stage and Porcelain presets, a constrained randomizer, and hue/saturation/lightness
editing for each role. Changes apply immediately without resetting mixer controls.
Reset tab or leaving the room discards the theme. Preset matching switches to Custom
when edited; selecting a named preset restores all roles.

Primary saturation is capped at 12%; Signal hue is constrained to 120–160 degrees.
Primary drives selection, fader fills, trim, EQ and FX. FX captions stay subdued, with
no separate identity color. Stem levels and launcher buttons share exclusive hue families; stem captions
above knobs and launch columns use a muted tint (45% stem ink blended with the caption gray), preserving identity
without the brightness of the control fill. Presets/randomization reserve green for signal, and keep stem hues apart from
each other and the two deck families. Manual editing warns when a stem is within 30 hue
degrees of another saturated role (saturation at least 18%). This is an editing aid,
not a perceptual or color-vision certification; evaluate the rendered result too.

Deck families retain equal lightness and saturation. B/D shift up to eight hue
degrees toward warm orange from A/C; letters and
narrow waveform-label edges carry identity. Waveform silhouettes blend 65% deck color
with neutral gray to keep large filled areas quieter. Physical deck identity stays fixed
when crossfade assignments change. Randomization builds a fresh seven-family hue wheel anchored on green signal, then
shuffles the remaining six families across stems and deck pairs. Hue spacing preserves
identity separation; shared saturation/lightness ranges keep the palette cohesive.

EQ explicitly fills from 0dB despite its asymmetric −24/+12dB range. Neutral EQ, trim,
filter and sends have no colored arc; stem levels and faders always show their level.
A small divider separates trim from EQ. Faders/meters omit visible captions but retain
accessible labels. The active theme sets the bench body's primary/hover/muted variables;
cleanup restores the stylesheet fallback when the Play room unmounts.

## Collapsing navigation

The bench’s top-left sidebar toggle hides the room list without unmounting the active
experiment. Its collapsed menu button remains available beside the experiment tabs.
`bench-sidebar` remembers the choice through `useRemembered`. This is bench-owned
layout state; the shared Rooms widget and other app harnesses are unchanged. Hiding
the sidebar gives the mixer the full available browser width for layout checks.

The master FX selectors include their A/B labels inside the dropdown face (A · Delay,
B · Reverb), so both controls span the same width as the other master control groups.

The bench stylesheet locally overrides the primary accent tokens (`--amber` and its
hover/muted variants) with silver-blue. This is the fallback when the Play theme editor is not mounted; the active theme
controls these tokens while Play is open. Other application windows are unchanged.

The theme editor also has **Roll hue**, **Roll sat**, and **Roll light** for the selected
role. Each changes only that component. Hue rolls seek a separated hue family; primary
stays nearly neutral and signal stays green. Saturation and lightness rolls use restrained
ranges; manual fields remain available for wider experimentation.

Four live sliders control deck variation: **B/D warmth offset** (negative cooler,
positive warmer), **B/D saturation offset**, **B/D lightness offset**, and **Waveform
color strength**. The first three change B/D relative to the A/C base colors, together
for both pairs. Strength controls how much deck color appears in all waveform fills.
**Reset variation** restores warmth 8, saturation/lightness offsets 0, and strength 65%.
Changing presets or rolling role colors preserves these variation settings; Reset tab
resets everything. Variation settings remain temporary.
