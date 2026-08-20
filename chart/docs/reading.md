# Reading the set

What a phone is shown, and where each thing on it comes from.

Everything is decided in [`server/chart.ts`](../server/chart.ts), which is pure and is the
only file here with tests. The phone draws what it is handed and works nothing out.

## Which scene is "now"

The **dominant** `playing_slot_index` across the tracks, not any one track's.

A scene launch moves every track at once, so what most of the set is playing *is* the
scene. A track somebody reached past the grid to fire on its own is the "and now something
else" gesture of a live set, and it does not get to rename the section for everyone else.
`visuals/server/show.ts` reads the playing scene the same way, for the same reason.

"Next" is the dominant `fired` index on the same terms. **Live's `-2` is the track's stop
button, not a scene**, so only indexes at or above zero are counted — folding the two
together would have a stopping set report that it was queueing scene -2.

**A queued scene counts as the focus when nothing is playing.** Firing the first scene of a
song therefore puts that song on the phone before it starts, rather than a beat after
everyone has already heard it.

## Which song

`SetModel.songByScene[focus]`, then the matching `SetModel.songs` entry — which arrives
with its facts already rendered. Nothing here parses a name, and that is a rule rather
than an optimisation: it would be a fourth reading of the naming convention, free to drift
from the other three the moment the convention changed. A chart that disagreed with the
grid about what a scene is called is worse than no chart, because the band believes it.

A scene belonging to no song still gets a heading. The only way `songByScene` misses is a
name matching no pattern at all — in practice a scene Live named, which is to say one
nobody has named. A bare word like `soundcheck` is not that case: it derives as a
one-section song called SOUNDCHECK, exactly as the grid shows it.

## What a section is labelled

In order: its `[ROLE]`, then the song its name gives, then `Scene N`.

An empty row is the one thing this must not draw. A section you cannot name is still one
you are about to play, so the fallback chain ends somewhere that always answers.

## Where a fact is printed, and why it moves

**A fact is printed once, as high up as it is true.**

A song whose scenes agree on the key states it in the heading, and no row repeats it —
`Bm` down every row is noise hiding the one row worth seeing. A song that *modulates* has
no single key to state: `SongEntry.key` renders the disagreement as the collection
`Bm / D`. So the heading drops it and **every** section states its own, which is what makes
the row that changes visible against the rows that did not. bpm works identically, and a
song that speeds up is the ordinary case for it rather than an error.

`ChartSong.key` and `.bpm` are therefore **narrower than their `SongEntry` counterparts**:
`''` where the song has more than one. That is a deliberate departure from how the grid
renders the same clash, and the difference is what the two surfaces are for. The grid is an
editing surface, where a clash is something to go and fix, so it shows the collection. The
chart is a reading surface, where a song that modulates has not gone wrong.

The per-scene facts come from **`SetModel.factsByScene`**, which exists for this. `derive()`
always read a scene's role, key and bpm off its name; the model used to discard them, which
left every client that wanted them writing a regex of its own.

## Colour

Straight from `Scene.color`, and **null when `Scene.colorIndex` is -1** — Live documents a
scene's colour as nullable, and an uncoloured scene is not the same as one on palette slot
0. The band therefore reads the same colours it would see over your shoulder in Live.

The song's colour is `SongEntry.colorIndex` through `LIVE_PALETTE`, and -1 there covers both
"no colour" and "its scenes disagree". Neither is a colour to paint with.

## Vitals, credits, and the tempo that only sometimes appears

The key and the bpm are printed large under the song name, apart from the artist and the
tag. They are not the same kind of fact: those two are what you need to *play* the song,
and the other two are what it is filed under. Given one glance from a music stand, the
glance should land on the pair you can act on.

Either can be missing, and that is the section list carrying it — see the rule above. An
empty vital is a signal rather than a gap.

Live's **actual** tempo sits in the top line, and appears only when it is not already the
big number. When the band is playing the song at its label, printing both is the same
number twice; hiding it means its appearance says something — either the set is running
somewhere other than the label, or the song has no label to run against and this is the
only tempo there is. Both sides are rounded, because a set sitting at 100.02 is sitting at
100.

## What the rest of the top line says

In the order the answers stop being reassuring: no chart server, no bridge, waiting for
Live, stopped, live. They are distinct because the fixes are: the chart server is not
running, the device is not loaded, Live has not finished starting, nobody has pressed play.
A single "offline" would send someone to the wrong one.

## Not built

**Chord progressions.** The thing this is ultimately for, and the only part with nowhere to
live yet: no scene name, device parameter or clip property currently holds the changes. The
convention question comes before the code — whether they belong in a track of their own
whose clip names carry the bars, or in set-owned device state keyed by song. Both keep the
`.als` the complete record, which is the property that must not be given up.

**How long is this build.** `core/src/trackStatus.ts` already turns the playing clip into a
loop phase, a countdown or a bar count, and `watchStatus` is the watch that feeds it. It is
a third viewport watch and a frame several times a second rather than several times a song,
so it is a deliberate step up in traffic from what this module currently costs — which is
why it is not simply switched on.

**A song's structure before it is playing.** The section list is the current song's. Looking
ahead to the *next* song means a running order, which the set states but this does not read.
