# better-session-view

[![ci](https://github.com/ryangavin/better-session-view/actions/workflows/ci.yml/badge.svg)](https://github.com/ryangavin/better-session-view/actions/workflows/ci.yml)

If you keep a whole show in one Ableton set, Session View gets hard to manage pretty
quickly. Live knows about clips and scenes, but it doesn't know that a group of scenes
makes up a song. It also doesn't know what your scene names or colors are meant to say.

That leaves you to maintain that structure yourself. You have to remember where each song
starts and ends, keep the names and colors consistent, and move every scene individually
when the running order changes. For a large set, a small edit can turn into a lot of
clicking and scrolling.

Better Session View is a Max for Live device with a local browser interface for doing
that work across the whole set. It reads the open set from Live and lets you name, color,
and arrange related clips and scenes together.

Live is still the source of truth. Better Session View talks to the set you have open; it
doesn't read or rewrite the `.als` file.

## What it does

- Select a block of clips or a run of scenes and name them together using a pattern.
- Apply color rules across the set, including colors based on key or bpm, and preview the
  changes before writing them to Live.
- Work out which scenes belong to each song from the scene names already in the set. There
  isn't a second copy of that information to keep in sync.
- Move a song in the running order with all of its scenes as a single Live undo step.
- Fire clips and scenes from the grid while you're working, so you can hear what you're
  labelling.

> ### 📖 [**User manual →**](https://github.com/ryangavin/better-session-view/wiki)
>
> Installing, reading the grid, naming, roles, color, the running order, and the
> keyboard reference.

## Install

Download the latest zip from [Releases](../../releases) and unzip it somewhere
permanent. **Keep the three files together** — the device loads `bridge.js` and `lom.js`
by name from beside itself.

Drag `SessionBridge.amxd` onto any track (it's an inert audio passthrough; the Master
track is fine), wait for the device to read **No connections**, then click **Open
Session Manager**.

Needs Ableton Live 12 with Max for Live — built against 12.4.3 Suite. Nothing is
downloaded at runtime and the server binds `127.0.0.1` only. Full instructions:
[Installing](https://github.com/ryangavin/better-session-view/wiki/Installing).

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

[**CONTRIBUTING.md**](CONTRIBUTING.md) is the map — architecture, the five modules and
which README to read for each, and the handful of rules that aren't negotiable. Read it
before your first change; most of the constraints in this project are non-obvious and
expensive to rediscover.

Planned work and the questions only a run against a real set can answer live in
[Issues](../../issues).

## License

MIT. See [LICENSE](LICENSE).
