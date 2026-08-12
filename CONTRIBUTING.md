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
browser ──WebSocket/JSON──> node.script (bridge.js) ──Max msgs──> v8 (lom.js) ──LOM──> Live
   :17800 or :5173 in dev        HTTP + WS server         the only LOM code
```

The device serves the UI from the same Node process that bridges to Live. That's
deliberate: the whole app ships as an `.amxd` plus two JS files — no app bundle, no
code signing, no updater. `bridge.js` is bundled with `ws` and the built UI inlined,
so there's no `node_modules/` and no `public/` to keep alongside it.

Set-owned configuration lives in a hidden parameter on the bridge device, so Live
stores it directly in the `.als`. The fixed Live color table is compiled into the app.
Replacing the device folder or clearing browser storage costs the user nothing.

## Modules

Five projects. Each has its own README; read the one you're touching.

| module | what it is | read for |
|---|---|---|
| [`protocol/`](protocol/README.md) | wire types, single source of truth | adding or changing a message |
| [`core/`](core/README.md) | pure domain logic — no I/O, no React, no Live | naming, colors, anything that deserves tests |
| [`ui/`](ui/README.md) | React 19 + Vite | components, the bridge client, dev server |
| [`bridge/`](bridge/README.md) | the M4L device: Node + `v8` halves | **anything touching Live.** The most constraints live here |
| [`tools/`](tools/README.md) | `.amxd` container format, device generator | changing the patcher or device type |

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

Not in git; `npm run build` recreates all of them.

```
bridge/bridge.js  bridge/lom.js          tsc output, run directly by Max
bridge/public/                           vite build output
bridge/SessionBridge.amxd  .maxpat       device + debug patcher
```

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
