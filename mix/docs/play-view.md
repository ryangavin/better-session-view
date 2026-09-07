# Prep and Play

`src/play/` mounts the controlled widgets mixer inside mix. `App.tsx` owns the mode,
keeps `Library` mounted in either mode, and keeps the preparation page mounted but hidden
while Play is shown. `useMixerViewModel` stays mounted above that switch, so deck loads,
knobs and selections survive round trips. Mode and deck assignments last for this window
session, not across reloads.

Click the mix[flow] logo or press plain Tab to switch. The logo fills with primary in
Play and returns to its normal appearance in Prep. Tab inside a text field, slider,
combobox, editable area or dialog keeps normal focus navigation; modifiers, Shift+Tab,
held repeats and already-handled events do not switch views. Prep keyboard playback and
section-edit shortcuts are inactive in Play. The same header transport and Link/Local audio controls remain available in Play;
they continue to control the existing single-track engine. Track editing, Snap, Analysis
and Export are omitted from the Play header. Switching views does
not secretly pause, start, reload or alter that engine.

## Loading a deck

Library buttons are draggable with `application/x-openflow-library-track`, containing
only the track ID. Each deck strip and its waveform row accept that payload, highlight
the target, then ask the app adapter to load it. The ID must be in the current library;
no filesystem path from a drag is trusted. An internal drag does not select/change the
preparation track or enter the existing file-import flow. External file drops retain
the app-wide import behavior.

Deck loading is drag-and-drop only, including replacement of loading or failed decks.
A new drop replaces that deck, leaving the others alone. Per-deck AbortControllers cancel
fetches and guard late decode/analysis results. A library-folder change aborts everything
and clears the face; unmount also cancels outstanding work. Failure is visible on the
deck and another drop retries.

`loadDeckAsset` reads saved analysis and the original file through existing library APIs.
An OfflineAudioContext decodes just for peaks: it has no speaker connection and no live
transport. The buffer is not retained. The first 32 bars are sampled through the saved
beat map (or the saved uniform grid), so the shared ruler has a real meaning. No saved
grid means an empty waveform plus a preparation message, not an invented 124 BPM grid.
Unknown BPM/key remain unknown. Section names and boundaries are read from the saved
analysis; duplicate names have distinct IDs. Without saved sections, Track is an explicit
whole-track choice. Reload a deck after changing its saved preparation data.

The four standard stem positions remain recognizable; six-source tracks add guitar and
piano rather than silently dropping them. Unavailable stems are disabled. Unseparated
tracks begin in Full mode. Longer section lists scroll within the launcher; wider stem
sets may require horizontal scrolling. The shared sidebar is not collapsed to force a fit.

## UI controller, not an audio engine

This is still the approved UI integration pass. The header says playback is not connected.
The master omits its duplicate Run/Stop, tempo, quantization button and beat counter
because the shared header supplies transport. Deck loop capture remains disabled; frame
readings and meters stay zero.
Each deck now has square Play/Pause and transport Cue buttons below its routing row;
these also remain disabled until the playback controller supplies their commands.
Headphone monitoring is labeled Phones. The master has only a slim crossfader in the
bottom area, with no deck transport buttons.
The master has two effect slots with host-defined parameter pairs: Delay/Echo feedback
and tone, Reverb decay and tone, Chorus rate and depth, Flanger rate and feedback.
Values persist independently by slot, effect and parameter for this window session.
These are UI ranges, not a DSP implementation. Status messages sit below launchers so
all column headings stay aligned.

Knobs and section choices hold local UI settings. They do not schedule sound or send
commands to preparation playback. No fixture clocks, invented meters, bench songs or
bench imports ship with mix.

A future playback controller can drive this hook's command implementation and readFrame
contract. It needs explicit ownership of track buffers, independent stem section starts,
master/FX routing, measurement, tempo and scheduling. Four copies of useMix are not that
controller. The existing single-track audio and Link implementation are unchanged.

## Verification

The Play tests exercise real sidebar drag payloads through the rendered deck drop target,
invalid IDs, rapid replacement races, library changes, retry after failure, six-source
identity and safe Tab handling. Browser checks cover logo/Tab switching, retained deck
state and real library waveform/section loading. Native touch dragging still needs device validation.
