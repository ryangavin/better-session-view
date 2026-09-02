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

## One line of facts, and the tempo that only sometimes appears

The artist, the tag and the key share **one line under the song name**, left aligned, with
the key leading it in the colour of the note it is built on and the credits trailing it in
quiet ink.

That colour is `keyColor`, and it is **absolute where the roll's are relative**. A note on the
roll is coloured by what it is doing in this song, so every song's root is the same red; the
key at the top is coloured by which key it *is*, so Gm is the same blue in every song that is
in it and a set looks the same on Thursday as it did on Tuesday. Two schemes on one screen,
answering two questions, which is why the key is text and the notes are blocks. A key the
parser cannot read a root out of is printed in plain ink — the roll's rule, since colouring
against a root nobody gave still looks deliberate.

The key was printed large with a caption under it once, on the principle that a glance from
a music stand should land on the fact you can act on. The principle is right; the row was
not the way to pay for it. A key is two characters, and the row it took is a row the wheels
and the roll were asking for — weight and colour say the same thing inside a line somebody
was reading anyway. The artist and the tag are what the song is *filed* under and nobody
plays off them, so they stay in the quiet ink they were already in and the key is the one
that is not.

Any of the three can be missing, and the line closes up around it. A song that states no
key of its own prints the key of the section actually playing, which is the rule above
finding its lower place now that the section list is off the screen.

Live's **actual** tempo sits in the top line, and appears only when it is not already the
big number. When the band is playing the song at its label, printing both is the same
number twice; hiding it means its appearance says something — either the set is running
somewhere other than the label, or the song has no label to run against and this is the
only tempo there is. Both sides are rounded, because a set sitting at 100.02 is sitting at
100.

## What the status dot says

The dot floats in the top-right corner rather than taking a row away from the chart. It is
green while Live is rolling and quiet grey otherwise. Its accessible label and browser
tooltip retain the exact state, in the order the answers stop being reassuring: no chart
server, no bridge, waiting for Live, stopped, live. Those states stay distinct because the
fixes are different: the chart server is not running, the device is not loaded, Live has not
finished starting, or nobody has pressed play.

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

### The shelf is a fixed size and the wheels fit into it

The wheels were a set size that wrapped when they ran out of room, and the problem was not
the wrapping — it was that the block **grew a line** when it did. Firing a scene with one
more track in it moved the roll, the tempo and everything else down the screen. On a phone
on a music stand, a layout that jumps is a layout somebody has to find again mid-song.

So the shelf is a fixed height whatever is playing, including when **nothing** is, and the
wheels size themselves to fill it. One row while a row's worth of width leaves them bigger
than half the shelf is tall; two rows after that.

That crossover is **not a track count**. It falls out of the shelf's own proportions: a
second row halves the height a wheel can use and doubles the width available to it, so
splitting early makes every wheel *smaller*. On a phone-width shelf it lands at eight, where
one row gives 36px wheels and two give 40px — and at five, the obvious "wrap when it gets
tight" rule would have traded 64px wheels for 40px ones.

Which means the shelf is **measured, not guessed**. A `ResizeObserver` on the list feeds its
width and height into the fit, because the same six wheels want one row in landscape and two
in a narrow portrait, and a breakpoint written in track counts would be wrong on one of
them.

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

## The bass roll

The bottom of the screen is the **bass track's clip, copied**. Time runs left to right
against the clip's own bar lines, pitch runs up a keyboard, and every note is where it was
played for as long as it was played. Nothing is worked out.

That is a reversal, and it is worth saying what it replaced. This drew a chord progression
first: every playing MIDI clip merged, drums judged out of it by the shape of their notes,
the result fitted to chord templates half a bar at a time and trimmed to where the labels
repeated. Each of those steps was a place the answer could be wrong while nothing was
broken — a melody note landing on a bar line renamed the chord under it, and quantising into
windows moved notes that had been played off the grid on purpose. On real material the roll
and the clip disagreed, and **a chart you have to check against Live is one nobody reads**.

The part was written down the whole time. So this reads it.

### Which track is the bass

**The one with `bass` in its name**, case-insensitively, anywhere in it — `Bass`, `SUB BASS
808`, `bass gtr`. First match in Live's own track order, so a set with `Bass` and `Bass Sub`
reads the one further left.

A name, rather than a guess from the notes. Lowest average pitch, most sustained, fewest
simultaneous notes — every version of that picks the wrong track on some song, silently, on
stage, and leaves nobody anything to fix. A name is a convention this project already uses
for songs, keys and roles, and it is a thing somebody can correct in a second.

The cost is that a set with no track called bass gets no roll. That is the same shape of
answer as a scene with no key in its name: the fix is in the set, and it takes a rename.

### The loop, not the clip

Live plays a looping clip's loop bracket and nothing else, so a note before `loopStart` or
after `loopEnd` is one nobody in the room will hear — drawing it would put material on the
chart that never sounds. A note starting inside the loop and running past its end is kept
and cut off there, which is exactly what Live does to it.

Times go on the wire **relative to the loop's start**, because that is what the roll is
drawn from, and doing the subtraction once on the server beats doing it per note on the
oldest phone in the room.

### The keyboard is one octave, sitting on the open E

**Twelve rows, and the bottom one is an E** — a four-string's open E, the bottom of the
instrument. Every note in the loop is folded into those rows by whole octaves, up from under
the bottom row or down from over the top, and never clamped to an edge: a clamp changes what
the note is, and a run of clamps flattens a line into a bar along the top.

The rows hold still, and that is the point. Somebody reading a song they have never played is
learning the roll and the song at once, and a keyboard that moves between songs is one they
have to re-read every time the set moves on. It sat on the **part's lowest note** before
this, which drew a part that fitted inside an octave exactly where it was played — a real
property, and worth less than a bottom row that means something. The cost is the other way
round now: a line whose lowest note is not an E wraps where it used to sit still.

It was two octaves of real pitches before that, and that drew an honest picture of a part
while spending most of a phone screen on the gap between the two notes furthest apart in it.
What gets read off a chart is which note comes next, and that is the same note in any octave.

### Which E, when a clip is written an octave out

The pitch is `FOUR_STRING_E` in [`server/bassline.ts`](../server/bassline.ts) — the open E as
this set's clips write it, and the file's **only rig constant**. Nothing in a clip says what
instrument plays it or how that instrument is tuned, so this is the one question a chart
cannot answer from the notes. Retune or re-record and it is one line to change.

Clips do get written an octave out, though, so the answer has to survive it — and the two
directions are not the same question. A part sitting **above** the open E is playable where
it is, whichever octave somebody typed it in, so the fixed pitch is already the useful reading
of it and nothing moves. A part sitting entirely **below** it is playable nowhere as written,
and reading that against a fixed pitch would mark every note in it: a roll of dots, saying
nothing. So the E follows the part down and never up.

What says when to move is the part's **highest** note, not its lowest: the lowest note is the
one under question, and letting it choose the E would be letting every part declare itself in
range.

### The dot is where the fourth string runs out

A note that sounds **below the bottom row** gets a small dot and is drawn an octave up, where
it can be reached. It says *this line was written for five strings, and here is how you get
away with it on four*.

The two questions were separated once, and it is worth saying why they are one again. The
first version drew the dot on anything below the roll's bottom row while that row was found
from the part — so a line in D minor an octave *above* the low E had the window snapped to
the E above its lowest note, which threw its D and its Eb over the top and marked them. Notes
anybody can play, on a bass tuned however they like. The fix at the time was to ask a fixed
pitch and let the layout disagree with the mark. The row **is** that fixed pitch now, so
there is nothing left to disagree: below the bottom row and below the open E are the same
sentence, and the octave a note is drawn up into is the octave it has to be played in.

A note wrapped *down* from the top carries nothing, because anybody can play it where it is
drawn — the user's rule, and the right one: the mark is about the part, not about the roll's
compromises. An earlier version marked every fold, drawn as a fade, and both halves of that
were wrong. Marking a fold that costs the player nothing is a chart talking about itself, and
**nothing on this roll varies a note's opacity**, because a piano roll that dims a note reads
as velocity to everybody who has used one. This roll does not draw velocity at all.

### Colour is the degree, text is the note

A block's **hue says what the note is doing in the key** — root, fifth, flat seventh — and
the **letter on it says what to play**. Two different questions, and a bass player asks
both: one to learn the shape of a song, the other to get through the next bar.

The scheme is the rainbow over the seven notes of the scale, with each accidental the blend
of the two it sits between — 1 red, 3 yellow, 5 blue, 7 violet. It lives in
[`core/src/chords.ts`](../../core/docs/chords.md) with the table, and with the version that
went round the circle of fifths first and why it was worse.
What matters here is that it is **the same twelve colours in every key**: the root of a song
in Gm is the same red as the root of a song in D, so somebody who has learned the scheme
reads function without being told the key. The root note also gets a ring round it, because
the root and the fifth are the two most-read degrees and they land a step apart in hue.

The key comes from the set, through `keyRoot`. **A song whose scenes state no key gets no
colouring** — the roll falls back to the track's own colour in Live. That is deliberate: a
roll coloured against a root nobody gave is worse than a plain one, because the colours
would still look deliberate.

Names go on the blocks that are wide enough to hold them, which is about five percent of the
roll's width. The threshold is in **percent rather than beats**: the same eighth note is
legible in a four-bar loop and a smear in a sixteen-bar one, so what decides is the width it
is actually drawn at. A block too narrow to label is still the right colour in the right row,
and the gutter is what names it.

**Every white key is labelled** in that gutter, not only the Cs. Ableton labels the Cs
because its roll scrolls and spans the whole keyboard; this one is twelve rows read across a
dark stage, and counting up from the nearest C is exactly the work a chart exists to remove.
The black keys stay blank — their names are the two-character ones, and the pattern beside
them already says which is which. **No octave numbers**, because the roll is one octave and
which one it is is not a fact anybody plays.

### The roll is shared; the reading is not

The rows, keyboard, note geometry, bar and beat ruling, label fit and movable playhead are
`@openflow/widgets/notation/PianoRoll.tsx`. This app still owns every musical judgement:
which octave arrives on the wire, how a note is spelled, its degree colour, the root ring
and the fifth-string dot. It maps those answers into a display widget that knows nothing
about Live, clips, keys or tracks. mix[flow]'s tablature uses the matching boundary, so the
two notation views can evolve as one design without either app importing the other's
domain.

### Reading it

Notes are a **read, not a watch** — the LOM has no event for a clip's contents that would
help — so the ask goes out when the *playing clips change*, which is exactly when the part
can have changed and never while a loop merely goes round. The cost is the one staleness in
the whole client: editing the MIDI of a clip that is already running does not update the roll
until it is relaunched. Noticing would mean re-reading every playing clip on a timer, and a
roll that lags an edit by one relaunch is the better trade.

It draws nothing rather than drawing an empty grid. No bass track, no clip in it, an audio
clip, a loop bracket with no notes inside it — all clear the roll, because an empty roll
looks like a bug and no roll looks like no roll.

The playhead is extrapolated from the loops anchor like everything else that moves, and it
spans the grid with its left border rather than being a two-pixel bar — a percentage
translate resolves against the element's own width, so a thin one moves a pixel and a half
across the whole loop, which looks exactly like a playhead that was never wired up.

## Not built

**Chords for everybody who is not the bass player.** The roll is one track, and the keys
player's question — what is the harmony — is a different one. The inference that used to
answer it still exists in [`core/src/chords.ts`](../../core/docs/chords.md) with its tests
and no caller. What it needs before it comes back is somewhere to be *right*: a set that
wrote its changes down would need no inference at all and could never disagree with itself.
The convention question comes before the code — whether they belong in a track of their own
whose clip names carry the bars, or in set-owned device state keyed by song. Both keep the
`.als` the complete record, which is the property that must not be given up.

**When the loops line up.** Each wheel says where its own loop is; nothing says when the
long one comes round, which is the question "when do I drop" actually asks. The arithmetic
is small — the tracks share a tempo, so their phases are comparable — but what to *show*
is not obvious, and a wrong answer here is worse than none.

**A song's structure before it is playing.** The section list is the current song's. Looking
ahead to the *next* song means a running order, which the set states but this does not read.
