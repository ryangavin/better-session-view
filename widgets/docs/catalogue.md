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
| [`Slider`](../src/controls/Slider.tsx) | `live.slider` | a fader; horizontal too, for the crossfader's shape |
| [`NumberField`](../src/controls/NumberField.tsx) | `live.numbox` | drag, or type a digit / press Enter to edit |
| [`Toggle`](../src/controls/Toggle.tsx) | `live.toggle`, `live.button` | `momentary` gives the second |
| [`Segmented`](../src/controls/Segmented.tsx) | `live.tab` | an enum with every member on screen |
| [`Label`](../src/controls/Label.tsx) | `live.comment` | carries the type rhythm for a whole panel |
| `Divider` | `live.line` | in `Label.tsx` — same family, three lines |

**Reach for a filled `NumberField` before a horizontal `Slider`.** Live's own collapsed
fader is a value box you drag with the reading inside it — that's the Arrangement track
header's volume and pan — and it costs a third of the room while saying more, because
`travel` sets the drag distance independently of the drawn width. A vertical fader earns
its length: a column of them is readable at a glance without reading a number, which is
the mixer. On its side that advantage is gone. The orientation stays for the shape that
genuinely wants it, the crossfader, and for hosts we haven't met.

Not yet: `live.text` (a labelled toggle — `Toggle` with children is most of it),
`live.gain~` (a slider with a meter beside it), `live.meter~` (the mixer has one, and it
belongs here when the second caller appears), `live.arrows`, `live.drop`.

## Tier 2 — the chrome, which M4L has none of

The shell is built; the rest isn't, and it's what a device-chain footer still needs. A
faceplate of perfect knobs doesn't look like Ableton without it.

| widget | from | notes |
|---|---|---|
| [`Device`](../src/chrome/Device.tsx) | the LOM, not M4L | title bar, activator, fold triangle, hot-swap slot, folded strip |
| [`Chain`](../src/chrome/Chain.tsx) | Live's device view | the run, the drop mark, and what an empty one says |
| [`Rack`](../src/chrome/Rack.tsx) | `RackDevice` | the macro face, the chain list, the selected chain's devices |

`Device` takes three states and not a device object, because three is all a shell shows:
`Device.name`, `Device.is_active`, `Device.View.is_collapsed`. Presets stay a callback —
swapping one means opening a browser this module has no business knowing about.

- **The rest of the shell** — rename, the preset chevron, a rack's title-bar buttons
- **Parameter row and section rhythm** — Live's device panel is a strict grid, and that
  regularity is most of why it reads as one instrument rather than a pile of controls
- **The rest of the rack** — the chain-selector zone editor, Map mode, macro variations,
  and a chain's own mute and solo
- **Drum rack pad matrix**

## Why the chain is a line

Ableton's chain runs in series, and everything parallel is a rack: one device *in* that
series whose body holds chains, each serial again. `Chain` and `Rack` model that and
nothing more. A rack in a chain in a rack is ordinary, which is why `Rack` composes
`Device` instead of reimplementing a shell — a rack is a device, and the recursion falls
out for free.

The line is a **layout, not a structure**, and the distinction is what keeps a graph
possible later. `Chain` takes children, never a list of devices: a component that lays
its children in a row doesn't know why they're in that order, so the order stays the
app's and a node canvas can be a sibling layout over the same `Device` when there's
something to plug together. The piece missing that day is ports — in a strip, adjacency
*is* the connection and there's nothing to draw; a graph has to draw it. That's a slot
added to `Device`, not a rewrite of any of this.

Dragging follows [the gesture's](gesture.md) rule. `Chain` marks where a device would
land and stops there; whoever is dragging decides whether the move is legal and performs
it, the way a control emits a value and the host writes it to Live.

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
   Then name it into [`shared.css`](../src/controls/shared.css) — the face, the type, the
   fill, the states — and write only its own geometry in `controls.css`. A control that
   draws its own border has already drifted.
6. Add a case to [the bench](bench.md) — including the disabled one. It's the only test
   these get.

## Four conventions worth knowing

**A label is on top, a value is underneath.** Every widget is the same column: caption,
control, reading. The value box and the switch are the apparent exceptions and aren't —
their reading is inside the control because the control *is* the reading. One rule, so a
row of mixed controls lines up on its labels and again on its values instead of each
widget arguing its own case, and so `shared.css` can stack all five roots with one rule.

**A control is the size of what it can say, not of what it is saying.** Every control
that reads a `Param` asks the model for its longest reading and reserves that much,
in `ch` so it lands right in the host's font — `widestText` in `format.ts`, through
`useReserved`. Sizing to the current reading instead means the box grows and shrinks
as the value counts, and every control to its right steps sideways for the whole of a
drag. Nothing in a widget wraps, either: a reading that outgrows its box is clipped,
because a control that changes height moves the row it's in. `Toggle` is the exception
and has to be — its label is the caller's, so it takes a `width`.

**Fills grow from the middle when zero is the middle.** A pan at center is not a pan
turned all the way down, and Live draws the distinction — `live.dial` calls it the needle
mode. The test is where zero lands in the travel, not whether the range straddles it: a
volume fader runs -70 to +6 dB, and 0 dB near the top of that fills from the bottom like
any other level. `fill.ts` decides it once for the knob, the slider and the number field,
in JavaScript rather than a `calc()` because CSS `abs()` is younger than we want to
depend on.

A fill is always the full `--wdg-fill` — the same amber as a knob's arc, a lit switch and
a chosen tab, because one meaning should have one colour. The value box is the only place
text sits on a fill, and it draws its reading twice rather than dimming the fill to make
room: once in `--wdg-text`, once in `--wdg-fill-text` clipped to the filled part. The
number then reads dark on the fill and light off it, splitting at the edge.

**Switches take a boolean, not a `Param`.** Live models a device's on/off as a 0–1
`DeviceParameter`, but nothing about drawing a switch needs a range, a taper or a unit.
Pushing it through the param model would buy a conversion at every call site and no
behavior at all.
