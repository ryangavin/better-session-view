# better-session-view

Session manager for large Ableton Live sets. Bulk clip naming and coloring across a
100+ song set, driven from a real UI instead of Live's grid.

Live stays the audio engine and the source of truth. This app is a front end that
reads and writes the Live Object Model over a Max for Live bridge — no `.als` file
parsing, ever.

## Start here

```sh
npm install                       # root + bridge/ deps
npm run build                     # everything, including the .amxd
```

Then in Live, drop `bridge/SessionBridge.amxd` onto any track and click **Open
Session Manager**. Full instructions: [`bridge/README.md`](bridge/README.md).

| script | does |
|---|---|
| `npm run build` | bridge.js, lom.js, UI → `bridge/public/`, and the device |
| `npm run dev` | three watchers in parallel; UI dev server on :5173 |
| `npm run dev:ui` | the UI dev server alone, against a device someone else is running |
| `npm run build:device` | the `.amxd` only — deliberately not watched |
| `npm test` | `core/` unit tests |
| `npm run typecheck` | all five projects |

## Architecture

```
browser ──WebSocket/JSON──> node.script (bridge.js) ──Max msgs──> v8 (lom.js) ──LOM──> Live
   :17800 or :5173 in dev        HTTP + WS server         the only LOM code
```

The device serves the UI from the same Node process that bridges to Live. That's
deliberate: the whole app ships as one `.amxd` plus a folder — no app bundle, no
code signing, no updater.

## Modules

Five projects. Each has its own README; read the one you're touching.

| module | what it is | read for |
|---|---|---|
| [`protocol/`](protocol/README.md) | wire types, single source of truth | adding or changing a message |
| [`core/`](core/README.md) | pure domain logic — no I/O, no React, no Live | naming, colors, anything that deserves tests |
| [`ui/`](ui/README.md) | React 19 + Vite | components, the bridge client, dev server |
| [`bridge/`](bridge/README.md) | the M4L device: Node + `v8` halves | **anything touching Live.** The most constraints live here |
| [`tools/`](tools/README.md) | `.amxd` container format, device generator | changing the patcher or device type |

## The rules that aren't negotiable

1. **`core/` imports no transport, no React, and nothing Live-specific.** It's what
   makes the domain logic testable without Live running, and what keeps a different
   backend possible later.
2. **`lom.ts` is the only file that touches the Live Object Model.** Everything else
   talks to it through the protocol.
3. **The bridge protocol is coarse-grained** — one message per *operation*, never per
   property. A full set is tens of thousands of LOM reads.
4. **Clip color is written as `color_index`**, never raw RGB.
5. **Nothing loads from a CDN.** This eventually runs on stage.

## Generated files

Not in git; `npm run build` recreates all of them.

```
bridge/bridge.js  bridge/lom.js          tsc output, run directly by Max
bridge/public/                           vite build output
bridge/SessionBridge.amxd  .maxpat       device + debug patcher
bridge/palette.json                      derived from Live at runtime
```

A fresh clone needs `npm install && npm run build` before the device exists.

## Environment this was built against

Nothing here is version-agnostic; the bridge in particular depends on what Live's
embedded Max provides.

| | |
|---|---|
| Ableton Live | 12.4.3 Suite |
| Max embedded in Live | 9.1.4 — supplies `v8` and Node for Max |
| Node inside Node for Max | 22.18 (bundled with Max) |
| Node for tooling | 24.1 — runs `.ts` directly via type stripping |

## Open questions

Things only a run against a real set can answer.

- **Snapshot cost at full size.** 243 clips / 100 scenes measured ~933ms for the LOM
  walk before the id-addressing change. Every phase is a linear scan, so 848 scenes
  projects to seconds, not milliseconds. The UI prints a phase breakdown and a
  projection to the console on every snapshot — see [`ui/README.md`](ui/README.md).
  If it stays slow, the answer is streaming partial snapshots.
- ~~**Palette size and theme-independence.**~~ **Answered.** Live 12.4.3 reports 70
  colors, all distinct, row-major across the 14 × 5 grid in its own color picker —
  verified against a screenshot of it. The theme `.ask` files carry no clip colors, so the
  palette looks theme-independent and the cache needs no theme key. Values are recorded in
  [`bridge/README.md`](bridge/README.md). Deriving it needs a **clip**: `Scene.color_index`
  and `Track.color_index` are documented nullable and Max's LiveAPI can read but not write
  an optional property.
- **Write-path addressing.** `apply` still resolves a path string per op — same cost
  class as the old slot scan. Needs an id cache from the last snapshot, plus
  staleness handling.
- **Launching, and play state, against a real set.** `playback` and `watch_play` in
  `lom.ts` are entirely unverified — no automated coverage reaches them. Three specific
  unknowns: whether `2 × trackCount` observers stay cheap while a set is rolling, whether
  `Task.schedule(0)` really defers (if it fires synchronously, coalescing degrades to one
  message per callback rather than breaking), and whether `ClipSlot.fire`'s optional
  `launch_quantization` arg can be passed through Max's `call()` — that's the
  non-destructive route to instant audition, and until it's confirmed, firing respects the
  set's global `clip_trigger_quantization`.
- **Cross-session clip identity.** Clips have no stable id in the LOM. Addressed
  within a session by `(track, scene)`; persisting our own metadata across restarts
  is unsolved and lands with song segmentation.

## Where this is going

MVP is set management: bulk naming and coloring, with clip and scene launching so you can
hear what you're labelling. Next up is naming and coloring **scenes and tracks**, not just
clips — `ApplyOp` is clip-addressed today, which means the sweep-and-label loop can play a
scene but not rename it. After that, roughly in order —
song segmentation (grouping scenes into songs), role assignment via shape templates,
a declarative scheme with a pending-changes diff, and lint for drift. Setlist
reordering is deliberately excluded: the LOM has no scene-move API, so it means
duplicate-then-delete across every track, and it's the one operation that can damage
a set.
