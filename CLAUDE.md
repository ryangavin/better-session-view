# CLAUDE.md

Read [`README.md`](README.md) first — it's a table of contents. Then read the README
of the module you're about to touch. They exist because most of the constraints in
this project are non-obvious and expensive to rediscover.

| touching | read |
|---|---|
| anything involving Live | [`bridge/README.md`](bridge/README.md) — the LOM gotchas section especially |
| "does Live expose X?" | [`bridge/LOM.md`](bridge/LOM.md) — **look it up, don't guess.** Includes where the published docs are wrong |
| a wire message | [`protocol/README.md`](protocol/README.md) |
| domain logic | [`core/README.md`](core/README.md) |
| components, the client | [`ui/README.md`](ui/README.md) |
| the `.amxd` or the patcher | [`tools/README.md`](tools/README.md) |
| anything a user can see or press | [`docs/`](docs/README.md) — the user manual. Change it **in the same commit**; the module READMEs explain decisions, `docs/` tells someone how to use the thing |

## Rules

1. **`core/` imports no transport, no React, and nothing Live-specific.** It's the only
   code testable without Ableton running.
2. **`bridge/src/lom.ts` is the only file that touches the Live Object Model.**
3. **`lom.ts` cannot `import` anything** — it compiles with `module: "none"` so Max's
   `[v8]` finds its handlers as top-level globals. Protocol types come from the global
   `BSV` namespace. Adding an import breaks the device silently.
4. **The bridge protocol is coarse-grained** — one message per operation, never per
   property.
5. **Clip color is written as `color_index`**, never raw RGB.
6. **Nothing loads from a CDN.** This runs on stage.
7. **Don't name things with words that already mean something in a DAW.** `transport`
   is play/stop/record. Same trap: scene, clip, cue, bus, send, return, warp, quantize,
   follow action, slot, take, punch, bounce, freeze. Where a DAW term *is* the right
   word for the actual Live concept, use it precisely and don't overload it.

## Before you claim something works

`lom.ts` has no automated coverage — it needs Live open with the device loaded, and
**it's the file to suspect first**. Everything else is checkable:

```sh
npm run typecheck    # all five projects
npm test             # core/ unit tests
npm run build        # must succeed from a clean tree
```

If a change touches the LOM, say plainly that it's unverified rather than implying it
was tested. Prefer failure modes that are visible and harmless (an empty snapshot) over
ones that are silent, and add a fallback to the previously-working path where the new
one depends on an atom shape we haven't confirmed.
