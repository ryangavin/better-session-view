# widgets/

The controls a DAW is made of, built and iterated on outside the app they end up in.

This module exists because the device chain is coming, and after it a DAW of our own. A
knob written inside `set/src/components/` would take an `OpenFlow.MixerParameterState` within a
week and stop being reusable the moment it did. So the boundary is the point: **`widgets/`
imports no protocol, no bridge client, no `core/`, and nothing that knows Live exists.** It
takes a `Param` and a number.

That is the same rule `core/` has, turned the other way round — `core/` is domain logic
with no React, this is React with no domain.

## Where the reasoning lives

**Read the row you need, not the set.**

| doc | read it before touching | source |
|---|---|---|
| [the parameter model](docs/param-model.md) | what a control *is*, ranges, tapers, steps, how a value is spelled | `src/param/param.ts`, `format.ts` |
| [the gesture](docs/gesture.md) | dragging, the fine modifier, keys, write rate, the local-value hold | `src/gesture/*` |
| [the catalogue](docs/catalogue.md) | **adding a widget** — what exists, what's next, and what Max for Live does and doesn't tell you | `src/controls/*` |
| [the graph](docs/graph.md) | the node canvas, ports, cords, who owns a position — and the room the bench measures it in | `src/chrome/Graph.tsx`, `Port.tsx`, `graphContext.ts`, `bench/trace.ts` |
| [notation displays](docs/notation.md) | tablature, a piano roll, their timelines, or the app/widget boundary | `src/notation/*` |
| [the bench](docs/bench.md) | the dev harness, or adding a case or a room to it | `bench/*`, `vite.config.ts` |
| [the debug module](docs/debug.md) | building a debugging page in an app: the frame, a time axis, plots, a transport | `src/debug/*` |

## The shape of it

```
src/
  param/
    param.ts        Param: kind, range, taper, steps, default — and the maths on it
    format.ts       how a value is spelled, when nothing more authoritative is
  gesture/
    useParamGesture.ts   the drag every continuous control shares
    usePendingValue.ts   showing what you just did until the engine agrees
    platform.ts          which key means fine
  controls/
    Widget.tsx      the frame every control sits in: caption, control, reading
    Knob.tsx        live.dial
    Slider.tsx      live.slider
    Meter.tsx       live.meter~, read-only
    NumberField.tsx live.numbox
    Toggle.tsx      live.toggle, and live.button when momentary
    Segmented.tsx   live.tab
    Select.tsx      a compact enum with one member on screen
    Button.tsx      a plain push, for a verb rather than a parameter
    XYPad.tsx       two parameters on one plane, with a slot for a device's artwork
    Label.tsx       live.comment, and Divider for live.line
    arc.ts          dial geometry
    fill.ts         where a fill starts, shared by all three value controls
    wake.ts         the trail behind an arriving number, and the warmth in its reading
    reserve.ts      space for the longest reading, so a control never resizes
    shared.css      the parts every control is made of: face, type, states, layout
    controls.css    what's left after that — each control's own geometry
  chrome/
    Device.tsx      the shell a faceplate sits in, folded or open
    Chain.tsx       the run it sits in — children, so it never owns the order
    Graph.tsx       the canvas it sits on instead — the sibling layout, and the cords
    Port.tsx        where a cord ends. Two slots on Device, and nothing in a chain
    graphContext.ts what a port and a node need from the surface under them
    Rack.tsx        a device holding chains: the macro face and the chain list
    Row.tsx         controls on one line, in three bands, through a subgrid
    Panel.tsx       aligned vertical parameter lanes, through a shared row grid
    chrome.css      their styling, on the same shared parts
  notation/
    Tablature.tsx   string lines, plain fret figures and quiet duration hairlines
    PianoRoll.tsx   keyboard rows, note blocks, musical ruling and a movable playhead
    notation.css    shared notation geometry; hosts supply musical meaning
  palette.css       the design language itself: surfaces, the text ramp, the accents,
                    the type stacks, the radii and the 22px control height. Every app
                    here imports it; DESIGN.md is what it means
  tokens.css        the widget tokens: colour and type from the palette, metrics ours
  index.ts          the barrel and the package entry — pulls in every stylesheet,
                    so prefer deep imports
bench/              the harness. Dev-only; never built, never shipped
  parts.tsx         the card every case sits in, and the parameters they run on
  GraphCases.tsx    the Graph room: a canvas with an instrument on it, not a page of cases
  trace.ts          that instrument — what the hand did, against what the graph made of it
```

## Running the bench

```sh
npm run dev              # everything — bridge watchers, the UI on :5173, the bench on :5273
npm run dev:widgets      # the bench alone, http://localhost:5273
```

The faces built *out of* these parts have a bench of their own in the app —
`npm run dev:devices`, and [set/docs/device-faces.md](../set/docs/device-faces.md). This one
may not import from there, which is what keeps a widget from learning what a device is.

It has no connection to Live and never will — that's what makes it worth having, and why
it costs nothing to leave running in the full dev stack. Nothing in `bench/` is part of a
build; `npm run build` doesn't touch this module.

## Importing it

This module is the npm package `@openflow/widgets`, an npm workspace like every
dependency-free module here, so it is reached by name rather than by counting `../` up out
of wherever you happen to be:

```ts
import { Knob } from '@openflow/widgets/controls/Knob.tsx';
import type { Param } from '@openflow/widgets/param/param.ts';
import '@openflow/widgets/palette.css';
```

Only the palette needs importing by hand: every control pulls `controls.css` in, and that
pulls `shared.css` and `tokens.css` behind it.

**The specifier carries the real TypeScript extension**, because that is the file that is
actually there — `exports` maps straight onto `src/`, and nothing is compiled in between.
Vite and `tsc` both consume the source, so there is no build step between this module and
the app that uses it, and no `dist/` to go stale while you work.

`npm run build:widgets` does exist, but it emits **declarations only** into `dist/`, and it
is not part of `npm run build`. Nothing in this repo imports those — they are there for an
external design-system sync, which reads a package's `.d.ts` to recover each component's
props. That sync's config and its copy of the tokens used to live in `.design-sync/` and
were removed on 2026-09-01: the sync had never completed and will be set up again from
scratch. The script stays because it is what such a tool needs from us.

## Who uses it

`set/`, `visuals/` and `mix/` all do. The first two go through one adapter each;
[`set/src/lib/liveParam.ts`](../set/src/lib/liveParam.ts) turns an `OpenFlow.MixerParameterState`
into a `Param`, and [`visuals/client/ui/param.ts`](../visuals/client/ui/param.ts) does the same
for a node's inlet. The mixer's volume, pan and send controls are driven by the gesture
hooks ([set/docs/mixer.md](../set/docs/mixer.md)); the device chain draws a track's devices
out of the chrome ([set/docs/device-chain.md](../set/docs/device-chain.md)); the visuals
designer draws its node canvas out of `chrome/Graph.tsx` and `chrome/Port.tsx`.

`mix/` needs no adapter, which is the interesting case: it has no Live and no protocol, so
it writes a `Param` literal where it wants a control and hands it a number. A stem's level
is a `float` from 0 to 1 and nothing else had to exist for the fader to work — see
[mix/docs/window.md](../mix/docs/window.md) for which controls it uses and why its fader
takes a `length` rather than `layout="inside"`.

**A whole stock device face is composed there too, and deliberately not here.** Live's EQ
Eight is [`set/src/components/devices/eq8/Eq8.tsx`](../set/src/components/devices/eq8/Eq8.tsx):
the parts are this module's, the arrangement of them is one particular device, and a module
that knows about no device can't hold one. See
[set/docs/device-faces.md](../set/docs/device-faces.md).

**Nothing here may import from `set/`, `bridge/`, `protocol/` or `core/`.** If a widget
needs something one of those has, it needs a prop instead.

## Verifying a change

`npm run typecheck` covers this module, and `npm test` runs `src/param/`'s suite alongside
the core one. The gesture and the controls have no automated coverage — they need a
pointer — so the bench is where they're checked, and a change to either should say so.
