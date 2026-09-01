# Contributing

Start with [`README.md`](README.md) for what the app is and how to build it. This file is
the map for how the pieces fit together.

**Agents: [`AGENTS.md`](AGENTS.md) is your startup read**, not this file. It carries the
non-negotiable rules, how to verify a change, and the routing table into the module docs.
This file is orientation you need only when the shape of the project is what's in question.

Most of the constraints here are non-obvious and expensive to rediscover. Each module
README is an index of topic docs — read the rows that match what you're changing.

## Architecture

```
set[flow]    ──WS/JSON──┐
                        ├──> node.script (bridge.js) ──Max msgs──> v8 (lom.js) ──> Live
visual[flow] ──WS/JSON──┤         :17800, WS only        the only LOM code
   └─ its own server ───┘
chart        ──WS/JSON──┘   (read-only, and the only one that binds the LAN)
```

The device is the WebSocket server and nothing else. It ships as an `.amxd` plus two
JS files — no app bundle, no code signing, no updater — and `bridge.js` is bundled with
`ws` so there is no `node_modules/` to keep alongside it.

It used to serve the session manager too, with the built app inlined as base64: 595 kB
of web app, three quarters of `bridge.js`, parsed inside Live's process on every device
load. The front ends are desktop apps now — [`set/docs/desktop.md`](set/docs/desktop.md)
— and what is left here is the one job that has to happen inside Max.

Set-owned configuration lives in a hidden parameter on the bridge device, so Live
stores it directly in the `.als`. The fixed Live color table is compiled into the app.
Replacing the device folder or clearing browser storage costs the user nothing.

### The device knows the set; clients are shown it

**`bridge.js` holds the current state of the Live Set and keeps it current for its own
sake.** It reads the set once when the LOM reports ready, watches Live's structure and its
Session cursor from that moment until the device is unloaded, and patches what it holds
from every delta and every write that passes through it. It derives the song mapping from
that — once, for Push and every browser together — into a `SetModel`.

A client asking for the set is therefore **a message and a payload**, not a walk. It never
causes Live to do work except in one case it cannot avoid (the bridge holds nothing yet)
and one a person asked for (the **Snapshot** button). Opening a tab, closing the last tab,
refreshing, and hot-reloading a hook all leave what the device knows untouched.

That last sentence is the invariant, and it was not free. The two watches that keep the
held set current used to be client subscriptions, which made the device's knowledge of the
set conditional on a browser being open: closing the last tab blinded the bridge, and
opening one re-installed the LOM observers — which Live answers by calling back with the
value it already had, indistinguishable from the set genuinely changing. So connecting
invalidated the cache the client was about to read, then paid ~2.6s to rebuild it. The
symptoms were varied and the cause was singular: **something outside the device was
deciding what the device could see.**

Why it matters beyond the speed: the state is what Push reads with no browser open at all,
and a second kind of client — a stage display, a CLI — should cost nothing and perturb
nothing. Anything that makes the held state depend on who is connected breaks both. The
reasoning in full, including which watches are the device's and which are a viewport's, is
in [`bridge/docs/multiple-clients.md`](bridge/docs/multiple-clients.md).

## Modules

Ten projects. Each has its own README; read the one you're touching.

| module | what it is | read for |
|---|---|---|
| [`protocol/`](protocol/README.md) | wire types, single source of truth | adding or changing a message |
| [`core/`](core/README.md) | pure domain logic — no I/O, no React, no Live | naming, colors, anything that deserves tests |
| [`widgets/`](widgets/README.md) | DAW controls — React, but no Live | knobs, faders, the parameter model, the bench |
| [`set/`](set/README.md) | the session manager, **set[flow]** — React 19 + Vite | components, the bridge client, dev server |
| [`bridge/`](bridge/README.md) | the M4L device: Node + `v8` halves | **anything touching Live.** The most constraints live here |
| [`desktop/`](desktop/README.md) | the Electron main process every app shares | the window, packaging, or adding a new app |
| [`tools/`](tools/README.md) | `.amxd` container format, device generator, the app driver | changing the patcher, the device type, or how an app is built |
| [`visuals/`](visuals/README.md) | a VJ rig: Link peer, bridge client, WebGL2 renderer | visuals, the clock, or a second kind of client |
| [`chart/`](chart/README.md) | what the band reads: a read-only view of the playing song, on a phone | the section list, the LAN binding, or a client with no dependencies |
| [`mix/`](mix/README.md) | stem separation with Demucs, **mix[flow]** — a skeleton | the model, the job runner, or what a third app costs |

`visuals/` is the first thing to take rule 5 up on its offer of "a second kind of client":
it follows the bridge, perturbs nothing, and needs no browser open anywhere else. It is a
separate process because Ableton Link is a native addon and the bridge's Node lives inside
Max, and because it is meant to run on a different machine entirely.

`chart/` is the second, and it is separate for a different reason: its clients are other
people's phones. The device binds `127.0.0.1` on purpose, so putting a chart on the band's
wifi without also putting *every write in the protocol* there means something read-only in
between. It holds one bridge connection however many people are looking, sends Server-Sent
Events rather than a socket because a phone has nothing to say back, and installs nothing
at all — Node's own `WebSocket` client and `node:http` are the whole runtime.

`desktop/` is the third module that exists to be shared rather than to do something. It
appeared when the third app did: two apps that each own a whole main process look like
duplication you can live with, three do not, and the two we had had already drifted —
set[flow] remembered where its window was and visual[flow] did not, visual[flow] refused a
second instance and set[flow] did not. An app is now a `main.ts` of about fifty lines saying
what is only true of it, plus an entry in `desktop/src/apps.ts` that every build tool,
workflow and vite config reads. It is also where a change that should reach every app —
an updater, most obviously — is written once.

`mix/` is the first module that touches Live not at all. It has no bridge connection, no
server and no protocol — a file goes in and four files come out — and it exists partly to
find out what an app costs now that `desktop/` holds the shell. The answer was a registry
entry, a `main.ts` of fifty lines, a preload, and a renderer. What it does *not* have yet is
an answer to where several gigabytes of Python and model weights come from in a shipped
bundle; [`mix/docs/demucs.md`](mix/docs/demucs.md) lays out the three candidates.

`core/` and `widgets/` are the same rule on two axes, and between them they are what keeps
a DAW of our own possible: domain logic that has never heard of a transport, and controls
that have never heard of Live. `set/` is the only module allowed to know both, and it does
the joining in one adapter — [`set/src/lib/liveParam.ts`](set/src/lib/liveParam.ts).

[`bridge/LOM.md`](bridge/LOM.md) is the Live Object Model itself — every class, property
and function with its type and access mode, plus the places Cycling '74's docs are wrong
about the version we run. Hand-maintained — edit it directly; `npm run dev:lom-scrape`
rescrapes the docs to a scratch file to diff against, and never overwrites it.
**Check it before assuming
Live exposes something, and before assuming a property you can read is one you can
write.**

## The rules, and verifying a change

Both live in [`AGENTS.md`](AGENTS.md) — the ten rules that aren't negotiable, and what to
run before claiming something works. They're there rather than here because they apply to
every change, so they belong in the file that's always read.

## The user manual is a separate repo

The [wiki](https://github.com/ryangavin/better-session-view/wiki) is how to *use* the app,
as against these READMEs, which are about why it's built the way it is. It's a separate git
repository, so clone it and edit it like any other:

```sh
git clone git@github.com:ryangavin/better-session-view.wiki.git
```

Being a separate repo, it can't change in the same commit as the code. **Anything a user
can see or press means a second push**, and nothing enforces it — a UI change that ships
without one leaves the manual quietly wrong.

## Generated files

Not in git. `npm run build` makes the device:

```
bridge/bridge.js  bridge/lom.js          tsc output, run directly by Max
bridge/SessionBridge.amxd  .maxpat       device + debug patcher
```

The apps make their own at launch, which is what keeps them from ever being stale:

```
set/dist/  set/electron/dist/            `npm run set`
visuals/dist/  visuals/electron/dist/    `npm run visuals`
chart/dist/                              the band's page — `npm run build:chart`
release/                                 packaged .app and .dmg — `npm run pack`
```

**`npm run build` builds no front end at all**, and that is the point of the split: the
device must build on a machine where the Link addon does not and where no Electron binary
has been downloaded, so the thing that ships depends on neither. `npm install` still builds
the addon, and failing that is a warning rather than an error.

## What `npm ci` prints, and what is left standing

Not silence, and the difference between the lines matters. Each of these has been chased
to its cause; none is a to-do nobody got to.

**`bridge/` and `visuals/` keep their own `node_modules`, and neither may hold a second
React.** The first ships beside Live with no dependency tree at all; the second has the
native Ableton Link addon and `!node_modules/**` in its `electron-builder.yml`. Both are
right. What neither can hold is a package that only works as one copy — install anything
with a React peer dependency into `visuals/` and npm will satisfy that peer *there*, giving
the tree two module registries and every `useContext` under the second one a null
dispatcher. The error surfaces from library code nowhere near the install.

The split is by side, not by folder: the UI is bundled by the root toolchain, so React,
React Flow and `d3-hierarchy` are root dependencies, while `visuals/package.json` holds the
server and Electron side — Link, `ws`, `zod`, the MCP SDK. `npm run dev:check-singletons`
enforces it and runs on `postinstall`.

**Four deprecation warnings — `inflight`, `glob@7`, `rimraf@2`, `boolean` — are all
electron-builder's.** Every one traces to `app-builder-lib`: `@electron/asar` pulls old
`glob` (and `inflight` under it), `@electron/get` pulls `global-agent` for `boolean`, and
`rimraf` arrives under `electron-builder-squirrel-windows` — a Windows installer target
that is dead weight here and still a hard dependency of the tree above it. There is no
version of this we can pick that does not have them, and none of it reaches an app:
`!node_modules/**` in both `electron-builder.yml` files is why the payload is 4 MB. Pinning
them through `overrides` would mean forcing a build tool onto internals it was not tested
against, to quiet a log line. Leave them.

**`npm audit` reports nothing**, and the way to keep it that way is to move vite and vitest
together. They were once five findings that were all one bug — `vitest@2` pinning `vite@5`
pinning a vulnerable `esbuild`, reported once per package in the chain and rolled up as
critical at the top. Upgrading the pair cleared all five at once, which is the shape this
takes every time: an advisory against a bundler reaches the tree through the test runner
that bundles with it, so the runner is what you upgrade.

**One line from the addon compile is expected:** `libtool: warning: 'nothing.o' has no
symbols`. `nothing.o` is node-addon-api's deliberately empty translation unit, and an empty
object file is what it is supposed to be. The repairs `build-link.ts` makes are described in
its own header; a compile that got past them is a compile that worked.

## Environment this was built against

Nothing here is version-agnostic; the bridge in particular depends on what Live's
embedded Max provides.

| | |
|---|---|
| Ableton Live | 12.4.3 Suite |
| Max embedded in Live | 9.1.4 — supplies `v8` and Node for Max |
| Node inside Node for Max | 22.18 (bundled with Max) |
| Node for tooling | 24.1 — runs `.ts` directly via type stripping |

## Where this is headed

The library / scheme / mapping split, what each layer owns, and the decisions behind the
naming convention are in [`docs/direction.md`](docs/direction.md). Read it before changing
how derivation, patterns or song identity work; skip it for routine feature work.

## Planned work

Roadmap items and the questions only a run against a real set can answer are tracked in
[Issues](../../issues), not here. A doc goes stale; an issue gets closed.
