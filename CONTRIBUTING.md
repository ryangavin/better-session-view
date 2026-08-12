# Contributing

Start with [`README.md`](README.md) for what the app is and how to build it. This file is
the map for changing it: how the pieces fit, which README to read before touching what,
the rules that aren't negotiable, and the thinking behind where it's headed.

Most of the constraints here are non-obvious and expensive to rediscover. The module
READMEs exist for that reason — read the one covering what you're about to change.

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

## The rules that aren't negotiable

1. **`core/` imports no transport, no React, and nothing Live-specific.** It's what
   makes the domain logic testable without Live running, and what keeps a different
   backend possible later.
2. **`bridge/src/lom.ts` is the only file that touches the Live Object Model.** Everything
   else talks to it through the protocol.
3. **`lom.ts` cannot `import` anything.** It compiles with `module: "none"` so Max's `[v8]`
   finds its handlers as top-level globals; protocol types come from the global `BSV`
   namespace. Adding an import breaks the device silently.
4. **The bridge protocol is coarse-grained** — one message per *operation*, never per
   property. A full set is tens of thousands of LOM reads.
5. **Clip color is written as `color_index`**, never raw RGB.
6. **Nothing loads from a CDN.** This eventually runs on stage.
7. **Don't name things with words that already mean something in a DAW.** `transport` is
   play/stop/record. Same trap: scene, clip, cue, bus, send, return, warp, quantize,
   follow action, slot, take, punch, bounce, freeze. Where a DAW term *is* the right word
   for the actual Live concept, use it precisely and don't overload it.

## Before you claim something works

`lom.ts` has no automated coverage — it needs Live open with the device loaded, and
**it's the file to suspect first**. Everything else is checkable:

```sh
npm run typecheck    # all five projects
npm test             # pure core/ and ui/lib unit tests
npm run build        # must succeed from a clean tree
```

If a change touches the LOM, say plainly that it's unverified rather than implying it was
tested. Prefer failure modes that are visible and harmless (an empty snapshot) over ones
that are silent, and add a fallback to the previously-working path where the new one
depends on an atom shape we haven't confirmed.

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

## The design this is built toward

MVP was set management: bulk naming and coloring, with clip and scene launching so you can
hear what you're labelling. That works — but every convention it applies still lives in
someone's head and gets re-typed per selection.

The direction is to define the conventions **outside** the current state of the set, map
the set against them once, and thereafter re-derive the mapping by reversing the naming
convention.

```
library (songs)              ─┐
scheme  (patterns, rules)    ─┼─→ desired state ──┐
mapping (scene → song, role) ─┘                   ├→ diff → apply
snapshot (what Live holds) ───────────────────────┘
                 ↑                           │
                 └──── re-derived by reversing ────┘
                       the naming convention
```

The mapping needs a human once. After the first apply the names **are** the mapping, so
they read back on every later snapshot — no stable ids anywhere, nothing to lose, and a
`.als` on the gig laptop stays fully self-describing.

### Three layers, and what each owns

| | lives | authoritative for |
|---|---|---|
| **Library** | one global file, outlives any `.als` | what a song *is* — bpm, key |
| **Scheme** | one global file | patterns and rules — how a name is spelled, what color a clip gets |
| **Mapping** | **in the set**, in scene names + device state | which scene is which song and role, plus naming defaults and color configuration |

### The decisions behind it

**Mapping is derived; facts are declared.** Which scene belongs to which song is always
read out of the set. What a song *is* belongs to the library. A song is seeded from the
set the first time it's seen; after that a set that disagrees is drift. Without that split
the scheme is a suggestion rather than a convention, and lint has nothing to say.

**The library is global and only grows.** It outlives any one `.als` — you have a library
of songs and a given set contains some of them. Derivation unions into it. Role colors
are different: they describe one set and live in that set's bridge-device state, alongside
the set's default artist.

**A song is a label, not a range** — whatever scenes carry its name, wherever they sit. A
reprise sixty scenes later is the same song for free. Boundaries are computed; a song in
two blocks is a lint line, not an error.

**Song identity is the name text, and a rename is atomic** — renaming in the library
rewrites its scenes in the same operation, because at that moment we still know which
scenes were attached.

**Patterns are configurable but must be reversible.** At most one free-text token unless a
non-whitespace literal separates them. The rules, and why ambiguity splits into fatal and
resolvable, are in [`core/README.md`](core/README.md).

The convention this writes today is `[ROLE] @{key} {SONG} - {ARTIST} {TAG}` — `[CHORUS] @Bm
NIGHTFALL - THE AVIATORS {COVER}`. Role first so a column of scene names reads as
structure; `@` opens the key because after it a letter can only be a key. **A convention
change can't be a clean break**, since the mapping *is* the names — so derivation reads more
than one pattern and a set converts scene by scene as it's renamed.

**The artist is a fact, not identity.** `songKey` is still the song name alone, so one
title with two artists is drift the songs list reports rather than two songs. It is also
the only place two free-text fields meet in one name, which is why `" - "` is load-bearing
and why the parsing convention is the next thing that should become configuration rather
than a constant.

**bpm is not like the other tokens.** It's the one fact with a home in Live —
`Scene.tempo` — and writing it changes how the set plays. See
[`bridge/README.md`](bridge/README.md) for the `tempo_enabled` ordering.

**Clip color is layered rules, first match wins**, so you can reason about why a clip is
the color it is, and lint can report what matched nothing.

**Scene reordering is the one write that can damage a set.** The LOM has no scene-move API
— verified in both sources, see [`bridge/LOM.md`](bridge/LOM.md) — so a move is
build-then-delete, made precise rather than wholesale by `ClipSlot.duplicate_clip_to`. It
is one plan and one message however many songs moved, which is what keeps it a single
entry in Live's history. What it costs and what guards it is under *Reordering scenes* in
[`bridge/README.md`](bridge/README.md).

## Planned work

Roadmap items and the questions only a run against a real set can answer are tracked in
[Issues](../../issues), not here. A doc goes stale; an issue gets closed.
