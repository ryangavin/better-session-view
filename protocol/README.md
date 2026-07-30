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
Unsolicited events (`status`, `changed`, `reload`, `paletteUpdated`) carry no id.

| client → server | |
|---|---|
| `snapshot` | walk the whole set |
| `apply` `{ ops }` | bulk write, clip-slot addressed |
| `palette` | derive and cache Live's palette |
| `observe` `{ on }` | structural change notifications |
| `ping` | |

| server → client | terminal for |
|---|---|
| `snapshot` | `snapshot` |
| `applied` | `apply` |
| `palette` | `palette` |
| `pong` | `ping` |
| `progress` | — streams during `apply` |
| `status` | — connection / LOM readiness |
| `changed` | — an observer fired |
| `paletteUpdated` | — broadcast after extraction |
| `reload` | — dev live-reload |
| `error` | — terminates any pending request |

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

**Colors are indexes.** `ApplyOp.colorIndex` is a slot in Live's palette. `Clip`
carries both `colorIndex` (what we write) and `color` (the RGB Live renders, so the UI
needs no lookup). Never write raw RGB.

**"Absent" gets its own value, never a plausible default.** `Scene.colorIndex` is -1
when the scene has no color, because Live documents it as nullable and slot 0 is a real
color. `Track.groupIndex` is -1 when ungrouped. A field that can be absent and encodes
it as 0 is a bug waiting to look like data.

**Group membership travels as an index, not an id.** The LOM answers `group_track` with
an object id; the bridge resolves it against the track list so the wire stays in the
same `i`-indexed space as everything else. It's the *immediate* parent — groups nest.
