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
| [`Select`](../src/controls/Select.tsx) | compact enum menu | an enum with one member on screen |
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
| [`Chain`](../src/chrome/Chain.tsx) | Live's device view | the run, the drop mark, what an empty one says, and how tall they all are |
| [`Rack`](../src/chrome/Rack.tsx) | `RackDevice` | the macro face and the chain list, bracketing the selected chain's devices |
| [`Row`](../src/chrome/Row.tsx) | Live's panel grid | controls on one line, sharing a caption height and a reading height |
| [`Panel`](../src/chrome/Panel.tsx) | Live's panel grid | repeated vertical lanes sharing section heights across the faceplate |

`Row` and `Panel` solve perpendicular alignment problems. A row aligns the caption,
control and reading *inside* unlike widgets. A panel aligns the sections *between*
repeated vertical lanes: every first section has one height, every second section another,
and so on. `PanelColumn` joins that shared grid through subgrid, while the faceplate still
owns each lane's width, background and contents. That is enough regularity to compose a
dense multi-band device without teaching the reusable chrome what the device is.

The title bar follows the same boundary. `Device` owns the universal activator, name,
folding and hot-swap behavior; `headerStart`, `headerAfterName` and `headerEnd` are slots
for the chrome that varies by device. The shell places those slots, but deliberately does
not grow concepts for save buttons, status marks or device-specific modes.

`Device` takes three states and not a device object, because three is all a shell shows:
`Device.name`, `Device.is_active`, `Device.View.is_collapsed`. Presets stay a callback —
swapping one means opening a browser this module has no business knowing about.

- **The rest of the shell** — rename, the preset chevron, a rack's title-bar buttons
- **More section rhythm** — `Row` lines up the insides of unlike controls on one line,
  while `Panel` aligns repeated vertical lanes. Bespoke spans and nested sections still
  belong to the faceplate composing them.
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

## Why a rack is a bracket

A rack *contains* chains, so the obvious drawing of it is a box with the chain inside. Live
doesn't draw it that way, and the reason is the height. Nesting a device inside the rack's
body costs it the rack's title bar and the body's padding — 33px on our metrics — so it
comes out visibly shorter than the device next to it, and shorter again one rack deeper.

So Live sandwiches instead: the rack's face on the left, a closing strip on the right, and
the chain's devices between them at full height. `Rack` renders those three as siblings —
a `Device` for the face, `.wdg-rack-devices` for the run, `.wdg-rack-end` for the cap —
and the bracket around them takes no space of its own. A selected rack draws an `outline`
rather than a border for the same reason: an outline doesn't participate in layout, so the
highlight can't push anything a pixel shorter.

Two things fall out. Folding a rack hides the devices and the cap, not just the face, so a
folded rack is one strip the way Live's is. And deactivating a rack dims the devices in it,
which needs saying explicitly now that they aren't its descendants in the shell any more.

The containment is still real — it's in the props, where a host passes the selected
chain's devices as `children`. It just isn't the drawing.

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
5. Render a [`Widget`](../src/controls/Widget.tsx) with your one element inside it, and
   extend `WidgetProps` instead of redeclaring `name`, `label`, `disabled`, `layout`,
   `className` and `title`. The frame writes the root's classes, the caption, the reading,
   the reserved width and the layout — none of those is yours to get right.
6. Style your element in [`shared.css`](../src/controls/shared.css) — the face, the type,
   the fill, the states — and write only its own geometry in `controls.css`. A control that
   draws its own border has already drifted.
7. Add a case to [the bench](bench.md) — including the disabled one. It's the only test
   these get.

## Six conventions worth knowing

**One height, and the chain owns it.** Live's device footer is a fixed height and every
device in it is that tall, so the height is fixed at the top and stretched down: a chain
fills its container or stands however many rows it's told, and everything in it stretches
to the chain — devices, racks, and the devices inside a rack alike. Nothing in the middle
owns a height, and a device on its own owns none either. It is as tall as its faceplate,
which is what a graph will want when there is no footer to fill.

That last clause is why a rack is [bookends rather than a box](#why-a-rack-is-a-bracket).
A device that got shorter for being in a rack, and shorter again for being in a rack in a
rack, would make the fixed height worth nothing at the depth where it matters most.

**In a chain, that height is also a width floor.** Live won't draw a device narrower than
it is tall, and the reason shows up the moment a faceplate is one switch: without a floor,
a device in a run collapses to a sliver with a title bar on it, unreadable and unclickable,
and a chain of them stops looking like a chain. So a device in a chain is at least square —
one rule, `min-width` reading the same `--wdg-device-min` the height does, because 1:1 is
the height by definition.

**Only in a chain.** A `Device` standing on its own keeps no minimum at all and is exactly
as wide as its faceplate. That isn't an oversight left for later: the graph is coming, and
on a canvas a node should be the size of what it holds rather than the size a strip needed
it to be. The floor belongs to the layout that needs it, which is the same reason the
height does. A folded device is exempt in both layouts — the whole point of folding is to
become a strip, and a square strip is not one.

The default is two rows, because that is Live's, and `--wdg-row-height` is 60px because
that is what one row of knobs comes to: a caption, a 34px dial and a reading. The check
that it's the right number is a stock rack, whose eight macros in two rows of four fill a
device exactly.

One gotcha, from custom properties inheriting: a nested chain resets `--wdg-chain-height`
to `initial` — the guaranteed-invalid value — so `var()` falls through to its `100%`
fallback instead of inheriting the outer chain's pixels. A chain inside a rack also drops
its own border, padding and well, because it isn't a container there — it's the middle of
the run, and 8px of inset is exactly the drift the bookends exist to avoid.

**A label is on top, a value is underneath — and no control decides that.** Every widget
is the same three regions: caption, control, reading. The value box and the switch are the
apparent exceptions and aren't — their reading is inside the control because the control
*is* the reading, so they pass no `readout` and the region isn't drawn.

[`Widget`](../src/controls/Widget.tsx) renders those regions, which is the whole point of
it. The rule used to live in this file and hold because everyone had read it; now a
control physically cannot name `wdg-caption`, `wdg-body` or `wdg-readout`, so it cannot
put one in the wrong place or nest it a level too deep. That last one is the failure worth
preventing: it looks right on its own and falls silently out of alignment in a `Row`.

Because those three parts are always direct children of the root,
[`Row`](../src/chrome/Row.tsx) can lay a whole line of controls into three bands through a
subgrid. Aligning siblings is easy; aligning their *insides* is what subgrid is for, and
it's the only reason a knob and a fader can share a caption height.

A knob's control region is shorter than its width. The dial remains the declared size and
its SVG geometry remains at the same scale, but the view box starts just above and ends
just below the 270° arc instead of reserving the unused top and bottom of a full circle.
The caption and readout keep their generic inter-region gaps and therefore stay in the
same shared bands as every other control's; only empty artwork space has left layout. The
resulting height is rounded to a whole pixel, so a default 34px knob occupies a 27px-tall
control region.

**`layout` is where the regions go; `orientation` is which way the control runs.** They
are different questions and merging them would be a mistake. `layout="inline"` puts the
caption and the reading beside the control instead of above and below it — an inspector
line rather than a faceplate — and it's the frame's, so every control gets it at once. A
slider's `orientation` is its track and its drag axis, and stays the slider's own. A
horizontal fader with its caption above it is ordinary, and both spellings have to be
sayable. In a `Row`, an inline widget takes the full height rather than one of the three
bands, so it lines up on the middle instead of arguing with the stacked ones.

**A control is the size of what it can say, not of what it is saying.** Every control
that reads a `Param` asks the model for its longest reading and reserves that much,
in `ch` so it lands right in the host's font — `widestText` in `format.ts`, through
`useReserved`. Sizing to the current reading instead means the box grows and shrinks
as the value counts, and every control to its right steps sideways for the whole of a
drag. Nothing in a widget wraps, either: a reading that outgrows its box is clipped,
because a control that changes height moves the row it's in. `Toggle` is the exception
and has to be — its label is the caller's, so it takes a `width`.

The compact fields still share one physical box: `NumberField`, `Toggle` and `Select`
all use `--wdg-height`, `--wdg-radius` and the same edge. A lit toggle changes its fill
and text, not its outside geometry or border, so it cannot grow or appear rounder when it
turns on. `Select` draws the same small arrow on every platform instead of surrendering
half a narrow field to native menu chrome. Device compositions make room around those
boxes; they never scale them.

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
