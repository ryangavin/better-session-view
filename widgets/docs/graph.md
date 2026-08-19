# The graph

`src/chrome/Graph.tsx`, `Port.tsx`, `graphContext.ts`. The canvas a chain becomes when the
order stops being a line.

It is a **sibling layout, not a replacement**. [`Chain`](../src/chrome/Chain.tsx) puts its
children in a row; this puts them where the host says. Neither knows why. The same
[`Device`](../src/chrome/Device.tsx) hangs off either one, unchanged, which is what the
chain's "takes children, never a list of devices" rule was buying all along — see *Why the
chain is a line* in [the catalogue](catalogue.md).

Only one thing had to be added to `Device` for it: **ports**. In a strip adjacency *is* the
connection and there is nothing to draw; a graph has to draw it, so a cord needs somewhere
to end.

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
  selecting one is supposed to do.
- **Selecting more than one node**, and moving a selection together.
- **Driving pan and zoom from outside** — fit-to-content, or restoring a saved view. The
  props are easy; the question of who owns the view isn't, and there's no caller yet.
- **Auto-routing.** Cords are a single cubic with horizontal control points, so they run
  through nodes rather than around them.
- **Ports on a `Rack`.** A rack composes `Device`, so it inherits the slots, but a rack in
  a graph raises a question the strip never had to answer: whether its chains are visible
  as nodes or stay inside it.
