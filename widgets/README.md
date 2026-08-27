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
| [the graph](docs/graph.md) | the node canvas, ports, cords, or who owns a position | `src/chrome/Graph.tsx`, `Port.tsx`, `graphContext.ts` |
| [the bench](docs/bench.md) | the dev harness, or adding a case to it | `bench/*`, `vite.config.ts` |

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
  tokens.css        the widget tokens: colour and type from the host, metrics ours
  index.ts          the barrel and the package entry — pulls in every stylesheet,
                    so prefer deep imports
bench/              the harness. Dev-only; never built, never shipped
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
import '@openflow/widgets/tokens.css';
```

**The specifier carries the real TypeScript extension**, because that is the file that is
actually there — `exports` maps straight onto `src/`, and nothing is compiled in between.
Vite and `tsc` both consume the source, so there is no build step between this module and
the app that uses it, and no `dist/` to go stale while you work.

`npm run build:widgets` does exist, but it emits **declarations only** into `dist/`, and it
is not part of `npm run build`. Nothing imports those — they are there for the design-system
sync in [`.design-sync/`](.design-sync/config.json), which reads a package's `.d.ts` to
recover each component's props.

## Who uses it

`set/` and `visuals/` both do, each through one adapter.
[`set/src/lib/liveParam.ts`](../set/src/lib/liveParam.ts) turns an `OpenFlow.MixerParameterState`
into a `Param`, and [`visuals/src/ui/param.ts`](../visuals/src/ui/param.ts) does the same
for a node's inlet. The mixer's volume, pan and send controls are driven by the gesture
hooks ([set/docs/mixer.md](../set/docs/mixer.md)); the device chain draws a track's devices
out of the chrome ([set/docs/device-chain.md](../set/docs/device-chain.md)); the visuals
designer draws its node canvas out of `chrome/Graph.tsx` and `chrome/Port.tsx`.

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
