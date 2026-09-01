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

1800 columns per stem, computed once per track rather than per lane width, so a
resize is a redraw and not a re-scan of forty million samples.

## The timeline is seconds now, and the bars are a claim about it

The window used to have `BARS = 64` nailed down as a constant. That was fine
while the audio was invented and is not once it is real: a track is however long
it is. Position is seconds; the bar count is
`ceil(seconds × bpm / 240)` and moves when the tempo does.

That is what makes the warp lane worth looking at. The ticks are onsets — placed
in bar space by the *grid*, not by the audio — so changing the tempo walks them
off the bar lines or onto them. A tempo a fraction out does not look wrong at
bar 2 and is unmistakable by bar 60.

Onsets come off the drums where there are drums, which is most of the argument
for fitting a grid **after** separating rather than before: the thing a grid
lines up with is the percussion, and here it arrives on its own track with the
pads and the vocal already taken off it.

Both grids thin themselves. A four-minute track at 128 is 128 bars and 512
beats; a line every three pixels is not a grid, it is a fill. They step in
powers of four so whatever survives stays on a musical boundary.

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
- **Tempo detection.** `bpmAuto` is a flag with nothing behind it; the grid is
  120 until somebody sets it. The onsets that detection would fit are already
  computed and drawn.
- **Slices as an arrangement.** Eight even spans with names, and nothing reads
  the audio to place them.
