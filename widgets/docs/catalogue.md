# The catalogue

What exists, what's next, and where the list came from. `src/controls/`.

## Where the list came from, and where it didn't

The obvious starting point is Max for Live's UI objects, and it is half right.

Live 12.4.3's bundled Max ships 33 `live.*` objects. About half draw anything; the rest
are glue (`live.object`, `live.path`, `live.observer`, `live.thisdevice`, `live.param~`,
`live.remote~`, `live.routing`, `live.banks`, `live.push`, `live.colors`, the
`live.miditool` pair, `live.adsr~`, `live.modulate~`) or the shared GUI library
(`live.guilib`) the drawn ones are implemented in.

The trap is that **the M4L palette is the set for *building* a device, not the set
Ableton's own devices are drawn from.** It contains things no stock device shows
(`live.grid`, `live.step`, `live.drop`, `live.scope~`) and is missing everything a device
*chain* is made of — the device shell with its activator and fold triangle, the chain
strip, rack macros, the chain-selector zone editor, the drum pad matrix. None of those are
`live.*` objects, and all of them are on screen before a single knob is.

What the M4L set gives us authoritatively is the **parameter model**, not the widget list.
That is in [param-model.md](param-model.md), and it's why this file is a consequence
rather than a plan.

## Tier 1 — the primitives most of a stock device is made of

Built.

| widget | M4L object | notes |
|---|---|---|
| [`Knob`](../src/controls/Knob.tsx) | `live.dial` | 270° sweep opening at the bottom, like Ableton's |
| [`Slider`](../src/controls/Slider.tsx) | `live.slider` | vertical or horizontal; same hook as the knob |
| [`NumberField`](../src/controls/NumberField.tsx) | `live.numbox` | drag, or type a digit / press Enter to edit |
| [`Toggle`](../src/controls/Toggle.tsx) | `live.toggle`, `live.button` | `momentary` gives the second |
| [`Segmented`](../src/controls/Segmented.tsx) | `live.tab` | an enum with every member on screen |
| [`Label`](../src/controls/Label.tsx) | `live.comment` | carries the type rhythm for a whole panel |
| `Divider` | `live.line` | in `Label.tsx` — same family, three lines |

Not yet: `live.text` (a labelled toggle — `Toggle` with children is most of it),
`live.gain~` (a slider with a meter beside it), `live.meter~` (the mixer has one, and it
belongs here when the second caller appears), `live.arrows`, `live.drop`.

## Tier 2 — the chrome, which M4L has none of

Not built, and the actual next step for a device-chain footer. A faceplate of perfect
knobs still doesn't look like Ableton without it.

- **Device shell** — title bar, activator, fold/unfold triangle, preset chevron, hot-swap
- **Parameter row and section rhythm** — Live's device panel is a strict grid, and that
  regularity is most of why it reads as one instrument rather than a pile of controls
- **Chain strip** — the horizontal run of devices, with drop indicators between them
- **Rack** — the macro bank, the chain list, the chain-selector zone editor, Map mode
- **Drum rack pad matrix**

## Tier 3 — the bespoke displays

Listed so they aren't forgotten, deliberately last. Each is one device's idea, and none of
them shares anything with the others except the gesture.

ADSR envelope (`live.adsrui` is a real head start), EQ Eight curve, XY pad (Auto Filter),
waveform display (Simpler), transfer function (Saturator, Roar), oscilloscope
(`live.scope~`), matrix (`live.grid`), step lanes (`live.step`).

## Adding one

1. If it needs something the model can't say, fix [the model](param-model.md) first — but
   check that it really can't, because the answer is usually a prop.
2. If it's continuous, it uses `useParamGesture`. Don't write a second drag.
3. Take `display` and prefer it over `format`. The host may have a better spelling.
4. Take `className`, and put anything positional on CSS custom properties, so a host can
   restyle it without forking it.
5. Root element gets `wdg` plus its own class, so [the tokens](../src/tokens.css) apply.
6. Add a case to [the bench](bench.md) — including the disabled one. It's the only test
   these get.

## Two conventions worth knowing

**Fills grow from the middle when the range has two sides.** A pan at center is not a pan
turned all the way down, and Live draws the distinction — `live.dial` calls it the needle
mode. `fill.ts` decides it once for the knob, the slider and the number field, in
JavaScript rather than a `calc()` because CSS `abs()` is younger than we want to depend on.

**Switches take a boolean, not a `Param`.** Live models a device's on/off as a 0–1
`DeviceParameter`, but nothing about drawing a switch needs a range, a taper or a unit.
Pushing it through the param model would buy a conversion at every call site and no
behavior at all.
