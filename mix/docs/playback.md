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
it is. Position is seconds, and where the beats fall is `warp.ts`'s `Beats`:
**the sample of every beat**, bar 1's downbeat as beat zero, counted in the rate
the file was heard at. That is the one source of truth about timing. Between
two anchors the beats are drawn straight; past either end the neighbouring
spacing carries on. Nothing else about timing is stored — there is no BPM in the
map, a tempo is the spacing of two anchors read off on demand, and a tempo
change is nothing more than the spacing changing. Which is what makes an edit
local: drag one beat's anchor and its neighbours hold, the two spacings beside
it take up the difference, and nothing further away can tell.

Everything that draws, quantises, loops or plays goes through `beatAt` and
`sampleOf` — or `barAt` and `placeOf`, the same in bars and fractions — and
nothing does the arithmetic itself, so the lanes, the warp lane, the tablature
and the stretcher bend at an anchor in the same place. The ruling in `grid.ts`
is measured against the bars on *screen* rather than in the file, so a slow
section is ruled for the width it actually has. Samples rather than seconds
because a sample is exact and a second is a measurement of one, and the rate
travels with the map so an anchor means one thing on any device.

Before anything has been measured the map is the even ruling a typed tempo
makes — `evenBeats`, a beat every `60 × rate / bpm` samples — and a typed
tempo rules the grid. Once the beats have been found it rules only what plays.

**The bar count is not the map, and it used to be.** The lanes drew
`ceil(seconds × bpm / 240)` bars across the width of the file, which silently
rounded the tempo: a two-hundred-second track at 128 holds 106.67 bars, was
drawn as 107, and was therefore ruled at 128.4 BPM. Half a bar of drift by the
end of the song, coming from the ruler rather than from the audio, on the one
strip whose whole job is to show drift. The count is now derived from the map —
`countOf` — and nothing rules with it.

That is what makes the warp lane worth looking at. The ticks are onsets — placed
in bar space by the *grid*, not by the audio — so moving an anchor walks them
off the bar lines or onto them. A tempo a fraction out does not look wrong
at bar 2 and is unmistakable by bar 60.

Onsets come off the drums where there are drums, which is most of the argument
for fitting a grid **after** separating rather than before: the thing a grid
lines up with is the percussion, and here it arrives on its own track with the
pads and the vocal already taken off it. **The ticks are the fit's own hits** —
`hitsIn` hands the lane the kick-band rises the fit listened to, placed between
twelve-millisecond columns — so the agreement beside the tempo is exactly what
the lane draws, counted. They used to come from rises in the drawn peaks folded
down to a hundred and eighty columns, which put a tick anywhere within a sixth of
a beat of the kick it stood for: at song width the same pixel, and zoomed in a
grid that looked wrong when it was right.

Both grids thin themselves, from one ladder in `grid.ts` — every rung a musical
division, from sixteen bars down to a sixty-fourth note. A four-minute track at
128 is 128 bars and 512 beats; a line every three pixels is not a grid, it is a
fill. Whatever survives stays on a musical boundary, and it measures against the
*zoomed* width, so zooming in hands back the divisions it thinned: bars, then
beats, then sixteenths, each appearing where there is room for it.
That is what makes a grid judgeable: the ticks either side of one bar line are
the same pixel at whole-track width.

## Finding the beats

Three files, in the order the work happens: `transients.ts` hears where the
drums hit, `tempo.ts` reads a tempo and a downbeat off all of them, and
`follow.ts` finds every beat and anchors it to a sample.

### Where the drums hit, to the millisecond

The envelope the fit used to listen to was made of twelve-millisecond columns —
the loudest sample in each, and a hit placed wherever its attack fell inside
one. On a record made to a click that put the kicks a whole column either side
of the line. Splitting the columns finer made it worse: a finer envelope of the
same kind is more wobbles, and every wobble a local maximum. What was missing
was a detector, not resolution.

`transients.ts` is one: a **rolling window**, not a column. Every sample goes
through three band filters — the kick under 120 Hz, the snare between 200 and
2,500, the hats above 4,000 — each band is rectified and followed by an
envelope with a one-millisecond attack and a thirty-millisecond release, and
that envelope is read every sixty-four samples. A transient is where the
envelope *climbs*: the rise in decibels over the last five milliseconds,
peak-picked against a threshold that follows the local level, no two closer
than forty milliseconds in one band. The moment reported is where the envelope
had climbed a fifth of the way — the start of the attack, not its peak — and it
is then found again to the exact sample by running the band's own filter over
the few milliseconds around it. The filter's own delay is taken off, four
milliseconds for the kick band. A hit carries how sharply it rose, in nepers,
and how loud it got against the band's loudest.

A kick has a click and a hat has a thump, so one stroke shows up faintly in
bands it does not belong to. A snare or a hat within six milliseconds of a hit
twice as loud in another band is that hit's bleed and goes; a kick only if four
times outdone, because a quiet kick under a loud hat is the commonest thing in
music. So a hat is a hat and not also a faint snare, and a kick with a hat on
it is still a kick.

A stroke is timed by its click. The bands do not climb together: the click at
the front of a kick or a snare is over in a millisecond, and the thump under it
takes a few cycles of its fundamental to be heard as having started — sixteen
milliseconds each at 60 Hz. Judged in its own band a kick is late by that,
every time, and the harness page showed it: the pin on the red tick, a cyan
tick a few milliseconds ahead of it. So a kick or a snare with a high-band rise
inside the fifteen milliseconds before it takes that rise's sample as its own,
whether the click stood as a hat or was dropped as bleed. The band still says
which drum; the click says when.

On the two records in the library whose tempo is known to three decimals the
kicks now scatter about three milliseconds around the line, from twelve.

### Which pulse is the beat, and where it falls

`tempo.ts` answers three questions in order, and the order is what makes each
answerable.

**How fast** is where the onset strength — every hit, weighted by band, smeared
a frame — correlates with itself. Every local maximum of the autocorrelation
within 70 to 190 BPM that is a third of the strongest is a candidate. There is
**no lean toward any tempo**: the range is the only prior, and it is a range
because a tempo outside it is a tempo nobody would count, not because any tempo
inside it is more likely.

**Which of those is the beat** is the one question correlation cannot answer — a
kick every beat lines up with itself at twice the period exactly as well — and
it used to be settled by leaning toward the tempos people dance at. It is
settled now by what the kit *does*. Two shares, each at the candidate's best
phase: how much of the kick and snare strength sits *on* its pulses, and how
many of its pulses have a kick or snare on them, counted only where the kit is
playing at all. At half the true tempo every other hit falls between the
pulses and the first share halves; at double it every other pulse is empty and
the second does. The product is the score. Drum and bass at 174 with a kick on
one and three and a snare on two and four scores as 174 and not 87, and a slow
groove at 88 with hats between its beats scores as 88 and not 176, with nothing
told what to expect.

**Where the beat falls** is a search over every millisecond of one period,
scored by the busiest half-minute of the song rather than by the whole of it:
the period is known to a frame here, and a frame's error is a third of a
second by the end of four minutes, wider than the window a hit counts in. The
busiest stretch rather than the opening, because a record can take a minute
and a half to bring the drums in. Then least squares through the hits under
the beats, over twice as much of the song each round until it spans it all —
sixteen beats fix the period an order better, which reaches thirty-two, and
six rounds reach the end — which is what makes a tempo good to a hundredth of
a BPM. Each candidate gets its own line before it is judged, because a line a
frame out drifts off the very hits it is being judged against. The old fit grew
its line from the strongest hit in the first two beats, and on two records out
of five that hit was not the beat.

The downbeat is the heaviest quarter by how loud the kick got, voted from the
first beat in the file; four on the floor says nothing and the tie goes to the
beat the song starts on. A whole number is tested, not assumed — every record
on hand is 128 in the DAW and 128.055 on the master. Under four-tenths
agreement the fit refuses, as before: 120 dressed up as a reading is worse than
the window saying it found none.

### Every beat, anchored

The fit is one straight line, which is the right shape for a record and the
wrong one for a band. `follow.ts` finds the beats themselves and hands back
the map: the exact sample of every beat from the top of the file to the end,
whether or not a drum was struck on it.

**Every beat is a prediction matched to a transient under a smoothness cost,
and the matching is done for the whole song at once.** A greedy walk grabs the
syncopated kick inside its window and then has to find its way back; dynamic
programming asks which sequence of beats, taken together, sits on the most
onset strength while changing its spacing the least, and reads the answer off
backwards from the end. Where nothing was struck for sixteen bars the cost of
changing spacing is all there is, so the beats go on at the spacing they had —
evenly, which is exactly what a beat in silence is — and the first kick after
the gap lands on the beat it is.

**The spacing it is held to is local**, read off the song twenty seconds at a
time within a quarter of the seed's period either way, and the cost is then
stiff: a beat that lands late by a twentieth of its spacing pays as much as a
missing kick. A stretch is believed about its own period only when it states
it clearly — enough hits to correlate, a peak that stands well above the run
of lags — and not when it is a fill: a build-up roll is eight seconds of hits
every ninety milliseconds, as periodic as anything in the song and nothing to
do with its tempo, and it gives itself away by being several times as busy as
the song usually is. And a period a stretch does state has still to *be* the
beat: it is judged the way the seed's octave was, by what the kit does on and
between its pulses over that stretch, against the seed's period over the same
stretch, and believed only where it looks more like the beat. A stretch that
says nothing clearly takes the period of the clear stretches either side of it,
drawn straight between them — not the seed's, because a song with two tempos
in it has a seed that is one of them.

**Then each beat is anchored.** The transient under a found beat is placed to
the sample, and that is the anchor. A beat with none is placed evenly between
the anchored beats either side, because that is what the sound did. Bar 1
beat 1 is the first beat found, as a clip dropped in Ableton starts at 1.1.1:
the whole file, the start and every anchor are kept, and where the music's one
is elsewhere the count is moved rather than the beats — `renumbered` in
`warp.ts` is Ableton's "set 1.1.1 here". The kick's vote for the heaviest
quarter is still taken and reported, for whoever moves it.

**What it reports is checkable.** `agreement` is the share of the kick and
snare strength within an eighth of a beat of the map, which is what the warp
lane draws, counted; `tracked` is the share of the beats that had a transient
under them, because a map anchored to the hits agrees with them by construction
and the second number is the one that still says something.

### Measured on the library

The fixtures under `src/` are rendered kits, four minutes long — a machine, a
ritardando, a tempo step, a jump from house to a drop, a drummer with eight
milliseconds of wobble, a sixteen-bar breakdown, a half-time section — and
what they assert is the sample of a beat deep in the song. They passed while two
records out of five were refused, which is why there is also
`tools/mix-warp.ts`: `npm run warp:mix` runs the whole pipeline on every track
in the library with a drums stem and prints what came out beside what is known
to be true, from `tools/mix-warp-truth.json`. A truth is a tempo, and for a
song that changes tempo, the sections it changes at. The worst eight-bar
stretch of each track is what it flags, outside the bars around a change.

### Two clicks, and then the same machinery

`refitOf` is the hand path's half of this, and it is what makes counting out
four bars enough. Two clicks over four bars is fifteen seconds of evidence, and
a click twenty milliseconds out is a third of a BPM — a bar and a half of drift
by the end of a song. But it is *exactly* enough to say which beat and which
downbeat are meant, which is the half a fit gets wrong. So the clicks seed the
line and the same least squares over every hit in the track sets the tempo:
the hand supplies the octave and the phase, the audio supplies the precision.
A refinement that ends up three per cent away from what was measured has
locked onto something else, and is refused in favour of what somebody clicked.
Then the beats are followed behind it, as they are behind a fit.

## Playing it warped

With warp on, the stems play at the header's tempo and every beat of the record
takes the time that tempo gives a beat, whatever it took on the record. That is
Live's clip following the Set, and `schedule.ts` is the maths of it with
nothing of Web Audio inside: a **pass** through the file is a list of
boundaries — from this output second, read the file from here, this fast — one
where the pass starts and one at every anchor after it, the rate in each beat
being the record's seconds for that beat over the target's. The playhead is the
inverse, worked out from the same map on the audio clock, so the sound and the
line cannot disagree and both can be tested at a desk.

**The stretcher is Signalsmith Stretch**, the author's own Web Audio build —
one self-contained module with the WASM inside it, MIT — and it is **one node
for every stem**. A worklet plays the schedule it was sent, at the sample; but
six of them are six message streams and six latencies to keep the same, and a
mixer that could drift a millisecond between the kick and the bass is a mixer
you can hear. Twelve channels through one node is one time map, one clock and
one latency, and the stems come apart again in a splitter on the way to their
own gains, which is why mute and solo know nothing about it.

**Boundaries go over one ahead.** The node keeps what it is given and drops
anything filed after a new change, so each boundary is sent once the one
before it has begun, filed at its own time so it queues behind rather than
replaces — and sent from the node's own update messages rather than a timer,
because a hidden window's timers are throttled and a boundary that lands late
is a jump in the sound. A seek is one change filed at the present, which
drops the future and starts again from where the pointer went. The loop is a
boundary at the end of the pass back to the top, and the head wraps in bar
space the same way.

**A record at its own tempo plays through the plain sources** even with warp
on. Its anchors sit within a per cent of even — the detector's scatter on where
a kick began, not the record moving — and a stretcher at a rate of one is not
the samples. So a produced record with warp on is bit-exact until the tempo
field moves by a twentieth of a per cent, and the stretcher only ever works
when there is something to stretch.

The node holds its own copies of the stems: an `AudioBuffer`'s memory cannot
be lent to a worklet, and the lanes and the plain sources still need the
buffer. Four four-minute stems at 48 kHz is another three hundred and seventy
megabytes, so the copies are made when warp is first switched on, handed over
rather than cloned, and dropped with the stems. A stem the fallback decoder
kept at the file's rate is resampled first; the worklet does not, and a 44.1 k
stem in a 48 k graph would play a semitone and a half sharp. Where there is no
worklet to be had — no WebAssembly, a scheme that refuses a Blob — the window
plays straight and the warp switch says so.

The clock in the header still shows seconds of the *record*, because the lanes
are drawn in them. Under warp they pass faster or slower than the wall clock,
which is the point.

## The window remembers itself

`remember.ts`, in `localStorage`, keyed on the app's own origin — which is real
because the app has a scheme rather than `file://`, an opaque origin that
promises nothing.

Kept: the open track, the model, the search, loop and warp; and per
track, the mix and the head. **Not** the grid and not the slices, which are
facts about the audio and go beside it in `analysis/`. **Not** the
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

Untouched slices are deliberately *not* kept anywhere. What the window read
off the stems is a reading rather than a decision, and it is read again every
time the track opens, against whatever the grid is by then — writing it down
would freeze cuts against a beat map that might since have been bent. They
only become somebody's once one is renamed, moved, cut or removed, and then
they are written beside the track in `analysis.json` with the grid they sit
on; *read again* in the export dialog gives the reading back.

**The mix lives on this machine, not in the library.** Carrying the folder to
another laptop carries the audio and the stems, not the balance. That is a real
limitation rather than an oversight: the manifest is where it goes when it
should travel, and that is a decision about the manifest.

## Not yet

- **Export.** The dialog says what it would write and the button closes it. An
  Ableton set is its own engine.
- **Slices that hear more than loudness.** The cuts come off each stem's level
  per bar, which finds where a stem arrives or leaves and not where the same
  stems play something else; a verse and a chorus at the same weight are one
  span until somebody cuts them.
