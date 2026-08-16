# Dev server and hot reload

Running the dev server, and what a hot update costs — why BridgeProvider sits above App.

## Dev

```sh
npm run dev            # from repo root — this, the bridge watchers, and the widget bench
npm run dev:ui         # this alone, against a device someone else is running
```

Use **<http://localhost:5173>**, not :17800. Vite proxies `/ws` through to the device,
so you get HMR with React Fast Refresh — and, more to the point, a loaded snapshot
that survives your edits. A walk is ~950ms of Live's main thread; an edit to a CSS
variable must not spend it.

### What a hot update costs

`BridgeProvider` is what makes that true, and it earns its place by being the parent
of `App` rather than something inside it. Fast Refresh does one of two things to a
component whose module updated, and with the connection inside `App` both of them
were re-reading the whole set:

- **Re-render with fresh dependencies.** React ignores the previous deps of every
  `useMemo`, `useCallback` and `useEffect` in a component it just hot-updated, so
  `useMemo(() => new BridgeClient(), [])` built a new client — dropping the socket,
  reconnecting, and re-arming every watch this client owns. That used to include
  `observe`, which re-attaches the `tracks` and `scenes` observers; an observer
  calls back on attach, that was broadcast as `changed structure`, and **every**
  connected client walked the set. So editing a hook re-read forty tracks. The
  device owns those two watches now and a reconnect cannot disturb them, which
  makes this the cheap case rather than the expensive one.
- **Remount.** Fast Refresh compares a signature built from the hooks a component
  calls, *including the hooks nested inside every custom hook it uses* — `App`'s is
  computed over fifteen of them. Change any one and the signatures differ, React
  can't assume the state still means the same thing, and it remounts. That drops
  the snapshot, and the once-per-session walk fires again on the next `lomReady`.

Vite hands an update to the importers of the changed file until one accepts it.
Nothing under `hooks/`, `lib/` or `core/` is a Fast Refresh boundary — only files
whose every export is a component are — so all of them land on `App`. Splitting the
provider out puts that whole blast radius *below* the socket: edit a hook and `App`
remounts against the snapshot the provider is still holding, with no wire traffic
at all.

So the bill for an edit is now the honest one:

| edited | costs |
|---|---|
| a `.css` file | a style swap, nothing else |
| a component under `components/` | that subtree re-renders |
| a hook, `lib/`, `core/`, `App.tsx` | `App` re-renders or remounts; the connection and snapshot survive |
| `useBridge.ts`, `useBridgeSession.ts`, `client.ts` | a reconnect and a walk — you edited the bridge |
| `main.tsx`, `vite.config.ts` | a full page reload |

One thing that still walks and isn't HMR: the staleness backstop. It runs in the
**bridge** now, on a fixed tick, so editing for five minutes no longer means the
next click into the browser spends Live's main thread — coming back to the window
just re-asks for the set, which is a payload. See `core/src/backstop.ts` for the
policy and `bridge.ts`'s `backstopTick` for the caller.

Three env vars, all optional:

| var | default | for |
|---|---|---|
| `BSV_UI_PORT` | `5173` | a second UI alongside the first — one per worktree |
| `BSV_BENCH_PORT` | `BSV_UI_PORT` + 100 | overriding where the widget bench lands |
| `BSV_BRIDGE` | `http://127.0.0.1:17800` | pointing at a device other than the local one |

`strictPort` is on, so a port collision fails loudly instead of drifting to the next
free one. That's deliberate: assign the port, don't discover it.

The bench derives its port from this one so a worktree moves both in a single variable,
and the offset is 100 rather than 1 because worktree ports get picked adjacently — see
[`widgets/docs/bench.md`](../../widgets/docs/bench.md), which also covers why both Vite
servers have to name their own `cacheDir` now that they run together.

Several dev servers can share one device — they all proxy to the same bridge, and
`BridgeClient` derives its socket URL from `location.host`, so nothing needs telling
which port it's on. That's the multi-client path, so see
[`bridge/README.md`](../../bridge/README.md) for what the bridge does and doesn't yet
guarantee when more than one client is connected.

:17800 serves the built output and stays available for testing what actually ships.
When you edit `public/` directly, `bridge.js` watches it and pushes a `reload` event;
`useBridge` calls `location.reload()`. That path only exists for the built output —
in dev, Vite's HMR wins.

**Nothing loads from a CDN.** No external fonts, scripts, or stylesheets. This
eventually runs on stage, where there may be no network. Vite bundles everything;
keep it that way.
