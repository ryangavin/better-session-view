# Playing things

## ⌘ is the "talk to Live" key

**Unmodified input never makes a sound.** Plain clicks and plain arrow keys select, fold
and move. Hold **⌘** and Live responds.

On Windows and Linux it's **Ctrl**. Never both — Ctrl-click on macOS is the system
context-menu gesture, and it would fire a clip every time someone reached for a
right-click.

This is the rule that makes the grid safe to click around in while you're labelling a
set. You can select four hundred clips, sweep a block across a chorus, fold half the
songs, and nothing plays.

| | plain — organizing | with ⌘ |
|---|---|---|
| **clip cell** | click selects · ⇧ extends a block · ⌥ toggles | ⌘-click **fires the clip** |
| **scene name** | click selects the row · ⇧ extends over scenes | ⌘-click **fires the scene** |
| **song header** | click folds · the title selects · drag reorders | — |
| **track header** | click a group to collapse | ⌘-click **stops that track** |
| **arrow keys** | `↑ ↓ ← →` move the active cell | `⌘↑ ⌘↓` **move and fire** · `⌘⏎` fire |

Two deliberate exceptions:

- **The ▶ button in the scene gutter fires on a plain click.** Firing is that button's
  only job, and launching a scene is the primary gesture — it has to be visible rather
  than a modifier away.
- **⌥, not ⌘, adds to a selection.** That inverts the usual macOS idiom, because ⌘ is
  spoken for above and launching earns the scarcer key.

## The sweep

**`⌘↓`** is one keystroke for "next scene, and let me hear it". Hold ⌘ and walk down the
set, and every scene fires as you land on it.

That deliberately replaces an audition *mode*. A sticky toggle you can forget you're in
is worse than a modifier you're holding.

`⌘↓` walks the rows that are **on screen**, so it will not descend into a folded song
and fire scenes you can't see.

## Stopping, and the song

The header carries play, stop, and stop-clips:

| | |
|---|---|
| **Space** | start or stop the song |
| **Esc** | stop all clips, but keep the song rolling |
| ⌘-click a track header | stop that track |

Esc sparing the song is the point of having both. Stopping clips while the transport
keeps running is what you want mid-set; stopping everything is what Space is for.

Playback controls are disabled until Live is actually connected — if they're greyed out,
check the status pills in the header and see [Troubleshooting](troubleshooting.md).

## Hearing what you're labelling

The reason launching exists here at all is that naming a scene you can't hear is
guesswork. The pass this is built for:

1. Click a scene name — the row selects, the rail opens.
2. `⌘⏎` or ⌘-click to hear it.
3. Name it, tag its role, color it.
4. `⌘↓` to the next one.

Everything in that loop except step 2 is silent.
