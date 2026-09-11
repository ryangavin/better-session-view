# Checking a song's grid

`components/BeatGridEditor.tsx` is the product's one place for asking whether the song
is right, and it sits over the real mixer lanes as a mode — **Grid** in the header —
rather than on a page of its own. It starts with the saved beat map, including
irregular edits, and holds a draft apart from it until Done.

Its toolbar is one row of named groups — `find`, `bar 1`, `tempo`, `check`, then Undo
and the way out — in the header's own `mf-group` and `mf-group-label`, which is how
Serato groups a grid editor (marker, adjust, slip, save) and how the header beside it
groups snap. It was ten buttons of near-equal weight over two rows with a paragraph
under them, which put **Find beats** next to **Cancel** and explained the drag in prose
that the markers were already carrying in their tooltips. The prose is gone and nothing
it said is: a marker's tooltip says what dragging it does, the ruler's dashed marks say
they are cuts to click, and Space and Home are on **Worst bar**, the button a person
checking a grid already has a hand on. **Enter** keeps and **Escape** abandons, as
Serato's does, and both stand off a focused control — a button, a field, an open menu —
because that control's own Enter is the one it was meant for.

The status inside the `tempo` group is the draft's own reading, live: its tempo as `rangeText`
gives it — one number for a steady map, `126–131` where it bends — and the share of
its beats with a kick or snare within 25 ms, `beatsOnHit` in `warp.ts` bisecting
`state.hits` per beat, over the beats between the first hit and the last. Beats with a
hit rather than hits on a beat, because a syncopated kick is the music and not the
grid's error: read the other way a hip-hop record scored a quarter with its grid dead
on, and a spoken intro must not count against a grid ruled through it. It moves with every drag, renumbering and
re-finding; it used to say *As saved* or *Changed*, which Done being primary and Undo
being enabled already say. The header keeps its tempo readout through the mode — the
same draft, so the same number — and drops the last fit's agreement from its tooltip,
because that fit measured a grid this may no longer be.

**Find beats** runs the chosen algorithm on the drums — `OFFERED`, with `FIRST_CHOICE`
preselected, which is exactly what an import runs — and fits its evidence into the
[musical grid](musical-tempo.md) before making it the draft:
drawn over the saved grid in the warp lane, auditioned with the click, undone with
Undo. The **▾** beside it is where the choice lives, a `Select` drawn as the caret
alone: the offered algorithms with the chosen one marked, and **Advanced…** last, which
opens the debug workspace on the beat analysis for the full comparison. Both stood on
the main row before — a picker, and a button beside it — asking every person who opened
the mode a question only somebody debugging a detector has; behind the button that runs
them they are there for whoever wants them and silent for everybody else. **Here** in
the `bar 1` group makes the beat nearest the playhead bar 1, landing it on
the kick or snare it is nearest first — `hitUnder` in `warp.ts`, a hit within a
quarter of the beat's own spacing, then `moved` so its neighbours hold and it is a set
beat, then `renumbered`. With no hit that close it only renumbers, and Option renumbers
without moving. This is what Serato, Traktor and Rekordbox mean by setting the
downbeat; a beat 5 ms off its kick used to be left for a ±10 ms nudge that could not
make 5. **‹** and **›** beside it renumber by one beat either way and move nothing —
what *One beat earlier* and *One beat later* were, a marker apiece now that they are
in the group whose name says what they count.
The markers and dragging are as [window.md](window.md) describes; the marker
edits are `warp.ts`'s `pulled` for a bar, `moved` for a beat and `shifted` for a
⌘-drag, and the map's `set` list is what lets a pull know where to stretch from. The tempo in the status is also where a steady tempo is typed: click it and it
becomes a field; a committed number rules `evenBeats` from bar 1's downbeat, which
discards the detected variation on purpose, and Escape or blur brings the reading back.
That replaced a *Replace with a steady grid* disclosure with its own BPM field, which
was the only tempo gesture before a bar could be pulled. Beside the tempo, **×2**,
**÷2**, **×3⁄2** and **×2⁄3** re-count the same beats through `retimed` — a beat
interpolated between every two, every other beat from bar 1, three across every two,
two across every three — so the detector's documented miss, the wrong pulse by an
octave or by 4:3, is one click that keeps the variation it detected rather than a
typed tempo that rules it flat; bar 1 stays on its hit, and the reading beside them
says at once whether the kit agrees with the new count.

**Worst bar** goes to where the grid goes wrong rather than leaving it to be looked
for. `barsOff` in `warp.ts` reads every bar from bar 1 on that has a hit in it, over its
beats between the first hit and the last: the median distance of its beats from the hits
they were meant for — `hitUnder`'s quarter of a beat — and the share of its beats no hit
confirms, scored by whichever is worse. The score is relative: the distance counts only
past the median bar's, twice the status's 25 ms being wholly off, because a map five
milliseconds late everywhere is one nudge and not a hundred bad bars; and only more than
one unconfirmed beat in four counts, because a syncopation is not a mistake — read
absolutely, a right grid on a hip-hop record painted a third of its bars as wrong. The
median, so one wild beat does not condemn its three good neighbours; bars with
no hit in them left out, because a breakdown is no evidence against the grid ruled
through it and would otherwise be the worst bar of every record that has one. The warp
lane shades each bar along its bottom edge by that score, in the danger role, so eight
wrong bars in the middle of a good song are a stripe rather than a search through a
hundred and twenty; the button seeks and zooms to the bar scoring highest — `worstBars`,
those at half or more, the single worst failing that — and each press goes on to the
next-worst, round again after the last, starting over when the grid changes because the
bars have been re-read. `Lanes.tsx` reads it once per change to the draft and hands it
to the lane and the editor, so the stripe and the button cannot disagree. This is what
Rekordbox and Traktor users do with a grid — find where it walks off the kit, fix it
there — and a 24 px strip across the song was nothing to find that with. It stands where
**First downbeat** stood, which zoomed to bar 1; Home does that now.

**Space** plays the drums under a click, at original speed, from the playhead to the end
of the stem, and Space stops it — the way Traktor's beat tick and Rekordbox's metronome
run with the deck, where a *Listen with click* button used to play four bars and fall
silent, which checked a grid at its start and never where it drifted. Original speed is
deliberate: the click is a test of the beats, and against warped output it would test
the pins. `reviewPlayback.ts` schedules the drums and every click up front against one
AudioContext clock, so a throttled window cannot starve the clicks and all of it stops
together; its `head` is read once a frame and drives `seek`, so the lanes' own playhead
moves with it and the view pages after it as for real playback, and Here lands bar 1 on
the bar just heard. A correction stops it, because its clicks were scheduled against the
grid it started on; so do main playback, Cancel and Done. `App.tsx` leaves Space to the
editor while the mode is open, so outside it Space is still the transport.

The section suggestions below are drawn on the ruler while the mode is open, on
whatever beat the change falls, and kept with a click. Nothing is applied until Done.

## Section suggestions

`sections.ts` computes per-beat RMS from the measured mix and each stem, using the draft
map to place samples into beats. It compares a phrase — four bars — before and after
every beat. The mixture needs a 1.8× level ratio and a 20% change relative to its peak;
vocals need 2.5× and 22%, other stems 3× and 40%. The change must hold on three beats
in four on both sides. Sources peaking below 0.008 RMS are ignored. The tempo the map
runs at is read the same way: a median tempo that moves by 3% or more across a beat is
a section change on its own — *Tempo rises*, *Tempo falls* — because a steady section
is what loops and a ramp is where two of them meet. These are heuristics for sustained
contrast, not a calibrated confidence score or semantic model.

**A section starts on whatever beat the change is on.** Nothing is snapped to a lattice
from bar 1: a vocal arriving on the third beat of bar 33 is offered at 33.3. What keeps
one change from being offered four times is that a candidate must be the strongest
within two bars of itself. The import-time detector in `slices.ts` works the same way,
on the drawn peaks, and its cuts may fall on any beat too. Reasons describe energy,
tempo or stem arrivals/recessions; labels do not claim to know intro, verse or chorus.
Short fills, very gradual changes, quiet vocal passages, bleed and inaccurate grids
remain limitations, and a tempo change is only as real as the grid that reports it.

Suggestions are numbered buttons on the graph. Selecting one moves the listening cursor
and opens contextual actions below; a selector also reaches markers hidden by zoom or
crowding. Listen to change starts one second before the boundary and plays four bars;
Inspect change frames four seconds around it. Dismiss removes it from this draft. No
sections are replaced automatically. **Use these sections when applying** opts into replacing
existing cuts and names with Section 1, Section 2, etc. Otherwise existing cuts remain.
Changing the grid clears that opt-in so stale proposals cannot be kept.
The legacy automatic mixer sections remain the default until the user keeps suggestions.

`state.saveReview` commits exact samples and optional section cuts using the existing
per-track persistence. Changed grids clear the detector reading rather than attaching an
old confidence to a new map. Saving an unchanged grid preserves its detector reading.
Saved suggested sections become manual cuts and are not regenerated on reopen.

## Product references

The design takes the audible grid-check workflow and reset behavior from the
[Traktor overview](https://docs.native-instruments.com/ni-tech-manuals/traktor-pro-manual/en/traktor-overview)
and [grid-editing tutorials](https://docs.native-instruments.com/ni-tech-manuals/traktor-pro-manual/en/advanced-usage-tutorials).
The vocal strip draws on [Rekordbox's overview](https://rekordbox.com/en/feature/overview/),
which displays detected vocal positions above the full waveform. These inform the
interaction; the detector and color mapping here are our own heuristics.
