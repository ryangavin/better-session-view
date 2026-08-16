# The device chain

The selected track's devices, along the bottom of the window. `components/DeviceChain.tsx`,
`hooks/useDeviceChain.ts`.

**Unverified against Live.** The read is in `lom.ts`, which has no automated coverage —
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

## It is the first thing in the app drawn out of widgets/

The mixer's faders proved the gesture crossed the boundary; this is the first component to
use the chrome. It matters because the boundary is the point of that module:
[`widgets/`](../../widgets/README.md) imports no protocol, no bridge and nothing that knows
Live exists, and everything Live-shaped stops in `DeviceChain.tsx`.

The adapting turns out to be three lines, because a shell is a small thing — `name`, `on`,
`folded`, and a rack's chain names. `liveParam.ts` is the same boundary for parameters and
is the file that grows when knobs land.

Which chain a rack is showing is `RackShell`'s own `useState`, not the hook's. It's a view
choice inside one rack, nothing over the wire depends on it, and a rack inside a rack needs
its own copy regardless. Resetting when the track changes falls out for free: the subtree
is keyed by position, so a different track builds different components.

A device has **no id on the wire.** Its address is its position in the run, the same
bargain clips make with `(track, scene)`. Keys pair the index with the name so that
swapping one device for another at the same slot remounts rather than reusing a shell.

## A read, not a watch — and why that's a first pass

`Track.devices` is observable, and one observer on the one track being shown would be
genuinely cheap. It isn't a watch anyway, and the reason is in `bridge.ts`: every watch is
refcounted **per kind** across clients, in one `Set<WebSocket>` per kind, so that a client
turning one off can't blind another. This one would need refcounting per kind *and per
target* — two clients looking at two different tracks both want it on, and neither may
release the other's. That's a real change to `setWatch`, and it isn't worth making before
anything needs it.

So the chain is fetched when the shown track changes, and re-fetched on demand. **A device
added in Live doesn't appear until something asks again.** The refresh button in the strip
header is that ask, and re-clicking the header of the track already showing is the same
thing — a gesture that would otherwise be a no-op, spent on the one thing you'd want there.

Replies are correlated the ordinary way, through `client.request`, but the hook still
guards against them landing out of order: click three headers quickly and the first read
can answer last. The effect's cleanup flips a `current` flag, and a reply whose `state.t`
isn't the track still on screen is dropped.

`state: null` is a real answer rather than an error — the track index didn't resolve,
which is a set that shrank under a client still holding the old count. The strip says
"unavailable" and keeps the header selected, because the honest thing to report is that
this track has gone, not that it has no devices.

## Selecting a track selects it in Live too

A plain click on a track header sends `selectTrack`, which writes `Song.View.selected_track`
— the same bargain [`selectScene`](songs.md) makes for the Song Index. Live's own device
view shows the selected track's chain, so without the write, this footer and Live's would
be two answers to the same question.

The modifier-click that stops a track is untouched and can't collide: one is a view, the
other is playback, and the modifier is the one every launch surface in the grid already
uses to mean stop. The selected header is marked along its bottom edge — the edge nearest
the footer — in `currentColor`, which reuses the ink `inkOn` already picked to read against
that track's own Live color.

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

Confirmed: it typechecks, builds, and the device is unchanged at 51 boxes — the new
messages need no patcher change, because anything the `route` doesn't match falls through
to `lom.js` already.

**Not confirmed, because it needs Live open:** that `Device.class_name`, `is_active` and
`can_have_chains` answer as expected; that `Device.View.is_collapsed` resolves through a
second `goto`; that `chains` and a Chain's `devices` walk the way
[`LOM.md`](../../bridge/LOM.md) says; and that writing `Song.View.selected_track` by id
reveals the track the way writing `selected_scene` reveals a scene. Every one of those is
documented, and none of them has been watched.

The failure modes are deliberately visible rather than silent: a device that doesn't
resolve is skipped, a chain list that raises logs to the Max window and reads as empty, and
a malformed payload is rejected whole by `chainDevice` in `bridge.ts` rather than
half-drawn. An empty footer on a track with devices means the read failed; it does not mean
the track is empty, because a track that has genuinely gone answers `null` and says so.
