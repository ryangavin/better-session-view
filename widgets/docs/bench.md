# The bench

`bench/`, served by `widgets/vite.config.ts`. A page of every control in every state, with
no app around it.

```sh
npm run dev              # everything at once — the bench is one of the five processes
npm run dev:widgets      # the bench alone, http://localhost:5273
```

It rides along in the full dev stack because it costs nothing to: no device, no Live, no
socket, and a Vite server that idles until something asks it for a module.

## Ports, and the one shared thing that isn't

The bench port follows the UI's rather than being a second thing to assign — `BSV_UI_PORT`
moves both, and `BSV_BENCH_PORT` overrides it outright. **The offset is 100, not 1**,
because worktree ports get picked adjacently: with +1, a worktree on 5174 would put its
bench on the UI of the worktree on 5175. `strictPort` is on for both, so a genuine
collision fails loudly rather than drifting.

| | default | |
|---|---|---|
| UI | 5173 | `BSV_UI_PORT` |
| bench | UI + 100 | `BSV_BENCH_PORT` |

The subtler one: **both Vite servers must name their own `cacheDir`.** The default
resolves to the same `node_modules/.vite` for both, and Vite hashes the config into that
cache's metadata — so two servers sharing it each decide the other's cache is stale and
re-optimize on every start, which is a browser full of `504 Outdated Optimize Dep` waiting
to happen. `ui/` uses `node_modules/.vite/ui` and the bench uses `node_modules/.vite/bench`.

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
Every case is genuinely live, with its own value. The control and chrome sections are
followed by composed device faces: these belong only to the bench, so they can reproduce
a stock device while proving that the reusable library underneath still knows nothing
about Live.

The last section is the point of the whole page: **the model playground**. Change the unit
style, range, exponent or step count and watch a knob, a slider and a number field all
change together, with the raw value and the formatted string printed underneath. It is the
fastest way to check a formatter, and it makes the model-first design visible — you are
changing the parameter, not the widget.

Composed faces use `Panel` rows to balance repeated parameter lanes. Side sections center
their own control groups naturally; their captions do not have to meet the parameter
lanes' alignment lines. Track heights should follow the dense side groups closely enough
that the repeated lanes have even outer margins rather than excess space between rows.

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

Add it to the section's grid in `Bench.tsx`. Use `Held` so it has its own value, and write
the note as what the case is *for*, not what the control is — "four steps across the
range, Max's own worked example" earns its space; "a knob" doesn't. Every new widget needs
at least a default case and a disabled one.
