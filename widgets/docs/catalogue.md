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
| [`XYPad`](../src/controls/XYPad.tsx) | `live.pictslider` | two parameters on one plane, with a slot for a device's own artwork |
| [`Meter`](../src/controls/Meter.tsx) | `live.meter~` | a level, read-only. Optional peak hold |
| [`Button`](../src/controls/Button.tsx) | none | an action that is not a parameter |

**Reach for a filled `NumberField` before a horizontal `Slider`.** Live's own collapsed
fader is a value box you drag with the reading inside it — that's the Arrangement track
header's volume and pan — and it costs a third of the room while saying more, because
`travel` sets the drag distance independently of the drawn width. A vertical fader earns
its length: a column of them is readable at a glance without reading a number, which is
the mixer. On its side that advantage is gone. The orientation stays for the shape that
genuinely wants it, the crossfader, and for hosts we haven't met.

**`layout="inside"` is the compact graph-row shape.** `Widget` lays the caption at the
leading end and the reading at the trailing end, both over a horizontal body, so the control
is its own label and one line says the whole parameter. A horizontal `Slider` fills the
available width in that layout rather than taking its ordinary fixed length. It is a layout
of the shared frame, not a node-specific control, and `stacked` and `inline` remain unchanged.

**The pad is one pointer and two gestures**, not a new drag. It calls `useParamGesture`
once per axis and hands both the same pointer events, so each keeps its own component of
the movement and the fine modifier, the write rate and double-click-to-reset are the ones
every other control has. The anchor is the one thing it doesn't share: a plane presses to
the pointer rather than grabbing where the value already is, for the reason in
[the gesture](gesture.md), and a caller drawing many handles on one plane can take the
knob's bargain back with `anchor="value"`. The keyboard falls out of the same arrangement: each
axis is a `role="slider"` of its own with the full `aria-value*` set, so tabbing lands on
one axis at a time and the arrows mean something on a control with two of them.

Not yet: `live.text` (a labelled toggle — `Toggle` with children is most of it),
`live.gain~` (a slider with a meter beside it, now that both halves exist), `live.arrows`,
`live.drop`.

**And a waveform**, which is the clearest candidate this list has ever had and still has
only one caller. [`mix/src/components/Waveform.tsx`](../../mix/src/components/Waveform.tsx)
draws a stem's peaks on a canvas — one min/max pair per column, which is what a peak file
holds — and knows nothing about Live, a stem or a file. It moves here the day set[flow]
draws a clip's audio, by the same rule that kept `Meter` out until a second caller
appeared. Until then it is one app's component, and the cost of being wrong about the
shape is one app's.

**Notation arrived when there were two real views to compare.** `Tablature` and
`PianoRoll` share timeline geometry but do not pretend to share their hosts' musical
judgement. They take already-labelled strings, keys and events; chart[flow] still owns
degree colour and its fifth-string mark, while mix[flow] still owns fret assignment,
absolute pitch-class colour and transcription confidence. The display boundary is in
[notation.md](notation.md).

**`Meter` arrived when the second caller did**, which is what this list said would happen.
The first was a mixer strip. The second is a signal a look is being driven by, and it is
the one that makes a meter a widget rather than a bar the mixer draws: a *hand-driven*
signal can be a slider, because you set it and can see where you set it, but a **generated**
one has no handle to look at. An envelope pulsing on the beat is invisible without a
display, and you end up guessing at what the picture is reacting to.

It now uses the same `Widget` frame as the value controls. Its existing face is unchanged by
default; `showValue` adds the rounded 0–100 reading, `display` can replace that text, and
`layout="inside"` gives a generated signal the same one-line anatomy as a settable slider
without pretending the meter has a handle.

**`Button` is the one thing here that is not a `live.*` object at all**, and the reason is
in the first paragraph of this file: the M4L palette is the set for building a *device*, and
a device is made of parameters. Every other control reports a value the host writes
somewhere; a button reports that it happened and leaves nothing behind. That is why it
could not be `Toggle` with `momentary` — a momentary toggle is a parameter that springs
back, so it has an on state, an `aria-pressed` and a boolean the caller does not want.

Delete, close, add and cut are the vocabulary of an **editor** rather than a device, and
the graph canvas is an editor. Every one of them had been hand-rolled at the call site
before this existed — twice over, in two stylesheets, in two shapes.

The compact vertical slider defaults to the same 27px body height as the cropped knob,
so a mixed `Row` keeps the generic 2px caption and readout gaps for both. A layout that
genuinely needs a long fader passes its length explicitly; that is travel, not a scaled
version of the compact control.

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
| [`Graph`](../src/chrome/Graph.tsx) | neither — a DAW of our own | the canvas layout, the cords, pan and zoom. See [the graph](graph.md) |
| [`Port`](../src/chrome/Port.tsx) | neither | where a cord ends. `Device` grew two slots for them |
| [`Modal`](../src/chrome/Modal.tsx) | neither — an editor's, not a device's | a `<dialog>`: the top layer, the scrim, the focus trap and escape |
| [`Popup`](../src/chrome/Popup.tsx) | neither | a panel hung off a control: the top layer, the flip, and the three ways it goes away |

`Modal` is in this tier for the reason `Button` is in the last one: it belongs to the
vocabulary of an *editor* rather than of a device, and every app had rolled its own — the
same fixed scrim, the same escape listener, the same `z-index` guess, each getting a
different corner of it right. It is a native `<dialog>`, so the top layer, the focus trap,
the return of focus, `aria-modal` and inertness behind it are the browser's rather than
ours. It opens by being mounted and has no `open` prop, because a shut modal is state the
DOM was already keeping.

`Popup` is the same argument one rung down. A menu, a palette or a picker opened from a
control has to escape a `transform`, an `overflow: hidden` and every stacking context
between it and the page — and inside a `Modal` it has to paint above a `<dialog>`, which
no `z-index` can do. Portalling to `document.body` looks like it solves that and does not:
a portalled div is still bidding for a layer with a number, and the top layer is not a
number. `popover` promotes the panel out of all of it, and it stays a DOM child of the
control while it floats, so the caller's tokens still reach it and the tab order still
runs trigger → panel.

It is **`manual`, not `auto`**. Light dismiss closes on the pointerdown heading for the
trigger and the click behind it opens the panel again, which reads as a menu refusing to
open. Dismissal is the widget's instead, and it is the three events a menu has always
answered: a pointer elsewhere, a wheel elsewhere, escape. Which one it was reaches the
caller, because only escape has somewhere obvious to put focus back — a pointer elsewhere
has already chosen where it is going. Everything the panel *looks* like is the caller's
`className`; what `Popup` tells it is where it may go, as `--wdg-popup-anchor` (the
trigger's width, for a menu that wants to be at least as wide as its field) and
`--wdg-popup-room` (the height left on the side it landed on). Both are measured on every
placement rather than remembered, because the trigger may be on a canvas that has panned
or zoomed since the panel last opened. [`Select`](../src/controls/Select.tsx) is the menu
built on it; `set/`'s colour picker is the palette.

**It will hang off a box as well as a control.** A chip in a scrolling grid may be
unmounted by the time the panel it opened is drawn, so there is nothing left to measure —
those callers pass the box they measured when it opened. What can be measured is followed;
a box cannot be, so a scroll or a resize dismisses it with `stale` rather than leaving it
pointing at the wrong row.

**And it will share dismissal with a shield.** Normally a pointer elsewhere closes the
panel, which is wrong over a surface that acts on the press itself — `set/`'s grid fires a
clip on click, so those menus put a full-screen shield underneath to be what the dismissing
press lands on. Closing on the pointerdown would unmount that shield before the click
arrived and let it through to the clip. `within` names the shield, the panel treats it as
part of itself, and dismissal stays where the caller put it.

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

The line is a **layout, not a structure**, and the distinction is what kept the graph
cheap. `Chain` takes children, never a list of devices: a component that lays its children
in a row doesn't know why they're in that order, so the order stays the app's — and
[`Graph`](../src/chrome/Graph.tsx) is now the sibling layout over the same `Device`,
positioning its children instead of queueing them. The one piece a strip never needed is
ports, because there adjacency *is* the connection and there's nothing to draw; a graph has
to draw it. That came out as two slots on `Device` and no change to any of this, which is
what the rule was for. The reasoning is in [the graph](graph.md).

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

## Why a row has no fill

`layout="inside"` is a control laid into a line — a label at one end, its reading at the
other, both over the track. It is the shape a node's parameter takes, and until a cord
could reach one it was an ordinary fader with its caption moved: a fill from zero, and a
4px strip along the bottom carrying that fill, the range and the live value all at once.

**A fill from zero is the shape of *how much*, and a parameter is a *where*.** It invents
a left-hand side that means nothing — half full, mostly full, of what? — and then it is
the loudest thing on the line while carrying the least. Worse, it is the same amber as the
range, so the two shapes competed for the same 4px and shift-dragging one of them was a
guess about which had moved. So a row has no fill: the value is a **mark**, and the range
is the only filled shape on the track. A fader keeps its fill, because a fader's own
length is what it is saying.

One convention carries the rest of it — **amber is the number you set, light is where the
source has it now, grey is the limit you gave it** — and the marks own the whole height
rather than a strip. The range wash sits *under* the label and the reading and only the
marks come over them, so both texts stay legible while a mark can still reach 0 and 100.

**Nothing is drawn that isn't true.** No `onDepth`, or a depth of zero, and there is no
range: one amber mark and a groove, which is exactly what an unwired number is. No range
also means no wake, because a control being carried nowhere has no travel to describe and
a trail sitting on the value's own mark would say a still row was moving.

### The wake, and the warmth

A row is handed a reading about ten times a second, which is as often as a number can
change and still be read. At that rate a mark either sits still or jumps, and a jump
between two positions looks exactly like somebody dragging — so a driven row could not
say it was being driven. Two things fix it, both in [`wake.ts`](../src/controls/wake.ts),
and neither is state: they are custom properties written straight onto the element on a
clock, because a row re-rendering to move a mark two pixels is the render path a canvas
of nodes exists to avoid.

**The mark grows a tail.** Six marks, each chasing the one in front of it — not six
delayed samples of the source, which is the obvious way and the one that fails. Delayed
samples of anything that *holds* a value, a sample-and-hold or a number arriving at ten
hertz, sit at six unrelated readings, and a row that reads as six other numbers is worse
than one that reads as none. Chasing, the trail is always between where the number was and
where it is, in order: a step stretches it into a streak and then collapses it back to a
point, which is one number moving.

**And the number lights up.** The reading warms to a light amber the moment it changes and
cools over about a third of a second, so a held signal blinks once per step and a smooth
one reads as a steady warmth. It is the same rule wired or not — a number that changed is
a number that arrived, whoever changed it — which is why an unwired row still answers when
you touch it, and why nothing needed a second colour or a badge to say *this is being
driven*.

The reading is the **arriving** number and nothing else. It briefly said `62 → 88 %`, the
range in amber, which is the marks' job and was being said twice; a number that is not
yours to drag belongs in the readout, and the range belongs on the track.

## Tier 3 — the bespoke displays

Listed so they aren't forgotten, deliberately last. Each is one device's idea, and none of
them shares anything with the others except the gesture.

ADSR envelope (`live.adsrui` is a real head start), EQ Eight curve, Auto Filter's response,
waveform display (Simpler), transfer function (Saturator, Roar), oscilloscope
(`live.scope~`), matrix (`live.grid`), step lanes (`live.step`).

**Two of those got smaller when `XYPad` landed.** The EQ Eight's curve and Auto Filter's
display looked like separate bespoke controls until you notice what they have in common: a
plane, scaled axes, and handles you drag two parameters with. That part is now a Tier 1
widget, and what's left of each is a *drawing* — a response curve the device computes —
which goes in the pad's artwork slot and stays in the app, because the shape of an EQ's
curve is one device's idea and this module knows about none of them.

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
which is what the graph wants, having no footer to fill.

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
as wide as its faceplate. That was never an oversight left for later: on a canvas a node
should be the size of what it holds rather than the size a strip needed it to be, and
[`Graph`](../src/chrome/Graph.tsx) relies on it. The floor belongs to the layout that needs it, which is the same reason the
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

A knob's control region is shorter than its width. Every knob uses the module's fixed
34px width — size is deliberately not a prop — and its SVG geometry remains at that
scale, but the view box starts just above and ends just below the 270° arc instead of
reserving the unused top and bottom of a full circle. The caption and readout keep their
generic inter-region gaps and therefore stay in the same shared bands as every other
control's; only empty artwork space has left layout. The resulting control region is 27px
tall in every context: alone, in a `Row`, in a `Panel`, or in rack macros.

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
all use the 16px `--wdg-field-height`, `--wdg-radius` and the same edge. `Segmented` uses
that height too. It is separate from the 17px chrome height, so making fields dense cannot
silently shrink a device header or folded strip. A lit toggle changes its fill and text,
not its outside geometry or border, so it cannot grow or appear rounder when it turns on.
`Select` draws the same small arrow on every platform instead of surrendering half a
narrow field to native menu chrome. That arrow, its padding and its font belong to the
control rather than to a device stylesheet. It is a **grid item placed in the field's own
band**, not something positioned against the widget's box: inside a `Row` that box spans
all three bands, so "the bottom of it" is the bottom of an empty readout band and the arrow
sat under the field it belongs to. Three explicit rows on `.wdg-select` make the placement
the same in a row and out of one. Device compositions make room around these
fixed boxes; they never scale or restyle them.

**And the menu it opens is ours as well.** For a long time only the shut half was: the
field matched every other field, and pressing it opened a system popup in the system's
colours, at the system's row height, over a canvas it knew nothing about. On a page of
forty nodes that was the one surface nobody here had chosen. It is drawn in
[`Select`](../src/controls/Select.tsx) now. Where it floats, how it flips and how it goes
away are [`Popup`](../src/chrome/Popup.tsx)'s, above — the top layer through `popover`, and
the three events a menu has always answered. It is drawn at its own size, too: a node at
0.4× zoom is unreadable, and a menu that shrank with it would be as well. What is left in
`Select` is the part that is a *select* — the rows, the highlight and the keyboard.

Focus stays on the trigger and the active row is named with `aria-activedescendant` —
ARIA's select-only combobox, and the pattern with no focus to restore when a host unmounts
the node a menu was opened from. Every key it handles is stopped as well as defaulted, for
the reason [the gesture](gesture.md#the-keyboard-and-who-owns-a-keystroke) stops its own:
a focused control owns its keystroke, and a graph is usually listening for the arrows. A
key it does *not* handle still goes on to the host, so escape on a shut menu is never the
reason a modal stops closing.

**Type-ahead reads what you meant off the buffer, not off the clock.** One letter walks the
members that start with it and a word searches for the word, and which of the two you were
doing is decided by whether the buffer is one letter repeated — `sss` is a walk however
fast it arrived, and is never a word anybody was typing. Deciding it on timing alone got it
wrong in exactly the case that matters: press a letter three times quickly and the second
press searched for `ss`, matched nothing, and left the walk dead on its first step. The
700ms window still exists, and all it now does is decide when a *word* has been abandoned.

**Fills grow from the middle when zero is the middle.** A pan at center is not a pan
turned all the way down, and Live draws the distinction — `live.dial` calls it the needle
mode. The test is where zero lands in the travel, not whether the range straddles it: a
volume fader runs -70 to +6 dB, and 0 dB near the top of that fills from the bottom like
any other level. `fill.ts` decides it once for the knob, the slider and the number field,
in JavaScript rather than a `calc()` because CSS `abs()` is younger than we want to
depend on.

A fill is always the full `--wdg-fill` — the same amber as a knob's arc, a lit switch and
a chosen tab, because one meaning should have one colour. When the colour *is* the meaning
— a mixer strip inked in its stem's colour, a solo lit in the solo colour — the control
takes it as `ink`, a prop on every filled control, and the frame sets `--wdg-fill` and the
needle's `--wdg-marker` from it. A host does not reach into the custom properties itself:
the widget owns which parts a colour touches. The value box is the only place
text sits on a fill, and it draws its reading twice rather than dimming the fill to make
room: once in `--wdg-text`, once in `--wdg-fill-text` clipped to the filled part. The
number then reads dark on the fill and light off it, splitting at the edge.

**Switches take a boolean, not a `Param`.** Live models a device's on/off as a 0–1
`DeviceParameter`, but nothing about drawing a switch needs a range, a taper or a unit.
Pushing it through the param model would buy a conversion at every call site and no
behavior at all.
