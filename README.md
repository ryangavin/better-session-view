# better-session-view

Session manager for large Ableton Live sets. Bulk clip naming and coloring across a
100+ song set, driven from a real UI instead of Live's grid.

**Stage 1 (this repo so far):** a Max for Live device that exposes the Live Object
Model over a local WebSocket *and* serves the UI from the same Node process. One
`.amxd` plus this folder — no app bundle, no code signing, no updater.

## Layout

```
bridge/
  SessionBridge.amxd     built device (do not edit — regenerate)
  SessionBridge.maxpat   same patcher, openable in Max for debugging
  bridge.js              Node for Max: HTTP + WebSocket server
  lom.js                 Max [v8]: the only code that touches the LOM
  public/index.html      diagnostic UI / first look at the grid
tools/
  amxd.mjs               pack/unpack .amxd containers
  build-device.mjs       generates the patcher and packs the device
```

## Build

```sh
npm install            # also installs bridge/ deps
npm run build          # generate the device
npm run dev            # rebuild the device on every change to tools/
```

Everything else already hot-reloads: `node.script @watch 1` restarts `bridge.js`,
`autowatch` reloads `lom.js`, and the server watches `public/` and pushes a reload
to every open browser. Only the `.amxd` itself needs a build step, and Live picks
up the rebuilt file on its own.

## Colors

Clip color is written as **`color_index`** — a slot in Live's own palette — never as
raw RGB. Snapshots carry both: `colorIndex` (what we write) and `color` (the exact
RGB Live renders it as, so the UI needs no lookup to draw a clip).

Live exposes no way to read its palette, so the bridge derives it: **Extract palette
from Live** appends a scratch scene, walks `color_index` upward reading back each
RGB, stops when Live clamps the index (that's how the palette size is discovered
rather than assumed), then deletes the scene. The result is cached to
`bridge/palette.json` and served at `/palette.json`, so it runs once per Live
version. Nothing you own is touched, and the scene is removed even if the sweep
throws.

## Load it

1. In Live, drop `bridge/SessionBridge.amxd` onto any track (it's an audio effect
   with a `plugin~ → plugout~` passthrough, so it's inert on the signal path —
   the Master track is a fine home).
2. The device shows a status line and an **Open Session Manager** button. Wait for
   it to read `connected to Live`, then click the button.

Status line: `starting…` → `server up` (Node is listening) → `connected to Live`
(the LOM handshake completed). If it sticks on the first two, open the Max window
(**Options ▸ Max ▸ Open Max Window**) — that's where errors land.

Only one copy of the device can run at a time; they'd fight over the port. A second
instance posts a warning to the Max window rather than crashing. Override with the
`BSV_PORT` environment variable if you need to.

**Keep the folder together.** The device resolves `bridge.js` and `lom.js` relative
to its own location, so load the `.amxd` from this repo rather than copying it into
the User Library alone.

## Architecture

```
browser ──WebSocket/JSON── node.script (bridge.js) ──Max msgs── v8 (lom.js) ──LOM── Live
```

`lom.js` is the only file that knows Live exists. Everything crossing between the two
halves is **coarse-grained**: one message per *operation*, never per property. A full
set is thousands of LOM reads; done chatty over a socket that's minutes, done as a
single in-device walk it's whatever the LOM costs and nothing more.

Large payloads travel via named Max **Dicts** (`bsv_snapshot`, `bsv_ops`,
`bsv_result`), not message atoms — clip names contain spaces, commas and semicolons,
all of which are special in Max messages.

Writes are executed in chunks of 50 ops on a `Task`, yielding between chunks. LOM
work runs on Live's main thread; a tight 3,000-op loop freezes the UI and can glitch
audio. Chunking also gives progress reporting for free.

### Wire protocol

Client → server:

| message | meaning |
|---|---|
| `{id, type:"snapshot"}` | walk the whole set |
| `{id, type:"apply", ops:[{t,s,name?,colorIndex?}]}` | bulk write, clip-slot addressed |
| `{id, type:"palette"}` | derive and cache Live's color palette |
| `{type:"observe", on:bool}` | structural change notifications |

Server → client: `status`, `snapshot`, `progress`, `applied`, `palette`, `changed`,
`reload`, `error`.

## Known unknowns

Things this stage exists to answer, on a real set:

- **LOM walk time.** The UI reports it as `LOM walk`. Decides whether snapshotting is
  a background nicety or a loading screen.
- **Palette size.** Whatever the sweep reports. Also worth confirming the palette is
  theme-independent — if it isn't, the cache needs to be keyed by theme.
- **Dict round-tripping** of clip names containing punctuation.
- **Observer cost.** Currently structural only (track/scene lists). Per-clip observers
  would be ~1 per slot; measure the snapshot cost before deciding that's worth it.

## Testing

`bridge.js` is covered end-to-end against a stubbed `max-api` (static serving, path
traversal, WS handshake, readiness gating, request routing by id, dict staging,
progress streaming, error paths). `lom.js` needs Live and is currently unverified.
