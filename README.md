# open[flow]

[![ci](https://github.com/ryangavin/better-session-view/actions/workflows/ci.yml/badge.svg)](https://github.com/ryangavin/better-session-view/actions/workflows/ci.yml)

open[flow] is a Max for Live device for managing songs in large Session View
sets.

Live gives you clips and scenes, but it doesn't have a concept of a song. If your set has
a handful of scenes, that isn't a big deal. If it holds a whole show, you end up carrying
the missing structure yourself: which scenes belong together, what the names and colors
mean, and where one song ends and the next one begins.

That works until you need to rename everything, try a different color system, or change
the running order. Then a small decision becomes a lot of clicking, scrolling, and hoping
you didn't miss one.

open[flow] opens the set in a local browser grid and lets you work on that
structure in groups. It isn't a replacement for Session View. It's a way to do the
repetitive set-management parts without treating every clip and scene as a separate job.

## What it does

- **Name clips and scenes together.** Select a block in the grid and name the whole
  selection using a pattern.
- **Apply colors consistently.** Set up rules based on things like key or bpm, preview
  the result, and then write it across the set.
- **Work with songs, not just scenes.** open[flow] groups related scenes from
  their names, so you can manage the song as a whole.
- **Change the running order.** Drag a song to a new position and all of its scenes move
  with it as a single Live undo step.
- **Listen while you work.** Fire clips and scenes from the browser grid without jumping
  back and forth to Live.

## How it works

open[flow] doesn't create another project file or database to describe your
set. The relationship between songs and scenes lives in the set itself, using things Live
already understands: names, colors, and device data. Your `.als` remains the complete
record of the show.

That also means scene names carry more meaning than they normally would. They're the
labels you see in Live, but they're also how open[flow] works out which scenes
belong to which song. If a scene name changes in a way that no longer follows your naming
pattern, open[flow] may understand it differently the next time it reads the
set.

If you're using open[flow] to manage a set, it's best to use it as the main place
to relabel songs and change their structure. You can still edit anything you want in Live,
and moving clips around is fine. Just be aware that changing the names or structure that
describe a song can affect how open[flow] groups it.

The device talks directly to the set you have open in Live; it doesn't parse or rewrite
the `.als` file. Everything runs on your computer, and nothing is downloaded at runtime.

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
4. Wait for the device to read **Connected to Live**.
5. Run `npm run set` to open the session manager — the **set[flow]** dot on the device
   lights when it attaches.

The device bridges Live and nothing else; the interface is an app of its own.

If you'd like the longer version, including what each file does, read
[Installing](https://github.com/ryangavin/better-session-view/wiki/Installing).

## Using open[flow]

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
| `npm run build` | a bundled bridge.js, lom.js, and the device |
| `npm run set` | the session manager, set[flow] — builds it and opens the window |
| `npm run visuals` | the VJ rig, visual[flow] — its server and its window |
| `npm run pack` | both apps as a `.app` and a `.dmg` under `release/` |
| `npm run install:apps` | copies those into `/Applications` |
| `npm run install:device` | the device into the Ableton User Library, as `SessionBridge-qa` |
| `npm run qa` | all of the above at once — built and installed, ready to try |
| `npm run dev` | every watcher and dev server at once — set[flow] on :5173, the widget bench on :5273 |
| `npm run dev:set` | the set[flow] dev server alone, against a device someone else is running |
| `npm run dev:set-app` | the set[flow] window on a running dev server — hot reload, in the real app |
| `npm run dev:visuals-app` | the same for visual[flow] |
| `npm run dev:widgets` | the widget bench alone — no device needed |
| `npm run build:device` | the `.amxd` only — deliberately not watched |
| `npm test` | pure `core/` and `set/lib` unit tests |
| `npm run typecheck` | all ten projects |

A fresh clone needs `npm install && npm run build` before the device exists.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). It explains how the eight modules fit
together, which README to read for each one, and the project rules that aren't obvious
from the code.

Planned work and the questions only a run against a real set can answer live in
[Issues](../../issues).

## How this project was built

I've been a professional software engineer for nearly two decades. I've also used Ableton
since Live 7, and I regularly use it on stage with my band,
[Funkadelic Astronaut](https://www.youtube.com/@FunkadelicAstronaut). This project comes
from both of those parts of my life.

Nearly all of the code in open[flow] was written with Claude and Codex. It was
not vibe coded. I directed the work closely, made the architecture decisions, and
thoroughly reviewed the final code myself.

For this project, AI was effectively a very fast autocomplete for code I could have
written by hand. It made the implementation fast enough for open[flow] to exist,
but the product decisions, engineering judgment, and responsibility for the result are
mine.

## License

MIT. See [LICENSE](LICENSE).
