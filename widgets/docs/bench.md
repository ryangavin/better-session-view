# The bench

`bench/`, served by `widgets/vite.config.ts`. A page of every control in every state, with
no app around it.

```sh
npm run dev:widgets      # http://localhost:5174
```

## Why it's here rather than in the app

Iterating on a knob inside the session view means opening a set, opening the mixer, and
reasoning about a control while 848 rows of unrelated state are also on screen. The bench
shows every variant at once, including the ones that are annoying to reach in the app: a
disabled control, a parameter at its extremes, a taper you'd never set on a real device.

It also proves the boundary. The bench imports `widgets/src` and nothing else — no bridge,
no protocol, no `core/`. If a widget ever needs something from the app, the bench stops
building, which is the earliest possible warning.

## What's on it

One section per control, each a grid of cases with a note saying what the case is for.
Every case is genuinely live, with its own value.

The last section is the point of the whole page: **the model playground**. Change the unit
style, range, exponent or step count and watch a knob, a slider and a number field all
change together, with the raw value and the formatted string printed underneath. It is the
fastest way to check a formatter, and it makes the model-first design visible — you are
changing the parameter, not the widget.

## The host-tokens switch

`widgets/src/tokens.css` defines every widget token as `var(--host-token, fallback)`, so a
widget picks up the app's palette when it's mounted in the app and uses its own when it
isn't. The switch in the bench header adds and removes the app's palette from the page, so
both halves of that chain can be seen. A widget that looks right only with host tokens
present is a widget that will look wrong the first time it's used anywhere else.

## What it doesn't do

No connection to Live, and there won't be one — that's what makes it worth having.

It is also **never built**. `widgets/vite.config.ts` has no `outDir`; `npm run build`
doesn't touch this module, and nothing in `bench/` ships. `npm run typecheck` does cover
it, which is what stops it rotting.

## Adding a case

Add it to the section's grid in `Bench.tsx`. Use `Held` so it has its own value, and write
the note as what the case is *for*, not what the control is — "four steps across the
range, Max's own worked example" earns its space; "a knob" doesn't. Every new widget needs
at least a default case and a disabled one.
