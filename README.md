# better-session-view

[![ci](https://github.com/ryangavin/better-session-view/actions/workflows/ci.yml/badge.svg)](https://github.com/ryangavin/better-session-view/actions/workflows/ci.yml)

Better Session View is a Max for Live device for managing songs in large Session View
sets.

Live gives you clips and scenes, but it doesn't have a concept of a song. If your set has
a handful of scenes, that isn't a big deal. If it holds a whole show, you end up carrying
the missing structure yourself: which scenes belong together, what the names and colors
mean, and where one song ends and the next one begins.

That works until you need to rename everything, try a different color system, or change
the running order. Then a small decision becomes a lot of clicking, scrolling, and hoping
you didn't miss one.

Better Session View opens the set in a local browser grid and lets you work on that
structure in groups. It isn't a replacement for Session View. It's a way to do the
repetitive set-management parts without treating every clip and scene as a separate job.

## What it does

Right now, you can:

- Select a block of clips or a run of scenes and name them together using a pattern.
- Apply color rules across the set, including colors based on key or bpm, and preview the
  changes before writing them to Live.
- Group scenes into songs using the names already in the set.
- Move a song in the running order with all of its scenes as a single Live undo step.
- Fire clips and scenes from the grid while you're working, so you can hear what you're
  labelling.

## A few things worth knowing

- Live is still the source of truth. Better Session View works through Live's own API; it
  doesn't parse or rewrite the `.als` file.
- The scene names are how it works out which scenes belong to which song. There isn't a
  second copy of that mapping to keep in sync or accidentally leave behind.
- Everything runs on your computer. Nothing is downloaded at runtime, and the local
  server only listens on `127.0.0.1`.
- Reordering is the one operation to treat with some care. Live doesn't provide a way to
  move scenes, so Better Session View has to copy them to their new positions and remove
  the originals. It does that as one Live undo step, but saving first is still a good
  habit.

## Getting started

### What you need

- Ableton Live 12 with Max for Live
- The three files from the latest release

The current version was built against Ableton Live 12.4.3 Suite.

### Install

1. Download the latest zip from [Releases](../../releases) and unzip it somewhere
   permanent.
2. Keep `SessionBridge.amxd`, `bridge.js`, and `lom.js` together. The device loads the two
   JavaScript files from beside itself.
3. Drag `SessionBridge.amxd` onto any track. It's an inert audio passthrough, so the Master
   track is fine.
4. Wait for the device to read **No connections**, then click **Open Session Manager**.

That's it. The device starts the local server and opens the interface in your browser.

If you'd like the longer version, including what each file does, read
[Installing](https://github.com/ryangavin/better-session-view/wiki/Installing).

## Using Better Session View

The [user manual](https://github.com/ryangavin/better-session-view/wiki) covers the grid,
naming patterns, roles, color rules, the running order, and keyboard shortcuts. That's the
best place to start once the device is connected.

## Build from source

Only needed if you're working on it.

```sh
npm install                       # root + bridge/ deps
npm run build                     # everything, including the .amxd
```

Then in Live, drop `bridge/SessionBridge.amxd` onto any track and click **Open
Session Manager**. Full instructions: [`bridge/README.md`](bridge/README.md).

| script | does |
|---|---|
| `npm run build` | the UI, then a bundled bridge.js with that UI inlined, lom.js, and the device |
| `npm run dev` | three watchers in parallel; UI dev server on :5173 |
| `npm run dev:ui` | the UI dev server alone, against a device someone else is running |
| `npm run build:device` | the `.amxd` only — deliberately not watched |
| `npm test` | `core/` unit tests |
| `npm run typecheck` | all five projects |

A fresh clone needs `npm install && npm run build` before the device exists.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). It explains how the five modules fit
together, which README to read for each one, and the project rules that aren't obvious
from the code.

Planned work and the questions only a run against a real set can answer live in
[Issues](../../issues).

## License

MIT. See [LICENSE](LICENSE).
