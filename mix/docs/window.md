# The window

`mix/src/`. The layout, where the design language comes from, and which controls are
`@openflow/widgets` rather than this app's.

A library on the left and the open track to the right of it, under one header. It came
from an interactive mockup that had already read `set/src/shared.css`, so the tokens were
ours before the layout was — what follows is where it deviated and why.

**There is no right rail and no status bar**, and neither is a deletion so much as three
things finding better homes. The track's name is in the header, where a window says what
is open. The mix summary is in the band above the lanes, beside the buttons that change
it. The slice list is in the export dialog, which is the moment anyone actually names a
slice — a list that sat open all session was eight rows of chrome competing with the
lanes for a job nobody was doing yet. Two columns instead of three buys the lanes nearly
three hundred pixels, which is what they are for.

## The header

    [!] mix[flow] │ Title · Artist  ⋯⋯  [▶ ■ ↻] 1.1.1 │ snap ⋯ Auto-warp │ Export

Four groups, in the order they are read: what this is, what you are looking at, what you
can do to it, where it goes. Three departures from the mockup, each one a thing the
mockup was fighting:

**The clock sits with the transport.** Between the wordmark and the buttons it read as
part of the brand, and the one control it describes was two groups away.

**Playback and the grid are separated by a rule, and both disappear unless the track has
stems.** Every control was the same 22px outlined pill, so nothing said that play and
snap belong to different subsystems — and in the two states where there is nothing to
play they were all still there, dead. An idle header is a wordmark, a title and a
disabled Export, which is the honest amount.

**Nothing wraps.** The mockup is `flex-wrap` over a `min-height`, so a narrow window
silently becomes two rows of chrome. Here the title is the only thing that gives, and it
gives by ellipsis.

One smaller thing worth keeping: `snap` is a leading label rather than a `Widget`
caption. `Widget` puts captions *above*, which in a 34px bar makes that one control two
rows tall in a line of things one row tall — and a ragged baseline is most of what
"messy header" means.

**The demucs probe is silent when it passes.** A green light that is always on is a
thing you stop seeing; a red chip that appears is not. So there is no indicator at all
until there is something wrong, and then it is a word.

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

## The lane head is 204px, and that is the whole layout

Every row's drawing starts at the same x, so a transient in the drums lines up with the
one in the bass. That is the only reason the head is a fixed width rather than a
fraction, and it is why the band above the lanes carries a head of its own — it holds
the mix summary and the two buttons that change it, and it exists as much to reserve
that column as to say anything.

Six lanes at 46px is the density that lets you *see* an arrangement — a breakdown is a
block where the drums stop, and a fill is a darker column you can point at. Clicking any
lane moves the head there: a waveform is what you are looking at when you decide where to
listen from, and reaching back up to a strip at the top to act on it is the sort of gap
that makes a window feel like a diagram of a DAW rather than one.

## The grid, and the two ways of setting it

The band above the lanes is two strips over one timeline. The **slice ruler** is what you
navigate by, and the **warp lane** underneath is where the grid meets the audio: bar
lines are the grid's claim, ticks are what the audio actually did, and green ticks are
the ones detection believes start a bar. When the green ones sit on the bright lines the
grid is right; when they walk off them it is not. A tempo a fraction out does not look
wrong at bar 2 and is unmistakable by bar 60, which is why this is full width rather than
a detail view.

The ticks come off the same peaks the lanes draw, which is not a shortcut — it is how
detection works, and it means a tick always lines up with the transient below it. A warp
lane that disagreed with the waveforms would be worse than no warp lane, because it would
look like the grid was wrong. They are taken from the **drums** where there are drums,
which is most of the argument for fitting a grid after separating rather than before.

Their bar positions are the grid's claim rather than a property of the audio, so changing
the tempo walks them off the lines or onto them. That is the lane doing its job.

**Auto-warp** re-runs detection and pins both ends; a grid pinned at both ends cannot
drift in the middle by more than the tempo is actually wrong by. **Manual** is two clicks
far apart and then a nudge, and it gets a bar of its own at the top of the lanes because
in that mode a click in a lane means something else. A mode you cannot see is a mode that
surprises you.

Bar numbers appear every eight bars, and only when eight bars is wide enough to hold one.
Sixteen numbers in a 24px strip is a grey band, and the point of a number is to be
countable from.

## What is a widget and what is not

| on screen | is |
|---|---|
| the model menu | `Select` |
| the snap group | `Segmented` |
| play, stop, cancel, export | `Button` |
| loop, mute, solo | `Toggle` |
| a stem's level | `Slider`, horizontal, with a length |
| per-source progress | `Meter` |
| the target tempo | `NumberField`, unfilled |
| the waveform | **not a widget.** `components/Waveform.tsx` |

**The fader takes a `length`, not `layout="inside"`,** and the difference is not
cosmetic. `widgets/docs/catalogue.md` explains that an inside row deliberately has no
fill, because a parameter on a node row is a *where* and a fill invents a left-hand side
that means nothing. A fader is the case that doc carves out — its own length is what it
is saying — so it wants the fill, and the drag gearing that comes with a known length.

**The tempo field is `showFill={false}`,** for the same reason the fader is not an
inside row. `NumberField` draws the value as a bar behind the text by default, which is
right for a range that means *how much*. A tempo's does not: 124 of 60-to-200 is 46% of
nothing, and it is the loudest thing in the row while carrying the least.

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

**Two things, and neither is the audio any more.**

The library is a folder on disk read through `electron/library.ts` —
[`library.md`](library.md) — so the rail, the counts and the badge strips are real. The
separation is a child process, and the progress bar is what it reports —
[`stems.md`](stems.md). The waveforms are the stems that process wrote, decoded, and the
transport plays those same buffers — [`playback.md`](playback.md) — so the picture and
the sound cannot disagree, which they could the moment they came from two places.

**The slices are invented**: eight evenly spaced spans with names, because nothing reads
the audio to place them. They are a ruler rather than a reading of the song, and
`mock.ts` says so where they are made.

**The tempo is not detected.** `bpmAuto` is a flag with nothing behind it and the grid is
120 until somebody sets it by hand. The window is honest about this in the only way that
matters — a track imported today has no tempo, no key and no length until something
measures one, and all three are drawn as unknown rather than as zero. The onsets
detection would be fitted to are already computed and already on screen.

The other real fact is in the header: whether this machine could separate anything, which
comes over the context bridge from `electron/demucs.ts`. A window that mocked its own
toolchain check would be a window you could not trust about anything.

## Vocabulary

**A slice**, not a scene and not a cue — including in the export dialog, where the
mockup still called the column *cue*. Both already mean something exact in Live: a
scene is a row you fire, a cue is a locator in the Arrangement, and this is neither — it
is a cut this app made in a file it separated. The word has to survive contact with
set[flow], where the other two are load-bearing.

**A mixer is a mixer.** set[flow] has one and so does this, and neither is renamed to
avoid the overlap — the words keep their ordinary meanings in both places. Where the two
genuinely need the same control the answer is `@openflow/widgets`, which is already where
a fader lives.
