# An app that owns a backend

`desktop/src/supervise.ts`.

visual[flow] is the only one so far. It replaces `npm run dev` as the way to run a show:
`concurrently -k` over ten dev processes means any one of them exiting kills the other
nine, which is right for a dev loop and wrong for a gig.

```ts
const server = supervise({ app: VISUALS, env: { OPENFLOW_VISUALS_DIST: rendererDist() } });
const up = await server.answered(PORT);
if (!server.running) return;
if (!up) { /* say so, and quit */ }
```

## It is a child, not this process

Electron's main process is a Node process, so hosting the server here would work and
would save a socket hop. It stays a child for three reasons that outlast any one of
them: **the server remains a program you can run** — bare, in a test, or on a second
machine with no app at all; a renderer crash cannot take it with it, and a crash of its
own gets restarted rather than ending the evening; and what the app supervises is
byte-for-byte what everything else runs.

The reason it was *originally* split out turned out not to be one. The worry was the
Ableton Link native addon, and an addon built for Node's ABI has no business loading
under Electron's — except that the package wraps Link with **node-addon-api**, which is
N-API, whose entire purpose is an ABI that holds across both. That was checked by
loading it rather than assumed, and it is why nothing is rebuilt per Electron upgrade.

## Electron's own Node, not yours

The child is `process.execPath` with `ELECTRON_RUN_AS_NODE=1`. A packaged `.app` has no
source tree to run an entry point from — and, launched from Finder, no `node` either: a
GUI process inherits `/usr/bin:/bin`, not whatever a shell profile added. So the app
carries its own.

The server is bundled to `electron/dist/server.mjs` beside the main process, and
`rendererDist()` points it at `dist/` two levels up. Both layouts are the same in the
repo and in the bundle, so neither needs a branch — but the server does have to be told,
because it otherwise works its own location out from `import.meta.url`, and that no
longer sits one hop from the renderer once it is bundled.

## The three things that bite at the worst time

**`before-quit` kills the child.** An orphan holding the port makes the *next* launch die
of `EADDRINUSE`, which is the most likely bug in any of this. `supervise()` registers it
itself, so an app cannot forget.

**Wait for the port before opening a window**, and settle before the first poll. A port
already in use answers *immediately*, from whatever is on it — so without the settle the
window opens onto somebody else's server a moment before ours dies. `answered()` is that
wait; `waitFor()` is the same wait without the settle, for a dev server this app does not
own, where opening onto what is already there is the entire point.

**Do not restart into a failure that waiting cannot fix.** A clean exit is the server's
own shutdown path, and status **2** is the one it emits specifically so a supervisor can
tell "the port is taken" from "it fell over". Nothing frees a port by trying again, so
neither is relaunched into — the app quits and lets the server's own message stand.

`running` is what tells "gone before it ever listened" from "never answered": in the
first case the child's own exit handler has already decided whether that was a restart or
a quit, and it is not the window's to open onto or complain about.
