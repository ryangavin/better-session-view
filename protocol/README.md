# protocol/

The WebSocket wire protocol between the browser and the bridge. Types only — no
runtime code beyond two constants.

```
global.d.ts    the source of truth: a global `BSV` namespace
index.ts       module re-exports for consumers that can use imports
```

## Why a global namespace and not a module

Two of the three consumers can't `import`:

- **`bridge/src/lom.ts`** compiles with `module: "none"` so Max's `[v8]` can find its
  message handlers as top-level globals. TypeScript rejects *any* import under that
  setting, including `import type`.
- **`bridge/src/bridge.ts`** emits to a flat file with `rootDir: "src"`. Importing
  `../../protocol` pulls a file outside `rootDir` and trips TS6059.

A `.d.ts` with a top-level `declare namespace` is ambient and costs nothing to
include, so both get the types for free. `index.ts` re-exports them as ordinary types
for `ui/` and `core/`, which have no such restriction.

**One definition, three consumption styles.** Don't add a second copy.

## Adding or changing a message

1. Edit `global.d.ts` — add to `Request` and/or `Event`.
2. Handle it in `bridge/src/bridge.ts` (`handle()` for requests, `Max.addHandler` for
   replies from `lom`).
3. If it needs the LOM, add a top-level handler function in `bridge/src/lom.ts` and
   an `outlet(0, ...)` reply. Document both in
   [`../bridge/README.md`](../bridge/README.md).
4. If the UI awaits a reply, add it to `TERMINAL` in `ui/src/lib/client.ts` so
   `request()` knows which event completes it.
5. Add an e2e assertion.

`Request` and `Event` are discriminated unions on `type`, so a missing case is a
compile error rather than a silent no-op. Keep them that way.

## Shape

Requests carry an optional `id`; replies echo it so `client.ts` can correlate them.
Unsolicited events (`status`, `changed`, `deviceState`, `reload`) carry no id.

| client → server | |
|---|---|
| `snapshot` `{ fresh? }` | the whole set. Answered from what the bridge holds unless `fresh` |
| `apply` `{ ops, sceneOps? }` | bulk write — clip slots and/or scenes |
| `addScenes` `{ addition }` | insert and configure a contiguous run of blank scenes |
| `move` `{ plan }` | reorder scenes. **Structural, and not reversible** |
| `palette` | developer-only sweep of Live's palette |
| `saveSetConfig` `{ defaultArtist, roles }` | store naming defaults and role definitions in the device |
| `saveAllowedColors` `{ colors }` | store the bulk-color subset in the device |
| `launch` `{ target }` | fire a clip, a scene, or the song |
| `stop` `{ target }` | stop a track, every clip, or the song |
| `setTransport` `{ patch }` | update any related subset of Live's control-bar settings |
| `setMixer` `{ target, patch }` | update one track or Master mixer strip, including one indexed send |
| `setDevice` `{ target, patch }` | set one device's activator, its fold state, and/or one of its controls |
| `watchPlay` `{ on }` | install the per-track play-state observers |
| `watchMeters` `{ on }` | install the track/Master level and mixer-control observers |
| `watchStatus` `{ on }` | follow the playing clip in each track, for the stop row's status displays |
| `watchSends` `{ on }` | add/remove per-track send observers while the mixer is open |
| `watchTransport` `{ on }` | observe tempo, metronome, launch quantization, Arrangement Record and current scale |
| `selectScene` `{ s }` | select and reveal one exact scene in Live's Session View |
| `selectTrack` `{ t }` | select one exact track, so Live's device view follows the device-chain footer |
| `devices` `{ t }` | read one track's device chain — shells only. A read rather than a watch; see the type's own note |
| `ping` | |

| server → client | terminal for |
|---|---|
| `snapshot` | `snapshot` |
| `applied` | `apply` |
| `scenesAdded` | `addScenes` |
| `moved` | `move` |
| `palette` | `palette` |
| `trackDevices` | `devices` |
| `setConfigSaved` | `saveSetConfig` |
| `allowedColorsSaved` | `saveAllowedColors` |
| `pong` | `ping` |
| `progress` | — streams during `apply` and `move` |
| `status` | — connection / LOM readiness |
| `changed` | — an observer fired |
| `delta` | — a partial re-read after a change made in Live, plus a rebuilt `model` when it moved a scene row |
| `playState` | — a play-state observer fired |
| `meterLevels` | — complete current track and master output-level frame |
| `clipStatus` | — the clip playing in each track; silent tracks are absent from the frame |
| `mixerState` | — complete current activator, Solo, Arm, volume, pan and optional sends state |
| `songPosition` | — the Arrangement position crossed a sixteenth |
| `transportState` | — Live's complete observed control-bar state changed |
| `deviceState` | — restored or changed set-owned configuration |
| `reload` | — dev live-reload |
| `error` | — terminates any pending request, or is broadcast |

The socket lives at **`/ws`**, not `/`, so Vite can proxy it in dev without colliding
with the HTML route. `WS_PATH` and `DEFAULT_PORT` are exported from `index.ts`.

## Design notes

**Coarse-grained, always.** One message per *operation*, never per property. A full
set is tens of thousands of LOM reads; done chatty over a socket that's minutes, done
as one in-device walk it's whatever the LOM costs and nothing more. If you find
yourself adding a `getClipName` message, stop.

**Timing fields are part of the contract.** `Snapshot.timings` breaks the walk into
phases, and the `snapshot` event carries `dictMs` and `hostMs`. These aren't
debug-only — they're how we know whether the design scales. Don't drop them.

They are also not zeroed on a cached answer, and that is a deliberate reading of the same
rule. `Snapshot.ms` and `timings` sit *inside* the payload and honestly describe the walk
that payload was read by; zeroing the two host-side fields beside them would leave one
answer disagreeing with itself. **`cached: true` is what says the numbers describe a walk
that already happened**, and a reader that prints a projection has to branch on it rather
than conclude the LOM got faster.

**The set is held, not walked on demand.** `snapshot` is normally answered from the copy
`bridge.ts` maintains — patched by every delta and by our own writes, dropped whenever it
can't be — so a client joining a running bridge costs Live nothing. `fresh: true` forces
the walk, and it exists because some of what a snapshot carries has no `observe` in the
LOM at all (`Clip.length`, `Track.fold_state`, another device entirely), so the only way
to find out is to look — and the **Snapshot** button is the only thing that sends it. A
client never decides to walk on its own. The bridge follows the set's structure and the
Session cursor for itself, from the moment the LOM is ready and regardless of whether any
browser is open, and it runs the staleness backstop too; there are no `observe` or
`watchSelection` messages, because those are not a client's to hold. See
[`../bridge/docs/multiple-clients.md`](../bridge/docs/multiple-clients.md). The **`SetModel`** on the event is the same idea one layer up: the
mapping is read out of the scene names once, in the bridge, rather than by every client
over the same names. It rides on a `delta` too, but only when that delta moved a scene
row — the coarse-grained rule cuts both ways, and a song list re-sent on every clip edit
would be the chatty version of it.

**Master is not an ordinary track.** Live exposes it at `Song.master_track`, outside
`Song.tracks`, so `Snapshot.masterColor` carries its RGB separately for the heading over
the Master section, which fills from it exactly as a track header fills from
`Track.color`. It is nullable: a rejected Master atom falls back to the neutral app surface
rather than failing the snapshot. A Master color observer sends the same field on a
delta, so recoloring it in Live updates the held snapshot without a full walk.

**Colors are indexes.** `ApplyOp.colorIndex` is a slot in Live's palette. `Clip`
carries both `colorIndex` (what we write) and `color` (the RGB Live renders, so the UI
needs no lookup). Never write raw RGB.

**Except for scenes, where RGB is the only writable form.** `SceneOp` carries
`colorIndex` *and* `color`, always together: the index is the intent — what the UI shows
and what undo reverses — while the RGB is what actually reaches Live, because
`Scene.color_index` is documented "Can be None for no color" and Max's LiveAPI can read
an `Optional[int]` but not construct one to write. Setting it answers `unsupported
property type` and does nothing. This is the documented exception, it applies to scenes
and tracks only, and `bridge/README.md` records how it was learnt.

**`SceneOp` is not an `ApplyOp` with a different address.** They're separate types
rather than a discriminated union because the two aren't the same write pointed
somewhere else — the color rule above differs between them. Keeping them apart is what
stops `lom.ts` sending one down the other's path. They travel in one `apply` message so
a write that tags scenes and recolors their clips stays a single operation with one
progress count and one reverse batch.

**`addScenes` is separate from `move` because addition should be incapable of
deletion.** It creates exactly eight blank scenes at one insertion gap, then gives each
the same name and optional RGB/tempo. Both bridge layers validate the fixed count. The
result carries created/configured/failed counts, and every client re-snapshots because
all scene indexes below the gap shifted.

**`move` is separate from `apply` because it destroys things.** It would have fitted as
one more optional field on `apply` — and that's precisely the argument against it. `apply`
writes fields on things that already exist and is fully reversible from a snapshot; `move`
creates and deletes scenes and is reversible from nothing. Two paths that differ that
much should not be one typo apart.

The whole plan is computed in `core/` and travels as data, so `lom.ts` executes it without
arithmetic of its own. The arithmetic is the part that can delete the wrong scenes, and it
belongs where there are tests. `MoveStep`'s indexes are **post-insert** — they already
account for the blanks created at the destination — so don't recompute them on the far
side. And `MovePlan.remove` is **descending**, because each deletion renumbers everything
below it; that ordering is load-bearing rather than cosmetic.

`moved` carries counts rather than an `ok` because the caller has no other way to find
out what happened: the scenes it named no longer exist at the indexes it sent. A non-zero
`failed` means the set is not what was planned — some clips didn't make it across, and the
bridge deliberately left the originals in place rather than deleting on top of a partial
copy.

**"Absent" gets its own value, never a plausible default.** `Scene.colorIndex` is -1
when the scene has no color, because Live documents it as nullable and slot 0 is a real
color. `Track.groupIndex` is -1 when ungrouped. A field that can be absent and encodes
it as 0 is a bug waiting to look like data.

**Group membership travels as an index, not an id.** The LOM answers `group_track` with
an object id; the bridge resolves it against the track list so the wire stays in the
same `i`-indexed space as everything else. It's the *immediate* parent — groups nest.

**Some requests have no reply, deliberately.** `launch`, `stop`, `selectScene`,
`selectTrack`, `setTransport`, `setMixer`, `setDevice` and the watch requests are not in
`TERMINAL`. What you want back from
firing a clip isn't an acknowledgement, it's the play state changing, and that arrives
on its own as `playState`. Selecting a scene likewise reports through the existing
Session-cursor observers; the client has already navigated its own grid. Meter watching
answers with the first `meterLevels` push. Awaiting an ack would only add a round trip to
streams that report their own readiness. Transport and mixer writes are acknowledged by
their next observed state readback for the same reason: the value Live accepted matters
more than the fact that `set` returned. The cost of that choice is that a failure has no request to
attach to, so `bridge.ts` **broadcasts** an `error` with no `id` when nothing is pending —
dropping it is how a silent bug hides.

**Mixer controls are coarse-grained separately from level frames.** `MixerState` carries
every track's activator, Solo, Arm capability/state, volume, pan and indexed send
parameters, plus Master volume and pan. Parameters include Live's formatted display and
reset values. Send rows and their one-observer-per-track-per-return cost exist only while
`watchSends` is on. One property
callback produces one coherent cached state; it does not re-read every strip. `MeterFrame`
remains numbers-only at 30 Hz, so moving a control or running parameter automation never
puts the entire grid through React state. `setMixer` is one patch
for one strip, even when a future gesture changes several related fields together.

**A device is written the same way, and addressed by position.** `setDevice` carries a
target of `{ t, path, i }` — the run a `ChainWatch` names, plus which device in it — and a
patch of `on`, `folded` and one control by index. There is no device id on the wire, so
there is none to write against: an id would mean the bridge holding a copy of the set's
device tree, which is the thing the targeted watch exists to avoid. `folded` is the field
that does two jobs, because `open` in the watch is derived from it — writing it is how a
client asks for a device's parameters and how it gives them up.

**Play state is per track, never per clip.** `TrackPlayState` carries
`playing_slot_index`, `fired_slot_index` and `arm`, which between them describe the whole
grid in three properties per track. The clip-addressed version of this would need two
observers per *slot* — tens of thousands on a real set, and exactly the chatty design the
coarse-grained rule exists to prevent. `fired` keeps Live's own **`-2` for "the track's
stop button is fired"** rather than folding it into `-1`: a track about to stop is a
different state from a track with nothing pending, and the UI blinks for it.

`armed` rides here as well as in `MixerTrackState`, and the duplication is deliberate.
Arm decides what an *empty* slot does — `ClipSlot.fire()` triggers that slot's stop
button on an unarmed track and starts recording on an armed one — so every empty cell in
the grid draws a different button depending on it. The mixer's copy is observed only
while its footer is open; this watcher is never off, because the grid never closes.

## `moveClips`

Dragging clips between slots. Separate from `move` for the reason `move` is separate from
`apply`: `move` creates and deletes *scenes* and renumbers the set, while this touches
only slots and leaves every index meaning what it meant. Sharing a message would let a
caller reach the scene-deleting path by filling in one more field.

**`steps` is ordered and must not be re-sorted.** A drag is a rigid translation, so one
clip's target is often another's source; `core/src/clipMove.ts` orders the copies against
the direction of travel so nothing is overwritten before it has been read. Re-sorting on
the far side doesn't raise — it silently drops clips in the overlap.

Copy-then-delete, because Live has no move. Every copy runs before any delete, so
`failed > 0` means **nothing was deleted** and the set holds both copies: not what was
asked for, but nothing lost.
