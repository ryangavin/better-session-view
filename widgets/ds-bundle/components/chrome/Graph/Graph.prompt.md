Graph from bsv-widgets. Use via `window.BsvWidgets.Graph` (bundle loaded from the root `_ds_bundle.js`).

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

The graph still owns its view when a host needs to **read** the zoom. `viewRef` exposes one
imperative `scale()` method and no setter: a node-picture renderer can decide that a face is
too small to animate without lifting the scale into host state. That distinction matters.
A callback or controlled value updated on every wheel event would re-render every node under
the graph precisely while the browser is also transforming and remeasuring them; reading a
ref at draw time adds no render path at all.

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
rail. That is

_(truncated — see graph.md for full)_

## Props

```ts
interface GraphProps {
  /** `GraphNode`s. */
  children?: React.ReactNode;
  /** Every cord to draw. A cord naming a port that isn't mounted is skipped rather than dropped — nodes mount in their own ti */
  cords?: readonly GraphCord[];
  /** A cord was dragged between two ports. Always outlet first, whichever end the gesture started at, so a host never has to  */
  onConnect?: (from: string, to: string) => void;
  /** A node was dragged, or arrow-keyed, to a new position. */
  onMove?: (id: string, x: number, y: number) => void;
  /** The empty canvas was pressed, for a host that clears a selection on it. */
  onClearSelection?: () => void;
  /** An imperative, read-only view of the canvas. A ref keeps a host that only needs the scale out of the graph's render path */
  viewRef?: React.Ref;
  minZoom?: number;
  maxZoom?: number;
  /** Spacing of the background dots, in graph units. */
  grid?: number;
  className?: string;
}
```
