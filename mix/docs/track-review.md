# Reviewing a song

`components/TrackReview.tsx` is the product view inside **Analyze**.
It starts with the saved beat map, including irregular edits. Opening it measures
waveform energy and stem activity, but does not run beat detection or write anything.
The diagnostic algorithms, band toggles, candidate plots and scoring stay in Debug.

The overview shows measured mix RMS colored by broad spectral energy, with a pink
vocal-activity strip. This uses `debug/waveforms/measure.ts` on decoded channel references,
with cancellation on unmount; it does not copy entire buffers. The detail waveform reads
the actual drum samples. The first downbeat has an explicit label; first/middle/end
buttons and clicking the overview move the detail window. The overview also marks the
visible detail range. The drum waveform itself owns a white cursor: click or drag it,
or focus it and use arrow keys (10 ms; Shift for 100 ms; Home/End for view edges).
The three-decimal Listen from readout describes the same cursor. There is no second
slider below the waveform. Moving the cursor changes the listening position, not beat samples.
The cursor uses the palette's `--fg`; `--text` is not a palette token and made it invisible.

**Listen for 4 bars** plays original-speed audio from the exact cursor, for sixteen mapped
beats, capped at the file end. Full song/drums only and a metronome are the
only listening choices. `reviewPlayback.ts` schedules audio and clicks against the same
AudioContext clock. Stop, edits and unmount cancel all voices and scheduled clicks;
a pending audio-context resume cannot restart playback after unmount. The detail view
follows playback as the head leaves it. This is an audition, not the warped mixer or a
seamless-loop implementation.

Correction is an inline disclosure. Set bar 1 shifts all samples to the selected time;
one beat earlier/later renumbers the map while preserving sample positions. Nudges shift
every sample by 10 ms. Typing a steady tempo explicitly replaces tempo variation with an
even map. **Reset grid to automatic** reruns the production transient/fit/follow pipeline,
with a straight fit as fallback. Failure keeps the previous draft. **Discard grid changes**
restores the exact map the page opened with. Every operation remains a draft until Save;
leaving analysis discards it. Back and Save share the top heading, along with draft status;
there is no footer. Stems and metadata follow the review in the same scroll area, so
visiting those controls does not unmount the draft. Metadata retains its immediate-save
behavior, and separation remains a separate explicit action. New imports show source
setup in that same page until decoded stems are available.

Select, Toggle and NumberField come from the shared widget package. Panels use the
palette's small radius and status text uses a plain divider rather than pill badges.

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

Each suggestion has a Listen action that starts one second before its boundary, shows that
passage in the drum detail and plays four bars. Dismiss removes it from this draft. No
sections are replaced automatically. **Use these sections when saving** opts into replacing
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
