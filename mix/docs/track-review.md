# Reviewing a song

`components/TrackReview.tsx` is the product view inside **Analyze**.
It starts with the saved beat map, including irregular edits. Opening it measures
waveform energy and stem activity, but does not run beat detection or write anything.
Candidate plots, band toggles and accuracy scoring stay in Debug; the product exposes
three explicit beat-analysis choices for generating a review draft.

`ReviewTimeline.tsx` owns one graph, with a shared `useAxis` window from the full song
to 20 ms. Individual stems open as aligned lanes. Above eight seconds, each lane uses
RMS power aggregation, scaled to its own track-wide maximum; these heights aid reading,
not comparison of absolute stem loudness. At eight seconds or closer, lanes read actual
sample extrema across all channels on the same amplitude scale. With stems hidden, the
whole-song view retains measured mix RMS with broad spectral color and a pink vocal
activity strip; close detail uses drums. Measurement uses decoded channel references and
cancels on unmount without copying entire buffers.

First downbeat, Middle and Near end frame four seconds on this same axis. Whole song
restores the complete range. Zoom buttons and +/− anchor at the listening position;
Shift/Ctrl/Meta-scroll zooms at the pointer, ordinary scroll pans. Beat ticks become
visible as space permits. The first downbeat remains explicitly labeled.
Click or drag the white cursor, or use arrow keys (10 ms; Shift 100 ms; Home/End for
view edges). The three-decimal Listen from readout describes that cursor. Moving it
changes the listening position, never beat samples.

**Listen for 4 bars** plays original-speed audio from the exact cursor, for sixteen mapped
beats, capped at the file end. Choose the full song or any individual stem, with an optional metronome. `reviewPlayback.ts` schedules audio and clicks against the same
AudioContext clock. Stop, edits and unmount cancel all voices and scheduled clicks;
a pending audio-context resume cannot restart playback after unmount. The shared timeline
follows playback as the head leaves it. This is an audition, not the warped mixer or a
seamless-loop implementation.

## Detection previews and manual editing

Analyze proposes results; the main mixer edits their timing. There are no manual nudges,
bar-1 placement or editable beat handles on Analyze. Its cursor is only a listening position.
**Run beat analysis** generates a local draft using the chosen Beat algorithm:
Transient follower uses the production transient/fit/follow pipeline with an even-fit
fallback; Steady tempo uses the same fit without following; Spectral flux follower uses
frequency-change onsets with the existing fit/follower and even-fit fallback. Choosing an
algorithm does not run it or change the default import algorithm. Failure leaves the
current result intact. **Compare saved grid** overlays saved bars as cyan dashed lines
against the proposed gold bars at close zoom. The audition metronome follows the proposal.

**Apply analysis & return** explicitly replaces the saved beat map if there is a beat
preview, including previous manual corrections. The preview explains this before applying.
**Discard beat preview** restores the exact map Analyze opened with. **Back to mix** discards
all proposals. Sections replace saved cuts only through their separate opt-in. Metadata
retains immediate-save behavior; separation is a separate explicit action below the review.

**Edit beat grid** in the main header opens `BeatGridEditor.tsx` above the actual mixer
lanes. Beat handles appear only in this mode, independently of the Warp playback switch.
The existing transient strip and subtle grid stay visible during normal mixing. Marker
arrows move a beat 10 ms, or 1 ms with Shift; dragging snaps to nearby hits unless Option
is held. Set bar 1 shifts all samples to the playhead; One beat earlier/later renumbers
without moving samples. Nudges shift the complete map 10 ms. Replace with a steady grid
explicitly discards tempo variation at the entered BPM. First downbeat frames four seconds
on the main axis. Listen with click auditions four bars of drums at original speed; main
playback or a correction stops that audition.

`beatEdit.ts` holds the draft apart from saved `beats` and `offset`. The drawing and mixer
read the draft, but library/session persistence reads only the saved state. **Undo** restores
one action, grouping each pointer drag into one step; Command/Ctrl-Z does the same.
**Cancel** (or Escape) abandons the draft, and **Done** commits it through `saveReview`.
Switching tracks or reloading abandons unfinished edits. Done with no edits preserves the
original map and detector reading. Automatic section generation uses the saved map during
editing, and section mutation gestures, Analyze and Export are unavailable until Done or
Cancel. The header tempo controls playback and preserves source beat positions, including
when materializing a previously even fallback map.

Select, Toggle, NumberField and Button are shared widgets; the editing toolbar contains
mix-specific actions and belongs in this module.

## Section suggestions

`sections.ts` computes per-bar RMS from the measured mix and each stem, using the draft
map to place samples into bars. It compares four bars before and after each potential
change. The mixture needs a 1.8× level ratio and a 20% change relative to its peak bar;
vocals need 2.5× and 22%, other stems 3× and 40%. The change must hold on at least three
of four bars on both sides. Sources peaking below 0.008 RMS are ignored. These are
heuristics for sustained contrast, not a calibrated confidence score or semantic model.

Local peaks are selected before rounding to four- or eight-bar phrases, so one change
between two phrase boundaries is not offered twice. Cuts are relative to bar 1 and leave
at least one phrase at each end. Reasons describe energy or stem arrivals/recessions;
labels do not claim to know intro, verse or chorus. Short fills, very gradual changes,
quiet vocal passages, bleed and inaccurate grids remain limitations.

Suggestions are numbered buttons on the graph. Selecting one moves the listening cursor
and opens contextual actions below; a selector also reaches markers hidden by zoom or
crowding. Listen to change starts one second before the boundary and plays four bars;
Inspect change frames four seconds around it. Dismiss removes it from this draft. No
sections are replaced automatically. **Use these sections when applying** opts into replacing
existing cuts and names with Section 1, Section 2, etc. Otherwise existing cuts remain.
Changing the grid or phrase spacing clears that opt-in so stale proposals cannot be kept.
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
