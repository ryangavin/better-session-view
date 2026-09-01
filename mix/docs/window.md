# The window

`mix/src/`. The layout, where the design language comes from, and which controls are
`@openflow/widgets` rather than this app's.

A library on the left, the open track in the middle, what will be written on the right.
It came from an interactive mockup that had already read `set/src/shared.css`, so the
tokens were ours before the layout was — what follows is where it deviated and why.

## Three states, and never two

The middle is one of three things:

| | |
|---|---|
| **idle** | no stems on disk: the three models, what each trades away, and one button |
| **running** | a separation in flight, per source |
| **ready** | the lanes |

Not tabs. They are states of one track rather than views of it — you do not *choose* to
be separating — so `phase` is derived in `state.ts` from what is on disk and whether a
job is running, and nothing can select a state that is not true.

**The model cards say the trade, not the score.** A model's SDR figure is not something
you can act on standing at a laptop; "the piano bleeds badly" is. The numbers that are
there — sources, and speed against the clock — are the two that change what you do next,
and they come from the bench in `demucs/README.md`.

## The lane head is 168px, and that is the whole layout

Every lane's drawing starts at the same x, so a transient in the drums lines up with the
one in the bass. That is the only reason the head is a fixed width rather than a
fraction, and it is why the slice ruler carries a head of its own that draws nothing.

Six lanes at 46px is the density that lets you *see* an arrangement — the eight-bar
sections in `peaks.ts` are visible as blocks, and a fill in the last bar of eight is a
single darker column you can point at.

## What is a widget and what is not

| on screen | is |
|---|---|
| the model menu | `Select` |
| the snap group | `Segmented` |
| play, stop, cancel, export | `Button` |
| loop, mute, solo | `Toggle` |
| a stem's level | `Slider`, horizontal, with a length |
| per-source progress | `Meter` |
| the target tempo | `NumberField` |
| the waveform | **not a widget.** `components/Waveform.tsx` |

**The fader takes a `length`, not `layout="inside"`,** and the difference is not
cosmetic. `widgets/docs/catalogue.md` explains that an inside row deliberately has no
fill, because a parameter on a node row is a *where* and a fill invents a left-hand side
that means nothing. A fader is the case that doc carves out — its own length is what it
is saying — so it wants the fill, and the drag gearing that comes with a known length.

**`Waveform` is not in `widgets/` yet, and that is the rule rather than an oversight.**
The catalogue says a control moves into the library when the second caller arrives; that
is how `Meter` got there. This has one. When set[flow] draws a clip's audio it will have
two, and that file is what moves.

## Colour

The surfaces, the ramp, the accents, the radii and the 22px control height are
`@openflow/widgets/palette.css` — shared with set[flow] rather than copied, which is what
`DESIGN.md` now points at.

What is this app's own is six stem roles in `src/tokens.css`. Three of them *are* palette
accents, because the mockup had already picked them and they were already right:

| role | |
|---|---|
| `--stem-guitar` | `--green` |
| `--stem-piano` | `--blue` |
| `--stem-other` | `--detail`, because the residual is not a source so much as what is left |
| `--stem-vocals` | new |
| `--stem-drums` | new |
| `--stem-bass` | new |

The three new ones stay here rather than in the palette until something else needs them.
They are named for the source they paint and never for the hue, so a stem that changes
colour changes in one place and nothing else has to be read to find out why.

## What is invented

Everything except one thing. `mock.ts` is the library, `peaks.ts` is the audio, and both
are derived from an index rather than random so the picture is the same on every launch —
which is what makes a screenshot worth comparing against the last one.

The one real fact on screen is in the status bar: whether this machine could separate
anything, which comes over the context bridge from `electron/demucs.ts`. A window that
mocked its own toolchain check would be a window you could not trust about anything.

`state.ts` marks the single simulated behaviour — the job's progress — and everything
else in it is real state doing its real job. Replacing the simulation means replacing one
`useEffect`, because what feeds it is the shape the parser in
[`demucs.md`](demucs.md) will have to produce.

## Vocabulary

**A slice**, not a scene and not a cue. Both already mean something exact in Live: a
scene is a row you fire, a cue is a locator in the Arrangement, and this is neither — it
is a cut this app made in a file it separated. The word has to survive contact with
set[flow], where the other two are load-bearing.

**A mixer is a mixer.** set[flow] has one and so does this, and neither is renamed to
avoid the overlap — the words keep their ordinary meanings in both places. Where the two
genuinely need the same control the answer is `@openflow/widgets`, which is already where
a fader lives.
