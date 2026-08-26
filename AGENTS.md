# AGENTS.md

**This file is the whole startup read.** Everything else is on demand.

Each module's README is an index, not a document — a table of topics, each pointing at one
self-contained doc and the source it governs. Read the index, then **only the topic rows
that match what you're changing**. Reading a module's docs end to end is the wrong default;
most of what's in them is reasoning about a feature you aren't touching.

| touching | start at |
|---|---|
| domain logic — naming, colors, ordering, anything deserving tests | [`core/README.md`](core/README.md) — an index; docs mirror source, so `core/src/X.ts` is explained in `core/docs/X.md` and you can go straight there |
| the session manager — components, hooks, the client | [`set/README.md`](set/README.md) — 16 topic docs. `@openflow/set`, and **set[flow]** is what it calls itself |
| a knob, a fader, anything a device chain is drawn from | [`widgets/README.md`](widgets/README.md) — 5 topic docs. The package `@openflow/widgets`, imported by name; **knows nothing about Live, and must stay that way** |
| a VJ rig, Ableton Link, WebGL, or how a set becomes a show | [`visuals/README.md`](visuals/README.md) — 5 topic docs. `@openflow/visuals`: its own server and its own `node_modules`, deliberately **not** a workspace; an ordinary **client** of the bridge |
| what the band reads off a phone | [`chart/README.md`](chart/README.md) — 2 topic docs. `@openflow/chart`: no dependencies; a **read-only** client of the bridge, and the only thing here that binds the LAN |
| anything involving Live | [`bridge/README.md`](bridge/README.md) — 8 topic docs. **Most constraints in this project live here** |
| "does Live expose X?" | [`bridge/LOM.md`](bridge/LOM.md) — **look it up, don't guess.** Includes where the published docs are wrong |
| a wire message | [`protocol/README.md`](protocol/README.md) |
| the `.amxd` or the patcher | [`tools/README.md`](tools/README.md) |
| how the modules fit together, or where this is headed | [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/direction.md`](docs/direction.md) |
| anything a user can see or press | the [wiki](https://github.com/ryangavin/better-session-view/wiki) — see rule 9 |

Two docs are worth reading even when they aren't obviously your topic:

- [`set/docs/performance.md`](set/docs/performance.md) — governs **anything reaching a
  memoized row**. A prop that changes identity per render re-renders 848 rows.
- [`bridge/docs/lom-gotchas.md`](bridge/docs/lom-gotchas.md) — before any `lom.ts` edit.

[`README.md`](README.md) is for users, not for you: what the app is, install, build. Keep
it that way — architecture goes in `CONTRIBUTING.md`, rationale in the module docs, planned
work in [Issues](../../issues).

## Rules

1. **`core/` imports no transport, no React, and nothing Live-specific.** It's the only
   code testable without Ableton running, and what keeps a different backend possible.
   **`widgets/` is the same rule on the other axis** — React, but no protocol, no bridge,
   no `core/`, nothing that knows Live exists. It takes a `Param` and a number, and the
   one adapter that hands it one is `set/src/lib/liveParam.ts`.
2. **`bridge/src/lom.ts` is the only file that touches the Live Object Model.** Everything
   else talks to it through the protocol.
3. **`lom.ts` cannot `import` anything** — it compiles with `module: "none"` so Max's
   `[v8]` finds its handlers as top-level globals. Protocol types come from the global
   `OpenFlow` namespace. Adding an import breaks the device silently.
4. **The bridge protocol is coarse-grained** — one message per operation, never per
   property. A full set is tens of thousands of LOM reads.
5. **The device holds the set, and no client may change what it knows.** `bridge.js`
   reads the set once when the LOM is ready, watches Live's structure and Session cursor
   for as long as the device is loaded, and patches what it holds. A client connecting,
   disconnecting, refreshing or hot-reloading must not start, stop or re-arm any of that,
   and must never decide to walk Live — only the Snapshot button does. Two watches are the
   device's (`observe`, `watch_selection`) and six are a viewport's; adding a watch means
   answering which. `watch_chains` adds a second question, being the first with a
   *target*: it is refcounted per target rather than per kind, so a client releasing it
   can shrink what Live is watching without turning anything off. This was violated for a release and the symptoms looked like six
   different bugs — see [`bridge/docs/multiple-clients.md`](bridge/docs/multiple-clients.md).
6. **Clip color is written as `color_index`**, never raw RGB.
7. **Nothing loads from a CDN.** This runs on stage.
8. **Don't name things with words that already mean something in a DAW.** `transport`
   is play/stop/record. Same trap: scene, clip, cue, bus, send, return, warp, quantize,
   follow action, slot, take, punch, bounce, freeze. Where a DAW term *is* the right
   word for the actual Live concept, use it precisely and don't overload it.
9. **Whenever feature functionality is added or changed, update the relevant wiki page
   in the same change.** The wiki is the user manual, so documentation is part of the
   feature being done rather than follow-up work. It lives in the separate
   `better-session-view.wiki.git` repository and requires its own commit and push.
10. **Every commit made by an agent must include a GitHub-compatible Codex co-author
    trailer.** Leave a blank line between the commit message and the trailer, and add it
    exactly as follows:

    ```text
    Co-authored-by: Codex <noreply@openai.com>
    ```

11. **A change to how a feature works updates that feature's topic doc in the same
    commit.** The docs are the reason this codebase is navigable; a doc that drifts is
    worse than one that never existed, because it's believed. If a change makes a doc
    wrong, fix the doc — don't append a note saying it's wrong.

12. **Every module is an `@openflow/*` package, and the dependency-free ones are npm
    workspaces — but `bridge/` and `visuals/` must never become workspaces.** Both keep a
    `node_modules` of their own on purpose: `visuals/tools/build-link.ts` repairs and
    compiles the Ableton Link native addon at the hard-coded path
    `visuals/node_modules/@ktamas77/abletonlink`, and `bridge/` is bundled for a Node
    runtime inside Max that is not ours to pick. Listing either in `workspaces` hoists its
    dependencies to the root, at which point `postinstall` fails with "abletonlink is not
    installed". The workspaces — `core`, `protocol`, `widgets`, `ui`, `chart`, `tools` —
    are safe to hoist only because none of them has dependencies of its own; they are
    workspaces so the packages resolve by name. Cross-module imports use the package
    specifier with the real TypeScript extension (`@openflow/core/derive.ts`), and so do
    imports inside a module (`./param.ts`, never `./param.js`).

## Before you claim something works

`lom.ts` has no automated coverage — it needs Live open with the device loaded, and
**it's the file to suspect first**. Everything else is checkable:

```sh
npm run typecheck    # all ten projects
npm test             # core/, widgets/param, set/lib and visuals/ unit tests
npm run build        # the device: bridge.js, lom.js, the .amxd. No front end.
npm run set          # the session manager, in its window
npm run visuals      # the VJ rig, its server and its window
```

If a change touches the LOM, say plainly that it's unverified rather than implying it
was tested. Prefer failure modes that are visible and harmless (an empty snapshot) over
ones that are silent, and add a fallback to the previously-working path where the new
one depends on an atom shape we haven't confirmed.
