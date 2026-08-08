# AGENTS.md

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first — it's the table of contents. Then read
the README of the module you're about to touch. They exist because most of the constraints
in this project are non-obvious and expensive to rediscover.

[`README.md`](README.md) is for users, not for you: what the app is, install, build. Keep
it that way — architecture and rules go in `CONTRIBUTING.md`, planned work goes in
[Issues](../../issues).

| touching | read |
|---|---|
| anything involving Live | [`bridge/README.md`](bridge/README.md) — the LOM gotchas section especially |
| "does Live expose X?" | [`bridge/LOM.md`](bridge/LOM.md) — **look it up, don't guess.** Includes where the published docs are wrong |
| a wire message | [`protocol/README.md`](protocol/README.md) |
| domain logic | [`core/README.md`](core/README.md) |
| components, the client | [`ui/README.md`](ui/README.md) |
| the `.amxd` or the patcher | [`tools/README.md`](tools/README.md) |
| anything a user can see or press | the [wiki](https://github.com/ryangavin/better-session-view/wiki) — the user manual, and a **separate repo** (`…wiki.git`), so updating it is a second clone and a second push. These READMEs explain decisions; the wiki tells someone how to use the thing |

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
8. **Whenever feature functionality is added or changed, update the relevant wiki page
   in the same change.** The wiki is the user manual, so documentation is part of the
   feature being done rather than follow-up work. It lives in the separate
   `better-session-view.wiki.git` repository and requires its own commit and push.
9. **Every commit made by an agent must include a GitHub-compatible Codex co-author
   trailer.** Leave a blank line between the commit message and the trailer, and add it
   exactly as follows:

   ```text
   Co-authored-by: Codex <199175422+chatgpt-codex-connector[bot]@users.noreply.github.com>
   ```

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
