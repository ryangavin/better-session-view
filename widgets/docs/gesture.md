# The gesture

`src/gesture/`. The drag every continuous control shares, and the hold that keeps a
control honest while the engine catches up.

## The unit of reuse is the gesture, not the widget

A knob, a fader, a number field and a send amount are one interaction wearing four faces:
grab where you are, drag, hold a modifier for fine, let go, double-click for the default.
Written per widget it is the same bug four times.

It *was* the same bug three times here. Before this module the mixer drove volume, pan and
every send through `<input type="range">`, which gets the core behavior wrong in a way
that's easy to miss and impossible to unsee: **a native range input jumps to the click.**
Live grabs. On a 26px pan field, jumping to the click leaves about four reachable values.
Two of those three controls also carried their own copy of the local-value-until-readback
dance, with its own epsilon and its own timeout.

So `useParamGesture` is the control and the widgets are skins over it. Nothing in a widget
re-derives what a drag means.

## What the drag does

**It anchors at pointer-down and then ignores the value prop.** The fraction the drag
started from is captured once; everything after is accumulated onto it. This is the
property that makes a laggy authority survivable — if the drag re-derived its position
from the incoming value, every echo from Live would tug the control back to where it was
one round trip ago and fight the pointer.

**A plane is the exception, and it asks for the opposite.** `anchor: 'pointer'` starts the
drag from the point that was pressed rather than the value being held, which is what
[`XYPad`](../src/controls/XYPad.tsx) passes. The reasoning that makes grabbing right on a
26px pan field inverts on a surface: it is large enough that the click doesn't throw the
range away, and its handle is a *position*, so pressing somewhere and watching the handle
stay put reads as the control ignoring the pointer. Only the anchor changes. Everything
after it is the same accrual, so a control whose `travel` matches its drawn extent has the
handle land under the pointer and stay with it, and fine still slows it from where it is.

**Distance accrues rather than being measured from the grab point.** Each move adds
`delta ÷ travel` to the running fraction. Measuring from the origin would be simpler, but
then taking the fine modifier mid-drag would teleport the control: the same pixel distance
would suddenly mean a tenth as much, so the value would snap back toward the anchor. As
written, fine slows the control from wherever it currently is, which is what Live does.

**`travel` is pixels for the full range**, 200 by default, ×10 held fine. It's a constant
rather than the element's size on purpose — an absolute mapping is unusable on anything
small, which is the same reason the range inputs were wrong.

**The fine modifier is ⌘ on macOS, Ctrl elsewhere**, which is Live's. `platform.ts`
duplicates the test in `ui/src/lib/keys.ts` rather than importing it, because a widget
library that needed a host to tell it which key means fine would be a widget library with
a host. In the app the two happen to be the same key meaning different things in different
places — ⌘ on a clip makes a sound, ⌘ on a fader means fine — and they never meet, because
one is a grid cell and the other is a control.

## Writes are limited to one per frame

A pointer can report faster than the browser paints, and on the far end of this is a
WebSocket and a Live Set. `onChange` fires at most once per animation frame with the
latest value, and a pending write is flushed synchronously when the drag ends. Repeating
the same value doesn't schedule anything.

The mixer used to do this itself, once per component. It doesn't need to any more, which
is also why `TrackSends` no longer coalesces across a column — each control limits itself,
and only one of them can be under the pointer.

## The keyboard, and who owns a keystroke

Arrows move by `stepSize`, Page Up/Down by ten of those, Home and End to the ends, and the
fine modifier applies. Every handled key gets `preventDefault` **and `stopPropagation`**.

That second one is load-bearing in this app. `ui/src/hooks/useGridKeyboard.ts` listens on
`window` and moves the grid's active cell on the arrow keys; `isTypingInto` exempts real
form fields, and a `role="slider"` div is not one. Stopping propagation in the widget is
the right layer for it: a focused control owns its keystroke in any host, not only in one
that remembers to ask.

The gesture surface is a plain element with `role="slider"` and the full `aria-value*` set,
so replacing the native inputs cost nothing in accessibility and gained the arrow keys a
`type="range"` never had at the right step size.

## `usePendingValue`

Anywhere the engine owns the value, a control has two: the one being dragged and the one
that has come back. Rendering only the second makes the thumb lag the pointer by a round
trip; rendering only the first makes the control deaf to everything else that can move it.
So the local value is held over the reported one and dropped as soon as they agree, within
`readbackTolerance` — fine enough that a real change is never mistaken for the echo,
coarse enough that float noise doesn't hold it until the deadline.

**The deadline is not optional.** A write can be refused, clamped, or never land, and
without one the control would sit forever showing a value nothing in the system holds —
the one failure mode where a mixer lies about what the set is doing.

`release()` exists for a host that wants to defer to readback the instant a drag ends.
**The mixer deliberately doesn't use it**: dropping the local value on release would snap
the control back to whatever Live last echoed and then forward again when the write lands,
a visible bounce on every release. The tolerance match clears it, and the deadline covers
the rest.
