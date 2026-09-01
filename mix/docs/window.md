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

A lane at 46px is the density that lets you *see* an arrangement — a breakdown is a
block where the drums stop, and a fill is a darker column you can point at. Clicking any
lane moves the head there: a waveform is what you are looking at when you decide where to
listen from, and reaching back up to a strip at the top to act on it is the sort of gap
that makes a window feel like a diagram of a DAW rather than one.

**46px is the floor, not the height.** The lanes share whatever the window has, so a
four-source separation gets the room a six-source one would have used rather than four
rows and a hole underneath them. `Waveform` takes no height when the lanes draw it and
measures the box it was given instead — how tall a stem is depends on how many stems
there are and how tall the window is, which is a question CSS answers better than a
component can. Once the lanes reach 46px the list scrolls rather than going below it.

## There is a lane per stem the model made, and no others

A four-source model folds guitar and piano back into Other. The lanes used to draw all
six regardless, with the two it did not have greyed out and captioned *folded into Other
by demucs ft · 4* — which was honest, and was still two rows of a screen spent on a
control nobody can use, on every track, for a fact that does not change while you are
looking at it.

A lane is on screen the moment the manifest says the model made that stem, which is
before any audio has been read — so opening a track lays out the right rows immediately
and fills the drawings in as each stem decodes, rather than showing captions and swapping
six of them for canvases a second later. The outgoing track's drawings are dropped when
the new one is chosen, because a second of the last song under this song's name is worse
than an empty lane. A lane takes its samples only once its own peaks are there:
`engine.ts` still holds the *previous* track's buffers until the new set is complete, and
a lane that reached for them would draw the song you just left.

**The fact belongs to the model, and the model is already on screen** — named on this
band, and described at the point where somebody chooses it, which is the moment the trade
is actually being made. Wanting guitar on its own means separating again, and the button
for that is on the same band.

The one place a *missing* stem is still worth drawing is the library's badge strip, and
for the opposite reason: there the question is which of a hundred tracks have one, so a
gap in a fixed six-cell strip is a shape you read without reading.

`Reset` counts against the stems the song has rather than against all six, so a level
left behind by an earlier separation with a six-source model cannot arm a button against
something nobody can see.

## Zoom, and why the canvases do not grow

The lanes draw the whole track by default, which is right for finding a breakdown and
useless for finding a downbeat: four minutes across nine hundred pixels is a quarter of a
second per pixel, so a kick and the snare after it are the same column.

**⇧-scroll or ⌘-scroll over the lanes zooms** — both, because neither is obviously the
one, and `ctrl` comes along with them for the platforms where it is the modifier and for
the trackpad pinch that arrives wearing it. A sideways scroll pans, by the screenful, so
the gesture means the same thing at every depth. A plain vertical scroll still scrolls
the lanes, because a window that steals the scroll wheel is a window you cannot scroll.

Three things make it feel like a timeline rather than a picture being resized:

**The zoom is anchored on the pointer.** What is under it stays under it. Zooming about
the centre is why so many timelines need a pan after every zoom.

**The playhead is followed by the screenful, not by the pixel.** Rolling continuously
under a stationary head makes the picture unreadable, and the point of zooming in was to
look at something. It pages when the head leaves the view, and only while something is
playing — a view somebody has just set by hand is not dragged off by a stopped head.

**The canvases stay the width they are on screen** and draw the slice they were asked
for. The obvious implementation — a span as wide as the zoom, scrolled — is six canvases
of a hundred million pixels, which no browser will lay out and none of which anybody is
looking at. `zoom.ts` holds the two numbers everything on the timeline maps through: how
far in, and where the left edge is. None of it is written down; where you had scrolled to
is not something a window owes you back after a reload.

## It goes all the way to the samples

The bottom of the zoom is the point past which magnifying stops revealing, and for audio
that point is exact: **there is nothing under a sample.** So that is where it stops —
sixteen samples across a lane, a hand's width apart, drawn as points with the line
between them. That is the sample editor's view, where a point is a value you could nudge
rather than a dot in a line, and it is the last honest stop: past it the points keep
separating and no more audio arrives, which is the same lie a magnified peak drawing
tells at the other end.

That makes the ceiling a property of the *track* rather than a number of times, which is
why `limitOf` takes seconds and a rate. A limit written as a multiple would mean
something different for every song: sixteen times a four-minute track is fifteen seconds,
and sixteen times a two-bar loop is a bar. What is fixed is the view at the bottom of it.
A four-minute track is most of a million times deep, so the wheel curve is set by the
range it has to cross — a gentler one is a dozen swipes to reach a bottom nobody would
find.

## And out past the song

The other end goes past the track filling the lane, to a quarter of it. Fitting exactly
is the obvious floor and it is the wrong one: a shape is easier to judge with air around
it than jammed against both walls, and a song that ends on the last pixel gives no way to
see that it ends.

Out there the arithmetic changes hands. Zoomed in, the window slides along a track wider
than itself; zoomed out, the *track* slides inside a window wider than it, between flush
left and flush right. Both are one clamp — `1 - 1/zoom` is where the left edge sits when
the right edges line up, and which side of zero that falls on is the whole difference. It
also means the song cannot be scrolled off screen out there, which matters because there
would be nothing else to find it by.

**What is outside the song is drawn as outside.** The grid keeps ruling it and the warp
lane keeps numbering it — downwards through bar 1 into 0, −7, −15, the way an arrangement
does — with a wash over it and the first and last bar as its border. Numbering is what
makes it read as somewhere rather than as a margin. The wash is *lighter* than the lanes
rather than darker, which is the opposite of Ableton and is forced: this window is
already nearly black.

**Which drawing you are looking at is a measurement, not a setting.**
[`playback.md`](playback.md) has it: a lane draws peaks while a column of them is finer
than a pixel, the samples themselves once it is not, and a line through the points once
there are fewer samples than pixels. The zoom readout says how much *time* the lanes are
showing — `3:52`, `12s`, `4.4ms`, and more than the song's own length once it is zoomed
out past fit — because at these depths a number of times is arithmetic and a length of
time is the answer to the question.

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

**Both strips rule from one ladder**, `grid.ts`, so the strip that judges the grid and
the strip the grid is judged against cannot disagree about where a beat is. The spacing
is *chosen* rather than computed: every rung is a musical division — sixteen bars down to
a sixty-fourth note — so whichever survives at a given zoom, the lines drawn are lines
somebody could play to. Doubling a pixel gap instead would put lines on three-and-a-bit
beats, which is a ruler for nothing.

It picks the finest rung that keeps lines sixteen pixels apart, which is set by how the
ladder lands rather than by how thin a line is: the rungs are quarters of each other
above a beat and halves below, so a division lives between sixteen and sixty-four pixels
for the whole of its life. A song wide is four-bar lines, thirty bars is bars, eight is
beats, two is sixteenths, and one kick drum wide is whatever fits under it. Ranking is by
what a line *is* rather than by where it falls in the current step, so a bar line stays a
bar line while the grid thins around it — and the lanes draw the four ranks in four
weights, while the warp lane, being 24px of strip, says it in height instead.

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
| the zoom readout, which presses back to the whole track | `Button` |
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
