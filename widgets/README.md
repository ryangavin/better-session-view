# widgets/

The controls a DAW is made of, built and iterated on outside the app they end up in.

This module exists because the device chain is coming, and after it a DAW of our own. A
knob written inside `ui/src/components/` would take a `BSV.MixerParameterState` within a
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
    Knob.tsx        live.dial
    Slider.tsx      live.slider
    NumberField.tsx live.numbox
    Toggle.tsx      live.toggle, and live.button when momentary
    Segmented.tsx   live.tab
    Label.tsx       live.comment, and Divider for live.line
    arc.ts          dial geometry
    fill.ts         where a fill starts, shared by all three value controls
    controls.css    every control's styling
  tokens.css        the widget tokens, resolved from the host's with fallbacks
  index.ts          the barrel — pulls in every stylesheet, so prefer deep imports
bench/              the harness. Dev-only; never built, never shipped
```

## Running the bench

```sh
npm run dev              # everything — bridge watchers, the UI on :5173, the bench on :5273
npm run dev:widgets      # the bench alone, http://localhost:5273
```

It has no connection to Live and never will — that's what makes it worth having, and why
it costs nothing to leave running in the full dev stack. Nothing in `bench/` is part of a
build; `npm run build` doesn't touch this module.

## Who uses it

`ui/` does, through one adapter: [`ui/src/lib/liveParam.ts`](../ui/src/lib/liveParam.ts)
turns a `BSV.MixerParameterState` into a `Param`. Today the mixer's volume, pan and send
controls are driven by the gesture hooks; the widgets themselves are waiting on the device
chain. See [ui/docs/mixer.md](../ui/docs/mixer.md).

**Nothing here may import from `ui/`, `bridge/`, `protocol/` or `core/`.** If a widget
needs something one of those has, it needs a prop instead.

## Verifying a change

`npm run typecheck` covers this module, and `npm test` runs `src/param/`'s suite alongside
the core one. The gesture and the controls have no automated coverage — they need a
pointer — so the bench is where they're checked, and a change to either should say so.
