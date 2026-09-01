# `@openflow/mix`

**mix[flow]** — a mix in, four parts out. Local stem separation with
[Demucs v4](https://github.com/adefossez/demucs): drums, bass, vocals and everything
else, from a file you already have, on a machine you already own.

```sh
npm run dev:mix      # working on it: the dev server and the window, one command
npm run mix          # the app, on what is built
npm run pack:mix     # a .app and a .dmg under release/mix/
```

**The library is real; the audio is not.** Tracks live in a folder you pick, copied there
on import, indexed by a manifest that makes the folder portable —
[`docs/library.md`](docs/library.md). The waveforms are invented and the separation is a
timer standing in for a parser. The library, the waveforms and the slices are invented in
`src/mock.ts` and `src/peaks.ts`, and nothing separates anything yet — the one honest fact
on screen is the demucs probe in the status bar.

**This is an index. Read the row you're changing.**

| touching | read |
|---|---|
| the library folder, the manifest, or importing | [`docs/library.md`](docs/library.md) — `electron/manifest.ts`, `electron/library.ts` |
| the layout, the colours, or which control is a widget | [`docs/window.md`](docs/window.md) — `src/` |
| where the model comes from, and what a job will look like | [`docs/demucs.md`](docs/demucs.md) — `electron/demucs.ts` |
| the window, packaging, or anything shared with the other apps | [`desktop/README.md`](../desktop/README.md) — there is no mix[flow] version of it, and that is the point |

## What is actually here

| file | |
|---|---|
| `electron/main.ts` | 50 lines. Two of them are this app's: it asks about demucs, and it refuses to run twice |
| `electron/demucs.ts` | the readiness probe, and the open question behind it |
| `electron/manifest.ts` | the library on disk. No electron import, so it is testable — and tested |
| `electron/library.ts` | the dialogs, and where the folder is right now |
| `electron/preload.ts` | one function across the context bridge |
| `src/mock.ts`, `src/peaks.ts` | the sources and models, and the invented audio |
| `src/state.ts` | everything the window knows, in one hook |
| `src/components/` | the header, the library, the three states, the lanes and the warp lane |

Everything else — the frame it remembers, the scheme, the dev loop, the navigation
policy, the updater, the icon, the packaging — is `@openflow/desktop` and
`desktop/src/apps.ts`. This app was stood up to find out what that costs. It cost an
entry in the registry and the four files above.

## Naming

The app is about a mix, and `set/` already has a mixer. That collision is fine and
deliberate: **the words keep their ordinary meanings in both places**. A mixer is a
mixer, a mix is a mix, and nothing here is renamed to avoid an overlap a musician would
never notice. Where the two apps genuinely need the same control, the answer is
`@openflow/widgets`, which is already where a fader lives.

The one word that *was* changed is **slice** — the mockup called it a scene in the code
and a cue in the header, and both already mean something exact in Live.
[`docs/window.md`](docs/window.md) has the reasoning.
