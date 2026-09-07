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

The **Play** room mounts `bench/PlayCase.tsx`, a thin wrapper around the reusable
`src/mixer/MixerView.tsx` and `bench/usePreviewMixer.ts`. The view's contract and
integration boundary are documented in [mixer.md](mixer.md). The same controlled face
can be driven by a future mix adapter without importing bench simulation into the app.

The preview hook owns the fictional songs, sections and peaks, queued launches, source
switching, loop decisions, simulated clock and meters. The face receives state, semantic
commands, parameter definitions, resolved theme colors and a read-only frame sampler.
The face does not advance the clock or decide that a launch succeeded. Playheads and
meters update independently at animation-frame cadence; the rest follows host state.

The visual composition remains four full-width waveforms above A, B, Master, C and D.
A shared subgrid aligns headers, launchers, FX, mixer and footer rows. Each deck has
four stem columns and named section buttons. The compact master contains transport,
launch timing, effects and loop controls. Faders/meters sit beside stem levels and EQ;
Cue, A/Thru/B and Full share the footer. A 156px master and 200px minimum deck widths
preserve the compact layout; narrower panes scroll. Physical iPad usability still needs
device testing.

Run starts the silent simulation; 1 bar queues changes, Now applies them immediately.
Pause holds pending choices. Stop clears selections, queues, loops and position. In/Out
mark a global preview loop, and Exit/Reloop release or re-engage it. Full selects the
first active stem section for the original-track preview and preserves stem selections
for returning. These are fixture policies, not behavior implemented by MixerView.
Reset tab restores the initial composition and theme. No audio is produced.

## Play theme roles

The Play wrapper mounts a shared `ThemeRoot` and controlled `ThemeEditor` from
`src/theme/`. The [theme topic](theme.md) owns the role model, palette rules, presets,
randomization and derived label/deck colors. Bench owns only its floating Theme button
and temporary state. The editor is the same component used in mix's app-wide Theme modal.

Current favorite preserves the chosen palette. Presets include all role colors, surfaces
and deck variation; selecting a preset restores that whole document. Randomize and
individual H/S/L rolls retain variation. Reset tab or leaving Play discards theme edits
along with the preview. No theme state is written to body or browser storage by widgets.

## Collapsing navigation

The bench’s top-left sidebar toggle hides the room list without unmounting the active
experiment. Its collapsed menu button remains available beside the experiment tabs.
`bench-sidebar` remembers the choice through `useRemembered`. This is bench-owned
layout state; the shared Rooms widget and other app harnesses are unchanged. Hiding
the sidebar gives the mixer the full available browser width for layout checks.

The master FX selectors include their A/B labels inside the dropdown face (A · Delay,
B · Reverb), so both controls span the same width as the other master control groups.

The bench stylesheet locally overrides the primary accent tokens (`--amber` and its
hover/muted variants) with silver-blue. This is the fallback when the Play theme editor is not mounted; the theme editor scopes its override to the Play composition. Other application windows are unchanged.

The theme editor also has **Roll hue**, **Roll sat**, and **Roll light** for the selected
role. Each changes only that component. Hue rolls seek a separated hue family; primary
stays nearly neutral and signal stays green. Saturation and lightness rolls use restrained
ranges; manual fields remain available for wider experimentation.

Four live sliders control deck variation: **B/D warmth offset** (negative cooler,
positive warmer), **B/D saturation offset**, **B/D lightness offset**, and **Waveform
color strength**. The first three change B/D relative to the A/C base colors, together
for both pairs. Strength controls how much deck color appears in all waveform fills.
**Reset variation** restores warmth 8, saturation/lightness offsets 0, and strength 65%.
Changing presets restores their saved variation; rolling role colors preserves it.
Reset tab resets everything. Bench variation settings remain temporary.
