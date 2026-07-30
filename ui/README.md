# ui/

React 19 + Vite. Builds to `bridge/public/`, which the device serves.

```
index.html            vite entry
vite.config.ts        build target + dev proxy
src/main.tsx          root
src/App.tsx           layout, selection state, op assembly
src/styles.css        design tokens + all styling
src/components/
  ClipGrid.tsx        scenes × tracks, memoized per row
  Inspector.tsx       rename pattern, swatches, apply
src/lib/
  client.ts           typed WebSocket client, framework-free
  useBridge.ts        React hook over the client
  selection.ts        clip addressing + selection set
```

## Dev

```sh
npm run dev            # from repo root — starts this plus the bridge watchers
```

Use **<http://localhost:5173>**, not :17800. Vite proxies `/ws` and `/palette.json`
through to the device, so you get HMR with React Fast Refresh — a loaded snapshot and
your current selection survive edits, which matters when a snapshot takes seconds.

:17800 serves the built output and stays available for testing what actually ships.
When you edit `public/` directly, `bridge.js` watches it and pushes a `reload` event;
`useBridge` calls `location.reload()`. That path only exists for the built output —
in dev, Vite's HMR wins.

**Nothing loads from a CDN.** No external fonts, scripts, or stylesheets. This
eventually runs on stage, where there may be no network. Vite bundles everything;
keep it that way.

## The client / hook split

`client.ts` is framework-free on purpose — it's the piece most likely to get reused
(a CLI, a stage display, a test harness).

- Requests carry an `id`; `request()` resolves with the **terminal** event for that id,
  per the `TERMINAL` map. Add a row there when you add an awaitable message.
- Non-terminal traffic (`progress`, `changed`, `reload`, `status`) goes to
  `subscribe()` listeners instead.
- `error` rejects any pending request with that id.
- Auto-reconnects after 1s on close, unless we closed it ourselves. All pending
  requests reject on disconnect rather than hanging.
- `lastWireTiming` holds round-trip, parse cost and payload size for the most recent
  reply. Read it synchronously right after the `await`. This is safe because UI
  requests are serialized behind `busy`; it would need per-id storage if that changed.

`useBridge.ts` wraps it in React state and owns the log lines. `guard()` wraps every
operation so failures land in the log rather than as unhandled rejections.

## Snapshot timing readout

Every snapshot prints a phase breakdown to the browser console — the answer to "is
this design going to scale":

```
⏱ snapshot  243 clips · 100 scenes · 1041ms end-to-end
  lom: tracks / scenes / slot scan / clip reads
  v8 → dict        JSON.stringify + Dict.parse
  node getDict     Max dict → JS object
  wire + parse     payload size
  react commit
projection to 848 scenes (×8.5, linear): ~8.8s end-to-end
```

The projection is honest because every phase is a linear scan. `TARGET_SCENES` in
`useBridge.ts` sets the reference size.

The header also shows `LOM walk` and `Slot scan` tiles, and the footer log carries the
headline numbers.

## Performance notes

**Rows are `memo`ized.** `ClipGrid` renders `sceneCount` rows × non-group tracks —
around 6,800 cells at full size. Memoizing the row is what keeps toggling one cell
from re-rendering all 848 scenes. Without it this is *slower* than the vanilla
`innerHTML` version it replaced. Don't pass fresh object or array props into `Row`.

**No virtualization yet.** Mounting all rows is acceptable at current sizes. If it
stops being acceptable, `@tanstack/react-virtual` on the row list is the contained
fix — but measure first; the console breakdown reports `react commit` separately for
exactly this reason.

**Selection is a `Set` of `"t:s"` keys** held in `App`. `selection.ts` owns the
encoding. Clips have no stable LOM id, so `(track, scene)` is the addressing within a
session.

## Styling

Plain CSS with custom properties in `:root` — dark, IBM Plex where available with
system fallbacks. No CSS framework, no CSS-in-JS. The tokens (`--amber`, `--dim`,
`--bd`, …) come from the original design mocks; reuse them rather than introducing
new values.
