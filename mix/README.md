# `@openflow/mix`

**mix[flow]** — a mix in, four parts out. Local stem separation with
[Demucs v4](https://github.com/adefossez/demucs): drums, bass, vocals and everything
else, from a file you already have, on a machine you already own.

```sh
npm run dev:mix      # working on it: the dev server and the window, one command
npm run mix          # the app, on what is built
npm run pack:mix     # a .app and a .dmg under release/mix/
```

**This is a skeleton.** The window opens, remembers where it was, serves its own build
over `mix://app`, and asks whether this machine could separate anything. It does not
separate anything yet.

**This is an index. Read the row you're changing.**

| touching | read |
|---|---|
| the window, packaging, or anything shared with the other apps | [`desktop/README.md`](../desktop/README.md) — there is no mix[flow] version of it, and that is the point |
| where the model comes from, and what a job will look like | [`docs/demucs.md`](docs/demucs.md) — `electron/demucs.ts` |

## What is actually here

| file | |
|---|---|
| `electron/main.ts` | 50 lines. Two of them are this app's: it asks about demucs, and it refuses to run twice |
| `electron/demucs.ts` | the readiness probe, and the open question behind it |
| `electron/preload.ts` | one function across the context bridge |
| `src/` | a window that says what it found |

Everything else — the frame it remembers, the scheme, the dev loop, the navigation
policy, the updater, the icon, the packaging — is `@openflow/desktop` and
`desktop/src/apps.ts`. This app was stood up to find out what that costs. It cost an
entry in the registry and the four files above.

## Naming

The app is about a mix, and `set/` already has a mixer. That collision is fine and
deliberate: **the words keep their ordinary meanings in both places**. A mixer is a
mixer, a mix is a mix, and nothing here is going to be renamed to avoid an overlap that
a musician would never notice. Where the two apps genuinely need the same control, the
answer is `@openflow/widgets`, which is already where a fader lives.
