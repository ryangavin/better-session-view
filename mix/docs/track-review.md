# Checking a song's grid

`components/BeatGridEditor.tsx` is the product's one place for asking whether the song
is right, and it sits over the real mixer lanes as a mode — **Grid** in the header —
rather than on a page of its own. It starts with the saved beat map, including
irregular edits, and holds a draft apart from it until Done.

**Find beats** runs the chosen algorithm on the drums — `OFFERED`, with `FIRST_CHOICE`
preselected, which is exactly what an import runs — and makes the result the draft:
drawn over the saved grid in the warp lane, auditioned with the click, undone with
Undo. **Advanced…** opens the debug workspace on the beat analysis for the full
comparison. **Bar 1 here** renumbers so the beat nearest the playhead is bar 1, and
moves nothing. The handles, renumbering, nudges and the steady-grid replacement are as
[window.md](window.md) describes.
**Listen with click** plays four bars of drums at original speed from the playhead,
through `reviewPlayback.ts`, which schedules audio and clicks against one AudioContext
clock; a correction or main playback stops it.

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
