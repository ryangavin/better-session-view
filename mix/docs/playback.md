# Playing the stems, and drawing them

`mix/src/audio.ts`, `engine.ts`, `remember.ts`, and the mount in
`desktop/src/serve.ts`.

The separation writes four WAVs into the library — [`stems.md`](stems.md). This
is how they get back into the window as something you can hear, see and mix.

## Getting the bytes there is the part with a decision in it

The renderer cannot open a file. Three ways round that, and only one of them
survives a four-minute track:

**Through IPC.** A stem is float32 stereo at 44.1 kHz — about 85 MB for four
minutes, so a four-stem set is a third of a gigabyte, and a structured clone
copies every byte of it. Twice, in practice, since the buffer has to be
serialised out and rebuilt in.

**Over `file://`.** A different origin. The page cannot `fetch` it, and turning
off the checks that say so turns them off for everything.

**A mount on the app's own scheme**, which is what this does.
`desktop/src/serve.ts` already answers for `mix://app/` because the app serves
its own build; it now also takes a map of URL prefixes to directories, so
`mix://app/library/stems/<id>/<model>/vocals.wav` streams the file straight off
the disk. Same origin, no copy, and it is the handler doing the reading rather
than the page.

The mount is confined by `desktop/src/within.ts`, which is its own file because
of what it now guards: serving a build out of a read-only directory is one
thing, and serving a folder full of somebody's music named in a URL the page
composed is the case where getting it wrong hands over the filesystem. It has
its own tests, and they are all the ways out of a directory.

## Decoding, and why there are two decoders

`decodeAudioData` first, because it knows every format and resamples to the
context's rate. Our own reader second, for the float32 WAVs this app writes —
float WAV is not the common case a decoder is tuned for, and a build that could
not read one would lose the only format the separator produces. It would lose it
*silently*, too, because a failed decode is an empty lane rather than an error.

Reading one is a header walk and a copy, so the certainty costs almost nothing.
Both paths are checked: the reader against real worker output in
`audio.test.ts`, and `decodeAudioData` against the same files in a browser —
it handles them, resampling 44.1 to 48 kHz with the peaks intact.

`decodeAudioData` detaches the buffer it is handed, so the fallback gets its own
copy. Reading a detached buffer would be four silent stems, which is the worst
of the available failures.

## The transport and the mixer are one graph

```
  AudioBufferSourceNode ─┐
  (one per stem, started ├─ GainNode (per stem) ─┬─ master ─ destination
   together, sample-locked)                      │
```

**Every stem is a source started in the same call, at the same time, from the
same offset**, so the device schedules them on the same sample. Starting them in
a loop with no `when` puts each one wherever the main thread happened to be,
which is a few milliseconds of flam between the kick and the bass.

**Mute is a gain, not a stopped source.** A `AudioBufferSourceNode` cannot be
restarted, so stopping one would mean rebuilding the graph mid-playback — and
the rebuild is audible. As a gain it is a 15 ms ramp, which is inaudible, and
unmuting half a minute later drops the stem back exactly where it should be
because the clock underneath never moved.

Solo is exclusive of mute, not of the other solos: any soloed stem plays, and
when none is soloed everything unmuted does. That is Live's rule and the only
one that behaves when you hold two of them down. `gainOf` is one exported
function because the lane's *drawing* asks the same question — a soloed stem
drawn lit and played silent would be two implementations disagreeing.

The fader is cubed around a resting position of 0.8, so unity is where it sits
and there is trim either side. Linear, a fader spends most of its travel in the
top few decibels and feels dead for the first half.

**The playhead reads the audio clock**, not a counter. `requestAnimationFrame`
misses frames and stops entirely in a background window, so an accumulated
position drifts away from the sound it is pointing at. `Transport.at()` asks the
graph where it actually is, so the line cannot be wrong however badly the page
is being scheduled.

## The picture comes off the buffers that play

Peaks are computed from the same `AudioBuffer`s the transport is handed, in the
same effect. That is the whole reason it is one effect: a drawing derived from
anywhere else can disagree with what you hear, and then it looks like the *file*
is wrong.

A column is a span of time and what is drawn in it is the furthest the signal
got anywhere inside it — point-sampling instead is what turns a drum lane into a
ruled line, because a transient that decays inside a column is caught whole or
missed entirely depending on where the column landed. Channels are folded by
widest excursion rather than by averaging, so a hard-panned hat is at its real
height instead of half of it.

9000 columns per stem, computed once per track rather than per lane width, so a
resize — or a zoom — is a redraw and not a re-scan of forty million samples.

**Peaks are a summary, and a summary is only the right drawing while it is
finer than the screen.** A lane compares how much of the track a pixel is
holding against how much a column of peaks holds, and once the pixel is holding
less it draws the *audio* instead: an envelope taken from the samples
themselves, and past two samples to a pixel, a line through the sample points
with a dot on each. There is nothing under a sample, which is what makes the
bottom of the zoom a fact rather than a taste.

The count is what sets the handover, at about ten times a window's width. It is
a balance either way: fewer columns and the handover comes while a screenful is
still millions of samples to walk on every wheel tick; more, and the load
scans detail nothing ever draws.

**The onsets are found at 1800, folded down from those 9000 rather than
scanned again.** A different question wants a different resolution: an onset is
a *rise* in energy between columns, and at a fifty-millisecond column every
hi-hat is a rise. What makes a downbeat findable is a column long enough that
only a real hit moves it. Folding five into one takes the widest excursion of
the group, which is exactly what a scan at that count would have produced —
the boundaries land on the same samples — so the drawing and the detection are
still one reading of one stem, and `audio.test.ts` holds that equality up.

Each stem is drawn as soon as *it* is decoded rather than when the last one
is — the lanes are already on screen, laid out from the manifest, and what
arrives is the drawing inside them. The transport still gets all of the buffers
in one handover, because the stems are started in a single call so they play on
the same sample.

A lane draws the slice of those columns that is on screen, folded again to
about two columns per pixel. Zoomed out that is the fold doing what it is for;
zoomed in it is one column each, drawn wide.

## The timeline is seconds now, and the bars are a claim about it

The window used to have `BARS = 64` nailed down as a constant. That was fine
while the audio was invented and is not once it is real: a track is however long
it is. Position is seconds, and where the bars fall is `warp.ts`'s `Bars`: an
origin and a span, `{ origin: −offset × bpm / 240, across: seconds × bpm / 240 }`.
Two numbers, because a grid is a tempo **and** a downbeat — no tempo fixes a song
with a quarter-second of air in front of it, since every line is that quarter
second late for the whole of it.

**The bar count is not the map, and it used to be.** The lanes drew
`ceil(seconds × bpm / 240)` bars across the width of the file, which silently
rounded the tempo: a two-hundred-second track at 128 holds 106.67 bars, was
drawn as 107, and was therefore ruled at 128.4 BPM. Half a bar of drift by the
end of the song, coming from the ruler rather than from the audio, on the one
strip whose whole job is to show drift. The count is now derived from the map —
`countOf` — and nothing rules with it.

That is what makes the warp lane worth looking at. The ticks are onsets — placed
in bar space by the *grid*, not by the audio — so changing either number walks
them off the bar lines or onto them. A tempo a fraction out does not look wrong
at bar 2 and is unmistakable by bar 60.

Onsets come off the drums where there are drums, which is most of the argument
for fitting a grid **after** separating rather than before: the thing a grid
lines up with is the percussion, and here it arrives on its own track with the
pads and the vocal already taken off it. `audio.ts` answers *which lane* once,
in `energyOf`, and both the ticks that are drawn and the fit that places the bars
read it — a strip that judged the grid against a different stem from the one the
grid was fitted to would not be evidence about anything.

Both grids thin themselves, from one ladder in `grid.ts` — every rung a musical
division, from sixteen bars down to a sixty-fourth note. A four-minute track at
128 is 128 bars and 512 beats; a line every three pixels is not a grid, it is a
fill. Whatever survives stays on a musical boundary, and it measures against the
*zoomed* width, so zooming in hands back the divisions it thinned: bars, then
beats, then sixteenths, each appearing where there is room for it.
That is what makes a grid judgeable: the ticks either side of one bar line are
the same pixel at whole-track width.

## Fitting a grid to the audio

`warp.ts`. Auto-warp is a measurement now rather than a gesture: it hands back a
tempo, a downbeat and how much of the drumming agrees with them, and the window
applies all three.

### It listens to the kick

**The tempo comes off the kick band, not off the drums.** A kick is short, loud,
low and repeated, which is the easiest thing in a mix to measure a period from —
and taking the snare and the hats off it removes most of what a fit can trip
over. `bandsOf` walks the drums stem once and comes back with two envelopes:
`low`, through three one-poles at 120 Hz — eighteen decibels an octave, which
leaves a kick's forty-to-a-hundred-and-fifty alone and takes twenty off a snare —
and `wide`, the same stem unfiltered.

One walk, because a stem is tens of millions of samples and two passes over it
is two passes over it. A column is 512 samples, about twelve milliseconds, and
what is kept is the *loudest* sample in each — a kick's attack is a couple of
milliseconds inside that column, and a mean would be a picture of how long the
hit rang for rather than of when it started. A four-minute stereo stem walks in
about a hundred milliseconds and fits in fifteen; it is worked out once per
track and kept.

`wide` exists for exactly one question, below. With no stems decoded — before the
audio arrives, or in a browser with no app around the page — `columnsOf` falls
back to the drawn peaks: half the resolution and one band for both.

### Four steps

Each is there because the step before it cannot do the job alone.

**An onset strength, less the strength around it.** The rise in energy per
column, minus a local mean over four hundred milliseconds. Without the
subtraction the fit is dominated by whichever section of the song is loudest —
a chorus out-votes a whole verse, and what is really being fitted is thirty
seconds of it. What is left is *how much this moment stood out from its
neighbours*, which means the same thing everywhere in the track.

**Hits, placed between columns.** Local maxima above a floor, positioned by the
parabola through the peak and its two neighbours. A column is twelve
milliseconds and a grid is judged in single ones, so rounding every hit to a
column would put a floor under the accuracy of everything after it.

**A period, from autocorrelation.** Folded to about 24 ms first, since this is
the one step costing lags times columns and a coarse answer is all it owes.
Scanned at an eighth of a column against a signal smeared by a column either
side, because a spike correlated against a spike gives one lag a huge score and
its neighbours nothing to interpolate from — smeared and scanned finely, the peak
has a shape. It looks an octave *below* the slowest tempo it will ever claim: a
kick on one and three is a pulse at half the tempo of the song it is in, and
refusing to see it is how a fit ends up locked to nothing.

**A line, refitted over twice as much of the song each round.** Least squares
through the hits the grid found, starting at sixteen beats and doubling until it
spans the track. It has to grow rather than start wide: a period right to a
fraction of a per cent is exact enough to match sixteen beats and nowhere near
exact enough to match five hundred, because a tenth of a per cent is a beat and
a half of drift by the end of four minutes. Sixteen beats fix the period an order
better, which reaches thirty-two, and six rounds reach the end. The last two
rounds are over the whole song, and that is what makes the answer worth having:
a tempo fitted to every kick in four minutes is good to about a hundredth of a
BPM, which is the difference between a grid that holds at bar 200 and one that
is visibly wrong by bar 60.

### Which octave, and which beat starts the bar

Autocorrelation cannot tell a beat from a half-note — a pulse every 0.47 s
correlates with itself at 0.94 s just as strongly. Three things settle it, in
order of how much they know:

**Alternate beats carrying almost nothing are not beats.** The pulse found was a
subdivision, and the period doubles. This is decided entirely by the low band.

**A kick on one and three is not a song at half the tempo.** If the pulse comes
out under 95 BPM, `wide` is asked whether the midpoints between those kicks are
as busy as the kicks are — which is the snare, on two and four. If they are, the
beat is twice as fast. This is the one octave question the audio can answer
outright, and it is the whole reason there are two bands rather than one.

**Otherwise, a preference for the tempo a person would have counted**, eight
tenths of an octave wide around 125. Steady eighths at the weight of the quarters
are genuinely ambiguous, and this is what decides them.

Then the downbeat: the beats are split four ways and the heaviest quarter starts
the bar, because the kick is the heaviest thing in most bars of most music this
will meet. **Four on the floor is the case where that says nothing** — four
identical kicks, any of which would do — so the tie goes to the beat the song
*starts* on, which is what songs do, and a vote has to carry five per cent more
to move it. Getting this wrong is a grid whose lines are right and whose bar
numbers are three beats out, which the first click of the hand path fixes in one
click. Bar 1 is then the first downbeat *of the file*, so the bar count means what
it says; everything before it is still ruled and still numbered, downwards.

### What it will not do

The line is straight by construction. That is the right shape for what this app
is pointed at and the wrong one for a band playing to no click — and the warp
lane is where you find out which you have, because a fit that cannot hold walks
off the bar lines, visibly.

**What it reports is checkable.** `agreement` is the share of onset strength
landing within an eighth of a beat of a grid line — exactly what the warp lane
draws, counted. A quarter of it is luck, because the window is a quarter of a
beat wide, so a fit under four-tenths is refused: there is no tempo that is
honest about a track with nothing steady in it, and 120 dressed up as a reading
is worse than the window saying it found none.

### Two clicks, and then the same machinery

`refitOf` is the hand path's half of this, and it is what makes counting out four
bars enough. Two clicks over four bars is fifteen seconds of evidence, and a
click twenty milliseconds out is a third of a BPM — a bar and a half of drift by
the end of a song. But it is *exactly* enough to say which beat and which
downbeat are meant, which is the half a fit gets wrong. So the clicks seed the
alignment and the same least-squares line over every kick in the track sets the
tempo: the hand supplies the octave and the phase, the audio supplies the
precision. A refinement that ends up three per cent away from what was measured
has locked onto something else, and is refused in favour of what somebody
clicked.

`warp.test.ts` fixtures are four minutes long and what they assert is the
*drift* — where the grid puts bar 100 — because a tempo a tenth of a per cent out
passes every test written against a two-bar loop. One of them renders a 60 Hz
kick and a 2 kHz snare into real samples and checks that the filter leaves one
and takes the other.

## The window remembers itself

`remember.ts`, in `localStorage`, keyed on the app's own origin — which is real
because the app has a scheme rather than `file://`, an opaque origin that
promises nothing.

Kept: the open track, the model, the search, snap and loop; and per track, the
mix, the head, the tempo and any slices somebody has actually named. **Not** the
library and not the stems — those are on disk and are read back every time,
because a second copy of the truth is the copy that goes stale.

Three things it has to get right, and each was a bug first:

**Switching tracks writes the outgoing one synchronously.** The settled write is
400 ms behind, and its dependencies change the instant a new track is selected —
so the last four hundred milliseconds of work on the track you just left would
be the four hundred that never got saved.

**The head is not a dependency of the settled write.** It changes sixty times a
second while playing, so depending on it would reset the timer every frame and
nothing would *ever* be written during playback — which is exactly when somebody
is least expecting to lose their place. It is read from the transport when the
timer fires, and `playing` is a dependency so that stopping writes where you
stopped.

**Clicking the row that is already open does nothing.** Falling through would
reload the mix from what was last written down, so a fader moved a moment ago
would spring back for no visible reason.

A reload during a separation reattaches rather than restarting: the renderer
restarting does not stop the main process, so the window asks `busy()` on mount
and picks the job back up mid-flight.

Untouched slices are the one thing deliberately *not* kept. Eight evenly spaced
spans are a default rather than a decision, and they are laid out before
anything has been decoded — writing them down would freeze eight positions
against a length the window had not measured yet. They are re-spread when the
bar count settles, and only become somebody's, and kept, once one is renamed.

**The mix lives on this machine, not in the library.** Carrying the folder to
another laptop carries the audio and the stems, not the balance. That is a real
limitation rather than an oversight: the manifest is where it goes when it
should travel, and that is a decision about the manifest.

## Not yet

- **Export.** The dialog says what it would write and the button closes it. An
  Ableton set is its own engine.
- **Slices as an arrangement.** Eight even spans with names, and nothing reads
  the audio to place them.
