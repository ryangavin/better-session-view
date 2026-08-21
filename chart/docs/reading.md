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

A song whose scenes agree on the key states it in the heading. A song that *modulates* has
no single key to state — `SongEntry.key` renders the disagreement as the collection
`Bm / D` — so the heading takes the key of the **section actually playing** instead, which
is the more useful answer on a stage anyway: what you need is the key of the part you are
in, not the set of keys the song visits.

bpm needs no equivalent, because the big number is Live's own tempo and is therefore
always the tempo of what is sounding right now. The song's *labelled* bpm appears beneath
it only when the two disagree, which is the same rule applied to a fact with two sources
rather than two levels.

The payload still carries this per section, and the section list still computes it. That
matters even while nothing draws the list: `now.key` is populated by exactly the rule that
fills the rows, so the heading's fallback is not a special case bolted on — it is the same
question asked of one section instead of all of them.

`ChartSong.key` and `.bpm` are therefore **narrower than their `SongEntry` counterparts**:
`''` where the song has more than one. That is a deliberate departure from how the grid
renders the same clash, and the difference is what the two surfaces are for. The grid is an
editing surface, where a clash is something to go and fix, so it shows the collection. The
chart is a reading surface, where a song that modulates has not gone wrong.

The per-scene facts come from **`SetModel.factsByScene`**, which exists for this. `derive()`
always read a scene's role, key and bpm off its name; the model used to discard them, which
left every client that wanted them writing a regex of its own.

## The section list is computed and not drawn

`chart.ts` still builds `song.sections`, and nothing renders it. Squeezed into a rail
beside the tempo it was too small to read and too wide to spare, and what it cost was the
room the two things you act on need — the tempo, and how far round each loop is.

It is kept in the payload rather than removed because the projection is the tested,
documented part and the display was the part that did not earn its space; putting it back
is a component, not a redesign. The one thing that had to move with it is the key, above.
**If it stays unread it should come out**, protocol and tests together — a payload field
nothing has read for a while is one nobody will trust when they do.

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

## The wheels

The bottom half, and the reason the section list is not competing for it. One per track
with something playing in it, in **track order** — not sorted by loop length.
The longest loop is the structural one and the temptation is to float it to the top, but
these are read at a glance against a stage where the tracks are in Live's order, and a list
that reorders itself whenever a clip changes is one nobody can find anything in twice.
Which loop is the long one is legible from its bar count.

A **ring**, where the grid draws a filled pie. That pie is justified at ten pixels across,
where a ring is all stroke and its two ends sit a pixel apart at every phase but the first
and last. At this size there is room for the ring to read from a music stand *and* for the
bar count to sit inside it, which is the pair of facts somebody counting bars needs: how
far round, and how far round *of what*. A four-bar loop and a sixteen-bar loop are the same
arc at the same phase.

The count is `loopBars` from `core/`, which is where the arithmetic and its tests live —
including the rounding that stops a loop the LOM reports as 7.999 beats becoming a one-bar
loop. A clip that isn't looping fills once and shows a countdown instead; one being
recorded into shows its length so far. A group track is left out, because it carries no
clip of its own and would be a second wheel turning in lockstep with the ones beneath it.

## The tempo, and the two buttons

The big number is what **Live is actually running at**, not what the song's name claims,
because that is what the buttons change. The name's bpm appears beneath it only when the
two disagree — which is the same rule as everything else here, applied to a fact that has
two sources rather than two levels.

It takes the room it does because it is the display *and* the control. A band nudging a
tempo needs to hit the target without looking and read the result from across a stage, and
a big number flanked by two big buttons is one object doing both jobs rather than a readout
with controls parked somewhere else.

What a phone may send, and what stops it being a way to wreck a set, is in
[following the bridge](following.md).

## Not built

**Chord progressions.** The thing this is ultimately for, and the only part with nowhere to
live yet: no scene name, device parameter or clip property currently holds the changes. The
convention question comes before the code — whether they belong in a track of their own
whose clip names carry the bars, or in set-owned device state keyed by song. Both keep the
`.als` the complete record, which is the property that must not be given up.

**When the loops line up.** Each wheel says where its own loop is; nothing says when the
long one comes round, which is the question "when do I drop" actually asks. The arithmetic
is small — the tracks share a tempo, so their phases are comparable — but what to *show*
is not obvious, and a wrong answer here is worse than none.

**A song's structure before it is playing.** The section list is the current song's. Looking
ahead to the *next* song means a running order, which the set states but this does not read.
