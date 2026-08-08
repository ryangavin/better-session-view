# better-session-view

[![ci](https://github.com/ryangavin/better-session-view/actions/workflows/ci.yml/badge.svg)](https://github.com/ryangavin/better-session-view/actions/workflows/ci.yml)

**Ableton has no idea what a song is.**

Session View gives you clips and scenes and stops there. If your set is one song, that's
fine. If your set is a hundred songs — a covers band's whole book, a wedding repertoire,
a night that has to run in a particular order — then *you* are the one holding the
structure in your head. Which scenes belong to which song. Which one is the intro and
which one is the last chorus. What the colors are supposed to mean. Live will happily let
you name scene 412 anything at all; it will never mention that it doesn't match the other
847.

So it gets done by hand. Click a scene, type a name, click a clip, pick a color, scroll,
repeat. Change your mind about how names should be spelled and there goes the afternoon.
Want a song to happen earlier in the night and you're dragging scenes one at a time,
hoping you didn't leave one behind.

This is the layer Live is missing. A real app with a real grid that reads your set out of
Live and writes back into it — so naming, coloring, and running order are things you
decide once and apply to everything, instead of conventions that live in your head and get
re-typed per selection.

Live stays the audio engine and the source of truth. Nothing here parses `.als` files,
ever.

## What it does

- **Names in bulk.** Select a block of clips or a run of scenes and write them all from
  one pattern, rather than one at a time.
- **Colors from a rule.** Color every song in the set at once — by key, by bpm, rainbow or
  random — with a preview of the exact write before anything happens.
- **Reads the songs back out.** The names *are* the record, so the app re-derives which
  scene belongs to which song every time it looks at your set. Nothing to keep in sync,
  nothing to lose, and the `.als` on your gig laptop still describes itself.
- **Moves a whole song.** Drag a song in the running order and every scene it owns follows
  — as one entry in Live's undo history, not eighty.
- **Plays what you're looking at.** Fire a clip or a scene from the grid so you can hear
  the thing you're labelling.

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
