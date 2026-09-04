# The debug module

`src/debug/`, exported as `@openflow/widgets/debug/*`. The frame a debugging page is built in,
and the parts that go in it, so a harness in any of the apps is the same shape and in the
suite's chrome instead of a page that grows its own bar, its own group and its own idea of
a caption.

The first one built on it is mix[flow]'s analysis harness — [`mix/docs/harness.md`](../../mix/docs/harness.md).

## What's in it

| | |
|---|---|
| `Harness` | the frame: a title, what is under the lens, the status, the body |
| `Toolbar`, `Group` | a line of captioned groups of the ordinary controls — `Button`, `Toggle`, `Segmented`, `Select`, `NumberField` |
| `Status` | one line that says how things stand, in a tone |
| `Facts` | names and values, read at a glance |
| `Legend` | what the marks on a drawing mean: line, tall, dashed, swatch, dot, text |
| `Plot` | a titled canvas with a caption under it, drawn by callback, with the pointer's x |
| `Scope`, `ScopeRow` | labelled rows of canvases on one time axis, with the head, the loop and the pointer drawn over all of them |
| `useAxis` | the window, the head and the loop of a scope, and the moves a person makes on them |
| `Transport` | play, stop, the clock, the latency; no audio in it |
| `useCanvas` | a canvas that fits its box at device pixels and redraws when its callback changes |
| `useRemembered` | a choice kept between refreshes, guarded |
| `ink`, `inkOf` | a palette token as the page resolves it, for a canvas |

`axis.ts` is the arithmetic on its own — pixels to seconds, zoom about a point, clamp to the
whole — and is tested; the hook that owns the state stays thin.

## The boundary

The module knows nothing about what it frames. A row is a label, a height and a draw callback
that gets a `View` — the window in seconds and the box in pixels — and the caller draws
whatever it has: a stem, the onsets heard in it, a beat map. Audio, the beat maths, the IPC
and the report types stay in the app and are handed in as props and callbacks. `src/debug`
imports `src/` and nothing else, the same rule the bench keeps.

## The gestures a scope has

On the row marked `ruler`: click to seek, drag to pan, shift-drag for a loop, alt-drag or a
drag on the head to scrub through `scrub`. Over the whole scope: scroll pans, shift-scroll or
cmd-scroll zooms about the pointer. Any row gets the pointer in seconds through `onPointer`,
with the down captured so the moves and the up follow to the same row.

## Inks

A canvas cannot read `var(--fg)`, so a draw callback reads its inks off the element it is in
with `ink(el, '--fg', fallback)`, once per draw. A harness drawn that way follows the palette
wherever it is mounted, which is what the hex literals the old pages carried did not.

## Where to see it

The **Debug** section of the widget bench (`npm run dev:widgets`) is a harness with nothing
under it: a made-up signal, beats every half second, a head on the wall clock.

## Tabs and experiments

`Workspace<Context>` is the multipurpose host above individual harnesses. It accepts an
`experiments` registry, a host-owned `context`, and controlled `selected` / `onSelect`
props. Each `Experiment<Context>` has a stable `id`, a `title`, a short `description`,
and a `component` receiving `{ context }`. That component may render any React content:
a harness, a canvas, a form, a table, or a whole experimental interface.

Only the selected component mounts. Switching tabs tears down its effects; **Reset tab**
remounts it. A render error stays inside that tab with a visible error and can be reset.
Tabs support arrow keys, Home and End. An unknown saved ID falls back to the first entry.
The host decides whether to remember the selection, and keeps domain types out of widgets.
Keep the registry and component definitions outside the host render to preserve identity.

An experiment must clean up its own playback, listeners, workers and asynchronous jobs
on unmount, and display asynchronous failures itself (React boundaries cover rendering,
not promises or event handlers). Keep useful settings in `useRemembered` if they should
survive tab switches; reset only clears in-memory state, not remembered preferences.
See `mix/src/debug/Workspace.tsx` for an actual registration with app context.
