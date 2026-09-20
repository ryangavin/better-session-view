# better-session-view

The repository open[flow] grew up in. The code has moved to the
[openflowfm](https://github.com/openflowfm) organisation, one repo per module:

| repo | what it is |
|---|---|
| [bridge](https://github.com/openflowfm/bridge) | **SessionBridge**, the Max for Live device — the only code that talks to Live, and where releases and nightlies are built |
| [set](https://github.com/openflowfm/set) | **set[flow]**, the session manager |
| [visuals](https://github.com/openflowfm/visuals) | **visual[flow]**, the VJ rig |
| [mix](https://github.com/openflowfm/mix) | **mix[flow]**, stem separation |
| [chart](https://github.com/openflowfm/chart) | **chart[flow]**, what the band reads off a phone |
| [core](https://github.com/openflowfm/core) | the domain logic every one of those shares |
| [protocol](https://github.com/openflowfm/protocol) | the wire types between the device and its clients |
| [widgets](https://github.com/openflowfm/widgets) | the DAW controls and the design language |
| [desktop](https://github.com/openflowfm/desktop) | the Electron main process the apps share |
| [audio](https://github.com/openflowfm/audio) | **audio[flow]**, the headless rendering library, paused |
| [web](https://github.com/openflowfm/web) | the website |

What is still here:

- [`demucs/`](demucs/README.md) — the stem-separation research spike that settled how
  mix[flow]'s engine had to be built. A record, not a runtime; mix[flow]'s
  [`docs/demucs.md`](https://github.com/openflowfm/mix/blob/main/docs/demucs.md) cites it.
- The [wiki](https://github.com/ryangavin/better-session-view/wiki) — the user manual for
  the device and set[flow]. Still edited here, still linked from every release.
- The [releases](https://github.com/ryangavin/better-session-view/releases) up to and
  including the last one cut from this tree.
