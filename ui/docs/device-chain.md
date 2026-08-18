# The device chain

The selected track's devices, along the bottom of the window. `components/DeviceChain.tsx`,
`hooks/useDeviceChain.ts`.

**Unverified against Live.** The watch is in `lom.ts`, which has no automated coverage —
see [what's confirmed and what isn't](#whats-confirmed-and-what-isnt) at the end.

## What it shows, and what it deliberately doesn't

Click a track header and its chain opens below the grid: every device as a shell — its
name, its activator, whether it's folded — and a rack additionally as its macro face, its
chain list and the selected chain's own devices, recursively.

**There are no knobs on any of it.** That isn't an omission waiting to be noticed, it's the
line this first pass drew: structure over the wire, drawn by `widgets/`, and nothing else.
Parameters are a much larger read — one `DeviceParameter` per control per device, where a
five-device chain is comfortably 300 of them — and they arrive as a field on `ChainDevice`
when they arrive, not as a redesign of any of this. What's here proves the whole path from
Live's chain to the widget library, which is the part worth being sure of first.

It follows that the footer is **read-only**. Nothing in it writes to Live, because no
device has a write path yet. The activator draws `Device.is_active` and doesn't move; the
fold triangle isn't drawn at all, which is `Device`'s own way of saying a shell can't be
folded from here. The one wart is that `widgets/`'s `Device` always draws its activator
button, so there is a button in the title bar that reports state and does nothing when
pressed. Giving `Device` a read-only mode is the fix, and it belongs in `widgets/`.

**There is no refresh button.** There was one, and it existed only because the chain was
read on demand: a device added in Live stayed invisible until something asked again, and
the button was that ask. The run's own membership is watched now, so it has nothing left
to do.

## It is the first thing in the app drawn out of widgets/

The mixer's faders proved the gesture crossed the boundary; this is the first component to
use the chrome. It matters because the boundary is the point of that module:
[`widgets/`](../../widgets/README.md) imports no protocol, no bridge and nothing that knows
Live exists, and everything Live-shaped stops in `DeviceChain.tsx`.

The adapting turns out to be three lines, because a shell is a small thing — `name`, `on`,
`folded`, and a rack's chain names. `liveParam.ts` is the same boundary for parameters and
is the file that grows when knobs land.

**Which chain a rack is showing lives in the hook**, and it used to be `RackShell`'s own
`useState` on the reasoning that nothing over the wire depended on it. That half stopped
being true. The chain a rack is showing is exactly what decides whether its devices are
watched, so it is now part of what the footer declares — and the thing that declares it
has to hold it. It resets when the track changes because a different track's runs are
addressed by paths that mean something else entirely.

A device has **no id on the wire.** Its address is its position in the run, the same
bargain clips make with `(track, scene)`. Keys pair the index with the name so that
swapping one device for another at the same slot remounts rather than reusing a shell.

## A watch with a target, and what it does not follow

`Track.devices` was always observable. What stopped this being a watch was the bridge:
every watch is refcounted **per kind** across clients, in one `Set<WebSocket>` each, and
this one has to be refcounted per kind *and per target* — two clients looking at two
different tracks both want it on, and neither may release the other's.

That now exists. The footer declares every run it is looking at, the bridge unions those
across clients ([`core/docs/chainWatch.md`](../../core/docs/chainWatch.md)), and `lom.ts`
follows the union. **A device added, renamed, deactivated or folded in Live now appears
here without anyone asking**, which is what the refresh button used to stand in for.

### It watches what is visible, which is less than what exists

The subscription is per **run** — a track's device list, or one chain inside a rack. Not
per track, and deliberately not recursive:

- the shown track's own run, always;
- for each rack in a run that is **open**, the one chain it is showing;
- and into that, because a rack inside a chain is the same case again.

A folded rack contributes nothing. A rack's other seven chains contribute nothing. That is
the whole economy: an eight-chain rack of five devices each is ~120 LOM observers, and
following one nobody has opened would spend all of them on something off screen.

It costs a round trip per level. Subscribing to the track run is what reveals which of its
devices are racks, which is what puts their open chains in the next declaration. On a local
socket that is invisible, and it means the client never has to know a rack's shape before
it can ask about it.

**A rack therefore reports its chains as names only.** `RackChain.devices` is absent until
that chain is itself subscribed to — absent and `[]` mean different things here, "nobody is
looking in here" against "this chain is genuinely bare", and a client that drew the empty
case for the first would show every unopened rack as containing nothing.

### The declaration, not a subscribe/unsubscribe pair

The footer sends everything it is looking at, every time any of it changes. There is no
`off`. An empty list is how it stops, a dropped socket says the same thing, and no message
this client can send releases a run another client is holding.

It is keyed on the declaration's **content** rather than its identity, because every push
rebuilds the list and almost none of them change what is being watched. The bridge drops
an unchanged union anyway — it has to, since telling `lom.ts` rebuilds every observer it
holds — but a message per push is the wrong shape to establish before parameters make it a
message per knob turn.

### What it still cannot follow

Nothing in a device's *contents*. Parameters are the next tier of this same subscription
and land as a field on what it publishes; until then a device is a title bar.

## Selecting a track selects it in Live too

A plain click on a track header sends `selectTrack`, which writes `Song.View.selected_track`
— the same bargain [`selectScene`](songs.md) makes for the Song Index. Live's own device
view shows the selected track's chain, so without the write, this footer and Live's would
be two answers to the same question.

**Group headers too**, because a group is a real track with devices of its own. That cost
the grid its whole-header fold target — folding is now the ⊙ chevron alone. See
[track groups](track-groups.md) for what that traded away and why it wasn't a choice.

The modifier-click that stops a track is untouched and can't collide: one is a view, the
other is playback, and the modifier is the one every launch surface in the grid already
uses to mean stop.

The selected header is marked by a 2px rule along its bottom edge — the edge nearest the
strip it opened — in `currentColor`, which reuses the ink `inkOn` already picked to read
against that track's own Live color. It's an inset shadow, so the `live` and `stopping`
gradients keep the `background-image` channel to themselves.

**It's a border, and that matters.** A group's band, the gutter that holds a member's
header off that band, and the plugs that fill the `border-spacing` between headers are all
`box-shadow` layers on this same element, and `box-shadow` does not compose across rules —
the winning declaration replaces the whole stack. Marking the header with another shadow
therefore erased the band, and the selected track visibly rose out of its group. A border
is a different property, so it can't collide with any of that.

The transparent border is held on **every** track header and only recoloured on the
selected one, so clicking changes a colour rather than the layout; a border applied only
when selected would grow the whole header row by 2px on every click. The background paints
under it, so unselected it simply shows the track's own fill.

**The fill is deliberately left alone**, and that's the whole reason this works on a group.
Every header carries its own Live color, and a group reads as *containing* its tracks
because it shares that fill with them; tinting or lifting the selected one makes the group
float off the run it heads. A mark on one edge has no such relationship to break, so group
and ordinary headers need no case for either.

The bridge observes `selected_track` for its own delta detection (see
[`bridge/docs/following-live.md`](../../bridge/docs/following-live.md)), so this write is
seen by the cursor watcher and re-reads that track. That's the intended behavior of that
watcher and costs one track read, but it does mean clicking headers is not free.

## Where it sits

Below `main` rather than inside it, so the strip spans the window the way Live's device
view does — under the rail as well as the grid — rather than becoming one more column in
that flex row. `#root` is a flex column, so it stacks above the log and the stats bar.

The strip stays mounted while a read is in flight instead of being replaced by a spinner.
The chain that's there is almost always the chain that's still there, and swapping it for a
message makes every re-read look like the devices went away.

## What's confirmed and what isn't

Confirmed: it typechecks, builds, and the device is unchanged at 51 boxes — the messages
need no patcher change, because anything the `route` doesn't match falls through to
`lom.js` already.

**Not confirmed, because it needs Live open:**

- that `watch_chains` installs and fires at all — the whole mechanism is unwatched;
- that `Device.View.is_collapsed` observes the way the page says. It is documented
  `get, set, observe`, and this project's own LOM table said `get, set` until the device
  classes were un-trimmed, so it has been wrong here once already;
- that a rack's `chains` observer fires when a chain is added or renamed;
- that `Device.class_name`, `is_active` and `can_have_chains` answer as expected, and that
  `Device.View.is_collapsed` resolves through a second `goto`;
- that writing `Song.View.selected_track` by id reveals the track the way writing
  `selected_scene` reveals a scene.

The failure modes stay visible rather than silent: a device that doesn't resolve is
skipped, a chain list that raises logs to the Max window and reads as empty, and a
malformed payload is rejected whole by `chainDevice` in `bridge.ts` rather than
half-drawn. An empty footer on a track with devices means the watch failed; it does not
mean the track is empty, because a track that has genuinely gone answers `null` and the
strip says "unavailable".

One new failure mode worth knowing: the observer count is capped at
`CHAIN_OBSERVER_MAX`, and hitting it posts to the Max window and leaves the shells past
that point not updating. It is a runaway stop for a malformed set, not a limit anyone
should reach — 400 observers is ~130 devices on screen at once.
