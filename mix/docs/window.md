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

## The library rail

The rail starts with two compact rows: filter plus **Import**, then a YouTube URL plus
**Fetch**. Import opens the ordinary multi-file picker; Fetch stays explicit rather than
guessing that text pasted elsewhere is a URL. Both disable while an import is in flight,
and the rail footer changes from the folder name to the result or the useful error.

Files may also be dropped anywhere on the window. A dashed target covers the window while
the drag is over it, which both makes the action visible and prevents a file dropped on a
waveform from navigating the renderer away from the app.

## The header

    mix[flow] │ Title · Artist ⋯ [▶ ■ ↻ 128 1.1.1 0:00] [snap ⌗ 4 1 ♩ ½] [Analyze 126–131 · 91% warp] │ Export

Playback keeps the transport, target tempo and clock; Snap governs timeline gestures.
**Analyze** opens the track analysis home. The compact detected tempo/agreement summary
and Warp remain in the mixer header. Grid review, automatic reset and section suggestions live in analysis.
Algorithm selection remains in the debug workspace. The tiny Separate again action above the lanes is gone.

The title yields by ellipsis rather than wrapping the header. In analysis the page owns
its listening controls and Back to mix; the header shows Analysis as the current location.
The normal playback and export controls return with the mixer. Engine faults still appear
only when there is something wrong.

## Track analysis, on import and on return

`TrackAnalysis.tsx` wraps setup and the product song review. A newly imported track
with no stems starts on the source setup section: metadata, model cards and Generate stems.
The same page shows beat and section review when decoded stems are available.
Separation still runs only on an explicit Generate/Separate again press.

An existing track opens with the song overview. `TrackReview.tsx` shows the whole song,
vocal activity, a labeled first-downbeat waveform and sustained-change section suggestions.
First/middle/end checkpoints select passages. Playback starts at the visible white cursor
and lasts sixteen mapped beats, with an optional metronome. Grid correction
is inline: set bar 1, move it a beat, nudge or enter a steady tempo. Reset previews a fresh
automatic result; discard restores the exact saved map. No algorithm menu or buttons
that pretend to edit here but navigate to the mixer. **Save & return to mix** commits
the map and, only when selected, replaces existing sections with numbered suggestions.
See [track-review.md](track-review.md) for measurement, thresholds, playback and persistence.

Source setup and metadata follow the review on the same page. There is no tab switch
and no footer; Save, Back and draft status share the top heading. The model that produced
the stems is preselected when Analyze opens; the cache/engine estimates are the existing
ones. **Back to mix** leaves without separating or applying a preview.

The underlying phases remain derived: `empty`, `idle` (analysis home), `running`
(separation progress), `ready` (mixer). `setupFor` holds a track ID, so reopening analysis
for one song does not put every other song there. Opening analysis stops main playback;
analysis audition owns its own clock and stops on unmount. Mixer keyboard shortcuts only
run in the mixer and do not also trigger while analysis is listening or a control is focused.

Metadata remains in `Details.tsx`, committing on blur and reverting with Escape. The model
cards report useful source/speed tradeoffs, not scores. Successful separation follows the
existing path to the mixer; beat review can be reopened with Analyze.

The debug workspace is opened by the bug button at the left edge of the library footer, beside the folder
control. `DebugButton.tsx` owns that button and its modal.

## The lane head is 88px, and that is the whole layout

Every row's drawing starts at the same x, so a transient in the drums lines up with the
one in the bass. That is the only reason the head is a fixed width rather than a
fraction, and it is why the band above the lanes carries a head of its own — it holds
the mix summary and the two buttons that change it, and it exists as much to reserve
that column as to say anything.

**The head is a strip, not a row, and that is what buys the width.** A lane is a few
dozen pixels tall and only ever a couple of hundred wide, so height is the dimension
there is spare of: laid out sideways the fader spent 46px of the scarce one to buy 46px
of travel. Standing up it takes the whole of the leftover height and the whole of the
column's width, with the stem's name and its trim on the line above and mute and solo
side by side on the line below — the thing in the head you cannot miss, and the thing
you cannot fail to hit. There are six stems at most, so no number of them ever squeezes
a lane to where that stops working.

The names are fixed — Vocals, Drums, Bass, Guitar, Piano, Other — so the column is
sized to the longest of the six and nothing else, which is why it can be this narrow. It
is the band head above that is hard to fit rather than the lanes: it carries the actions
for the whole mix, so its zoom readout and its Reset each take a line of their own with
a small button beside them, and the model's name truncates rather than push anything
out. The count of audible stems used to sit there and no longer does — with mute and
solo drawn this large in every lane, `4/6 audible` was restating what the strip already
says.

Its length is CSS's, because how much height the lanes have to divide is not known until
they have been laid out. What has to come back the other way is how long it turned out:
`Slider` gears its drag to `travel`, and a rail drawn taller than the travel it was
geared to is a thumb running ahead of the pointer. A `ResizeObserver` on one lane's rail
answers for all six, since they are all the same height.

A lane at 68px is the density that lets you *see* an arrangement — a breakdown is a
block where the drums stop, and a fill is a darker column you can point at. Clicking any
lane moves the head there: a waveform is what you are looking at when you decide where to
listen from, and reaching back up to a strip at the top to act on it is the sort of gap
that makes a window feel like a diagram of a DAW rather than one.

**A lane reads as its own object rather than as a row of a table.** Three things do
it, and they are the same three a mixer does it with. The separator between lanes is
`--bd`, the border the rest of the window uses, rather than a shade barely off the
background — a hairline you have to look for is not separating anything. The head
column has a surface of its own, so the boundary between a stem's controls and its
drawing is an edge rather than an alignment. And the head carries the stem's colour
as a bar across its top, with the drawing behind the waveform shaded in the same —
which is what makes the stack scannable at a glance: you find the bass lane by its
colour, not by counting rows.

The bar was a stripe down the left edge, and before that a dot beside the name. All
three said the same thing; the top of the strip is where it now sits, because a
narrow head is a column and a column is capped rather than fenced.

**The lane is shaded in blocks, not washed evenly.** Every other cell between the
grid's dividers is lifted, in the stem's own colour, so a phrase reads as a shape
rather than as the gap between two brighter lines — the thing that tells you where
you are when the waveform itself is a wall. The blocks never go finer than a bar
however far the ruling subdivides: alternating sixty-fourths is a zebra, and by the
time you are that deep the bar is what you are trying to see the hit against.
`grid.ts` decides both, so the lanes and the warp lane above them cannot disagree about
which block is lit.

**A lane nobody can hear says so.** Muted, or lost to somebody else's solo, and the
bar goes to `--idle`, the shading all but goes, and the name drops to caption grey. The
waveform was already dimmed; this makes the whole row agree with it, so *what am I
hearing* is answered by the shape of the stack rather than by reading six toggles.

**46px is the floor, not the height.** The lanes share whatever the window has, so a
four-source separation gets the room a six-source one would have used rather than four
rows and a hole underneath them. `Waveform` takes no height when the lanes draw it and
measures the box it was given instead — how tall a stem is depends on how many stems
there are and how tall the window is, which is a question CSS answers better than a
component can. Once the lanes reach 46px the list scrolls rather than going below it.

**Tablature unfolds from Bass rather than living as another track.** The Bass name is its
disclosure: when it is closed the extra row does not exist and Bass is visually identical
to every other stem; hover or keyboard focus reveals the affordance. Open, a continuous
bass-coloured edge and an indented head make the tablature a child of its audio lane. It
is a standard four-string EADG instrument; its head owns Transcribe, Cancel and Reveal.
Its body draws every MIDI note on a string at its exact onset. The fret number is plain,
large monospaced ink interrupting the string; its pitch class chooses that ink, so every C
is red across every octave. Duration is only a quiet one-pixel underline, and vertical
ruling stops at bar lines. At whole-song width every duration remains but colliding numbers
thin; zooming earns each number back. It shares the waveforms' view, grid, playhead,
paging and click-to-seek rather than being a separate document pasted over the bass
waveform. Changing songs folds it away. The worker and fret-path rules are in
[`transcribe.md`](transcribe.md).

Once notes exist, `−8va / 0 / +8va` corrects their octave. It is a layout of the cached
detections rather than another inference: the view moves immediately and the MIDI and
text tab on disk are rebuilt to agree. The string drawing is the shared
`@openflow/widgets` Tablature; this file only adapts mix[flow]'s fret path and timeline
into it.

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
is actually being made. Wanting guitar on its own means choosing another model in **Analyze**, below the song review.

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

**Scroll over the lanes zooms; ⇧-scroll pans.** Zoom stays anchored under the
pointer. Shift with a vertical wheel moves back on down and forward on up;
Shift with a sideways trackpad swipe pans in that direction. ⌘/Ctrl-scroll and
trackpad pinch still zoom. The lane list's scrollbar reaches rows in short windows.

**Hold the middle mouse button to cruise around.** Drag up to zoom in, down to
zoom out, and sideways to pull the audio with the pointer. Both axes work together.
Pointer capture keeps the gesture alive outside the lanes; release, cancellation,
lost capture, window blur and track changes end it. The gesture intercepts the
press before lane controls can seek or edit, and suppresses browser autoscroll.

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

**A grid is the sample of every beat, and the window used to hold it as two
numbers.** Every beat has its sample, the bars are drawn straight between one
beat and the next, and the spacing carries on past either end. No tempo is
stored: what the header shows is read off the spacing, and a tempo change is
nothing but the spacing changing. Before anything has been measured the beats
are the even ruling a typed tempo makes — which is the tempo and the downbeat the
window used to hold, and the downbeat still matters: a song with a quarter of a
second of air in front of it could not be gridded at all when bar 1 was the top
of the file. `warp.ts` holds the map, and `playback.md` has how the beats are
found.

**Auto-warp finds every beat and places it.** The drums are heard in three
bands — kick, snare, hats — each hit placed at the start of its attack to the
exact sample; the tempo and which pulse is the beat are read off all of them,
with no lean toward any tempo; and the beats are then found for the whole song
at once, matched to the hits under a smoothness cost, so a breakdown is counted
through at the spacing it had and the first kick after it lands on the beat it
is. The markers on the warp lane are those beats — every one when a beat has
room, else every bar — and they are the map, not marks on it: drag one and the
grid bends under the pointer. The readout beside the button says the tempo the
beats run at, and a range where they moved.

**It runs on its own when a track is opened that nothing has been decided about**,
which is what makes it worth having — it costs a few milliseconds, and the
alternative is lanes ruled at 120 over a song at 128, which is not a neutral
default so much as a wrong answer nobody asked for. Anything written down — a fit
that was nudged, a tempo typed in — is a decision, and a decision is not re-taken
behind somebody's back.

**Manual is two clicks a counted span apart, and then a nudge.** It is the other
half of the feature rather than a fallback: the first click says *this is a downbeat*
and sets where the bars fall, the second says *this is the downbeat four bars later*
and the tempo follows. Neither click is bar 1 — bar 1 is the first downbeat in the
file, as it is for a fit, and the marks are numbered with whatever bars the clicks
landed on.

**It asks for a counted span rather than for the last bar of the song**, and that
is the whole difference between a control somebody uses and one they do not. Asking
for the last downbeat is asking somebody to find bar 97 of a song they have not
gridded yet — the one thing a person is worst at and a machine is best at. Counting
four is a thing they do without thinking, and the count is on the bar: 1, 2, 4 or 8.

The accuracy that gives up is handed straight back. Four bars is fifteen seconds and
a click twenty milliseconds out is a third of a BPM, which would be a bar and a half
of drift by the end — so the two clicks *seed* a fit rather than being the answer,
and the same least-squares line over every kick in the track sets the tempo from
there. The hand supplies the octave and the phase, which is the half a fit gets
wrong; the audio supplies the precision, which is the half it gets right. A
refinement that wanders three per cent off what was measured is refused, and what
was clicked stands.

The nudge moves the grid by ten milliseconds, keeping the tempo — the fix for ticks
sitting evenly *beside* the bar lines rather than drifting off them.

**And then the beats themselves.** Live's workflow is auto-warp, then fix by hand
what it got wrong, and the markers are where that happens. There is one gesture: a
marker drags. Its sample moves and its beat stays, which is saying *the audio under
the pointer is this beat*; its neighbours hold, the two spacings beside it take
up the difference, and nothing further away can tell. It lands on the nearest
kick unless ⌥ is held. Nothing is added or deleted, because every beat already
has a marker. The × beside Auto-warp lets the whole map go — back to an even grid
at the tempo and downbeat there are, which is how you start over, and Auto-warp
is how you ask for the beats again. A drag is a decision, so the fit's
percentage goes with it and the tempo range stays.

It gets a bar of its own at the top of the lanes because in that mode a click in a
lane means something else. A mode you cannot see is a mode that surprises you.

Bar numbers appear every eight bars, and only when eight bars is wide enough to hold one.
Sixteen numbers in a 24px strip is a grey band, and the point of a number is to be
countable from.

## What is a widget and what is not

| on screen | is |
|---|---|
| the model menu | `Select` |
| play, stop, cancel, export | `Button` |
| the zoom readout, which presses back to the whole track | `Button` |
| loop, mute, solo | `Toggle` |
| a stem's level | `Slider`, horizontal, with a length |
| per-source progress | `Meter` |
| the tempo, in the header transport | `NumberField`, unfilled |
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

What is this app's own is in `src/tokens.css`: six stem roles, and the four surfaces
this window has that no other app does — the band, the lane head, the wash over time
outside the song, and the bar that appears while the grid is being set by hand.

**The six are one hue wheel, not six colours that were each picked well.** Two of them
used to be palette accents — guitar was `--green`, piano was `--blue` — and Other was
`--detail`, on the reasoning that the residual is not a source so much as what is left.
Both of those are wrong for the job. Aliasing a stem to a UI accent ties its hue to a
decision made about buttons, which is how guitar and piano ended up teal and blue with
forty degrees between them; and grey is not a colour you can find a lane by, which is
the entire thing a stem role is for.

So they are spaced around the wheel instead, and what the set has to contain is the
four a person can name without thinking: red, yellow, green, blue.

| role | | |
|---|---|---|
| `--stem-vocals` | red | |
| `--stem-drums` | yellow | pushed toward lemon, away from `--amber` — the playhead rides over this lane |
| `--stem-guitar` | green | |
| `--stem-other` | cyan | |
| `--stem-bass` | blue | |
| `--stem-piano` | magenta | |

They stay here rather than in the palette until something else needs them, and they are
named for the source they paint and never for the hue, so a stem that changes colour
changes in one place and nothing else has to be read to find out why.

## What is invented

**One thing, and it is not the audio and not the grid any more.**

The library is a folder on disk read through `electron/library.ts` —
[`library.md`](library.md) — so the rail, the counts and the badge strips are real. The
separation is a child process, and the progress bar is what it reports —
[`stems.md`](stems.md). The waveforms are the stems that process wrote, decoded, and the
transport plays those same buffers — [`playback.md`](playback.md) — so the picture and
the sound cannot disagree, which they could the moment they came from two places.

**The slices are read off the stems**, and then they are yours. `slices.ts` scores
every phrase boundary by how much each stem's level changes across it — the vocal
arriving over an unchanged beat counts as much as the whole mix getting louder — and
cuts where the score stands out. The spans are named by how loud they are: the loudest
are drops, a span that rises into a drop is a build, a quiet one between two drops is
a break, and the ends are the intro and outro. The names are a guess and the cuts are
a reading, and both are there to be corrected on the ruler: drag a cut, double-click
to make one, drag it back onto the last to remove it, and type the name in place.
Until anything is decoded the ruler is eight even spans, which is spacing rather than
a reading, and says so nowhere because it is gone the moment the stems are in.

**The tempo is measured, and the key is not.** A track imported today has no key
until something reads for one, and it is drawn as unknown rather than as zero. The
grid is no longer in that list: `warp.ts` fits one, `playback.md` has how, and what
it could not fit it declines to invent.

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
