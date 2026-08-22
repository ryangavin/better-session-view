# The graph

`src/chrome/Graph.tsx`, `Port.tsx`, `graphContext.ts`. The canvas a chain becomes when the
order stops being a line.

It is a **sibling layout, not a replacement**. [`Chain`](../src/chrome/Chain.tsx) puts its
children in a row; this puts them where the host says. Neither knows why. The same
[`Device`](../src/chrome/Device.tsx) hangs off either one, which is what the chain's "takes
children, never a list of devices" rule was buying all along — see *Why the chain is a
line* in [the catalogue](catalogue.md). Its ordinary face stays unchanged in either host;
a graph may opt into the row-aligned anatomy below when its ports govern controls on the
face.

The first thing added to `Device` for it was **ports**. In a strip adjacency *is* the
connection and there is nothing to draw; a graph has to draw it, so a cord needs somewhere
to end. The second was an opt-in row anatomy, after the first host proved that two rails
centred against a body cannot line a port up with the control it governs.

**Its first host is `visuals/`'s circuit editor**, where a node is one operation in a
fragment shader — see [circuits](../../visuals/docs/circuit.md). Two things written here
against no caller turned out to be exactly right, and are worth pointing at because they
are the parts that would have been tempting to skip: a knob inside a node turns without
dragging the node (the `defaultPrevented` check, below), and a refused connection costs
nothing because the host draws the cords (the bargain, below). The host names three kinds —
`p`, `n`, `c` — and this module still has no idea what any of them are.

## Who owns what

This is the whole design, and everything else follows from it.

| | owned by | because |
|---|---|---|
| node positions | the host | it's the document. Undo, save and refuse all need it there |
| cords | the host | same. The graph draws what it's given, never what it was asked for |
| which kinds may connect | the host | this module has no list of kinds and never will |
| pan and zoom | **the graph** | it's the view, the way a chain's scroll position is |
| which side connects to which | **the graph** | it's the drawing's own rule, not a claim about signals |

The first three are the gesture's bargain one layer up: a control emits a value and the
host writes it to Live, and here a drag emits a position and a connection emits a pair of
ids. A node dragged across the canvas **does not move** until the host hands new `x` and
`y` back, and a cord dragged between two ports **is not drawn** until it comes back in
`cords`. That is what makes a refusal free — the bench refuses one on every mismatched
kind, and nothing has to be undone.

Sides are the exception because they aren't a question about meaning. An outlet connects
to an inlet; a cord between two outlets has no shape to draw. Whether *this* outlet may
reach *that* inlet is about what they carry, and the graph has no idea. So it enforces the
first and offers the second.

## A cord pulls from either end

The sides rule is about the **cord**, not about the gesture. An outlet has to meet an
inlet; neither one has to be picked up first. A drag started on an inlet and dropped on an
outlet makes exactly the cord the reverse drag makes, and the two Enter presses work the
same way round. A drop on the side the drag started from is refused, and that is the whole
of the rule.

`onConnect(from, to)` is **normalised before the host sees it**: `from` is always the
outlet and `to` always the inlet, whichever end the hand started at. So a host wires on the
pair and never asks how it was drawn — the circuit editor's `wire(from, to)` reads `from`'s
signal as the one leaving and `to`'s as the one arriving, and would be wrong half the time
if the graph passed the gesture's order through instead of the cord's.

Two things fall out of that, and both are the difference between the feature working and
the feature reading as working.

**The cord in flight is drawn outlet-end first either way.** `cordPath` throws its control
points out to the right of the first point and in from the left of the second, which is the
shape a landed cord has. A drag from an inlet therefore puts the *pointer* at the outlet end
and the port at the inlet end. Anchor it the other way round and the bezier bulges backwards
for the length of the drag, then flips the instant it connects.

**Ports say whether they could take it.** The surface publishes `cordWants` — the side it
is still short of, and nothing more — and each `Port` compares its own side to that, taking
`data-reach="open"` or `data-reach="shut"`. The port the cord left carries `data-pending`
instead and takes neither, and a port under the pointer fills solid only when it is open. So
an outlet in hand outlines the inlets and dims the outlets, and an inlet in hand does the
mirror of it. A canvas that highlighted the same ports whichever end you grabbed would look
broken while working perfectly, which is the failure worth spending an attribute on. `Port`
still learns nothing from this: not that outlets feed inlets, only which side is wanted.

## Coordinates

Three nested boxes, and the middle one is the trick.

```
.wdg-graph          the viewport: overflow hidden, the dotted background, the pan cursor
  .wdg-graph-content   0x0 at the origin, transform: translate(pan) scale(zoom)
    <svg>              the cords, in graph units, pointer-events: none
    .wdg-graph-node    absolutely positioned at (x, y) in graph units
```

The content element is deliberately **zero by zero**. It exists to be a transformed origin
and nothing else: `getBoundingClientRect()` on it returns exactly the point graph (0, 0)
currently sits at on screen, so every conversion is one subtraction and one divide by the
scale. Give it a size and that stops being true the moment anything overflows it.

Cords take `vector-effect: non-scaling-stroke`, so zooming out thins the patch rather than
turning it into a mat of lines. The dotted background is a `background-size` in scaled
pixels and a `background-position` at the pan offset, which is why the grid moves with the
content without being part of it.

Zoom is on a **native, non-passive wheel listener**, not React's `onWheel`. React registers
wheel passively at the root, and a passive handler cannot stop the page scrolling behind
the canvas.

## How a cord knows where to start

A port is nested arbitrarily deep inside whatever faceplate a host composed, so it
announces itself through a context rather than a prop — threading a callback down would
make every device in between know it is in a graph.

The measured geometry lives in a **ref, not state**, and the reason is the one that governs
everything under `ClipGrid/` too: re-rendering every node because one of them moved a pixel
is precisely the cost being avoided, and only `Graph` itself ever draws from the geometry.
A render counter is bumped only when a measurement actually changed, which is what stops
the measuring layout effect from looping — it runs after every commit and on most commits
finds nothing to say.

Three things move a port without re-rendering `Graph`: a faceplate resizing, a font
landing, and a host swapping a face. A `ResizeObserver` on the registered elements is the
only thing that catches all three, so there is one, and ports observe into it as they
register.

## Rails for a device, rows for a patch

The default `Device` anatomy is still three siblings: an inlet rail, the body and an outlet
rail. That is the right shape for an ordinary device face, where the ports describe the
whole device rather than one control, and it is the path every chain and rack still takes.
Passing `inlets` and `outlets` alone selects it.

A face where each port governs one line opts in by passing `portRows`. Each child is a
[`DevicePortRow`](../src/chrome/Device.tsx), with an `inlet`, an `outlet`, or both, and its
control as the child:

```tsx
<Device
  name="Shape"
  chooser={<Select items={targets} index={at} onChange={setAt} />}
  outlets={<Port id="shape/out" side="out" label="Out" />}
  portRows={
    <DevicePortRow
      inlet={<Port id="shape/depth" side="in" label="Depth" showLabel={false} />}
    >
      <Slider layout="inside" orientation="horizontal" name="Depth" {...depth} />
    </DevicePortRow>
  }
/>
```

That is a separate anatomy rather than CSS laid over the old rails. The row is one grid, so
the dot and the control share a centre by construction. `Port.showLabel={false}` suppresses
only its printed caption; `label` remains its accessible name and tooltip, while the control
prints the name once inside itself.

The aligned face always renders its outlet and chooser bands, including when either is
empty. A host that must not resize as content changes reserves the maximum number of lines
with `--wdg-device-outlet-rows` and `--wdg-device-port-rows`; each line is
`--wdg-port-row-height`, which defaults to the field height. The widgets module cannot pick
those counts because it does not know a host's vocabulary.

`overlay` is deliberately not a row. It is absolutely anchored above the frame and
contributes nothing to its measured width or height. A host owns its content and fixed size;
`Device` owns only the anchor. This is for a graph preview whose dimensions must not become
a function of the controls below it, not for ordinary device artwork inside the face.

The practical test for the opt-in anatomy is the observer above: wiring a row or changing
what it shows should leave every port at the same coordinates. A host changing the number
of visible rows without reserving their maximum has chosen to resize the node and will make
the observer redraw its cords.

**A cord naming a port that isn't mounted is skipped, not dropped.** Nodes mount in their
own time, and a host shouldn't have to sequence its state against React's.

## Dragging a node, without a handle

There is no drag handle and no rule here about which part of a faceplate counts as
furniture. A node drags from anywhere a control hasn't already claimed, and "claimed" has
two tests:

1. `event.defaultPrevented` — [`useParamGesture`](../src/gesture/useParamGesture.ts) calls
   `preventDefault()` when it takes a pointer, so a knob being turned inside a node says so
   and the node stays put. Every continuous control shares that hook, so every one of them
   gets this for free.
2. the target sits inside interactive HTML — `button, input, select, textarea, a[href],
   [role="slider"], [role="radio"]`.

That second list is deliberately about **HTML, not about anything this module defines**. A
graph that tested for `.wdg-device-head` would know what a device is, which is exactly the
boundary `Chain` exists to hold. The device's title bar is a `div`, so it is the natural
place to grab a node, and the activator, fold triangle and hot-swap button inside it are
`button`s, so they are not.

## The keyboard

A drag has a beginning and an end in one gesture; a keyboard doesn't. So connecting is two
presses: **Enter** arms a port, **Enter** on a second one lands the cord, **Escape** drops
it. Ports are ordinary buttons, so tabbing reaches them.

Arrow keys move a node, and the tab stop they use is **the one the device's title bar
already has**. Giving the node wrapper a `tabIndex` of its own would double the stops in a
patch, which is the kind of accessibility that makes a page worse. Shift is fine, the way
it is everywhere else in the module — 1 unit against 8.

## Kinds are the host's whole vocabulary

`Port` takes a `kind` string and puts it on `data-kind`; `GraphCord` does the same. That is
the entire mechanism. The module ships no list of kinds, no colours for them, and no
compatibility rule — a host names its own and styles them:

```css
.patch .wdg-port[data-kind='note'] { --wdg-port-ink: #7aa2f7; }
.patch .wdg-graph-cord[data-kind='note'] { stroke: #7aa2f7; }
```

A port that knew audio from video would be a port that knew what it was plugged into, which
is the same mistake as a knob that knew it was a filter cutoff.

## Folding, and why a node doesn't

`Device` hides its ports while folded. Folding turns a device into a 17px strip with its
name on end, and a strip has no edges to hang a rail on.

That costs nothing, because **a canvas doesn't need folding**. Folding exists because a
chain gets long and unreadable in one direction; a graph has pan and zoom for the same
problem. A host drawing a graph passes no `onFold`, and the fold triangle never appears.
If one folds a node anyway, the cords to it are skipped by the rule above — the drawing is
lost, not broken.

The other half of that is already in the catalogue and was written for this day: **a
`Device` standing on its own has no minimum width**. The square floor belongs to the chain,
which needs it so a one-switch device doesn't collapse to a sliver in a run. On a canvas a
node should be the size of what it holds.

## What isn't built

- **Deleting a cord.** The cord layer is `pointer-events: none`, so nothing can be clicked
  yet. Hit-testing a bezier is real work and it should wait for a caller who knows what
  selecting one is supposed to do. The first host works around it without needing anything
  from here: an inlet that has a cord grows a small `×` beside its port, in the host's own
  `inlets` slot, and the host drops the cord from its own state.
- **Selecting more than one node**, and moving a selection together.
- **Driving pan and zoom from outside** — fit-to-content, or restoring a saved view. The
  props are easy; the question of who owns the view isn't, and there's no caller yet.
- **Auto-routing.** Cords are a single cubic with horizontal control points, so they run
  through nodes rather than around them.
- **Ports on a `Rack`.** A rack composes `Device`, so it inherits the slots, but a rack in
  a graph raises a question the strip never had to answer: whether its chains are visible
  as nodes or stay inside it.
