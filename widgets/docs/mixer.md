# Controlled mixer face

`src/mixer/MixerView.tsx` is the reusable four-deck presentation. Import it through
`@openflow/widgets/mixer/MixerView.tsx`; `model.ts` defines its host contract. It composes
existing controls and waveforms, and imports no app, protocol, core or playback code.

## Ownership

The host supplies `state`, `commands`, `readFrame`, `theme` and `params`. The component
has no authoritative musical state. It never advances playback, applies quantization,
chooses the first section on a source change, computes gain, or clears clips on Stop.
It renders supplied selections and pending states, and emits intent using stable IDs.
The host can acknowledge immediately, queue, reject, or report loading without the
component inventing a successful result.

- `MixerState` contains deck metadata, available stems, sections, selected/queued IDs,
  control values, transport labels, loop bounds, effects and their IDs. Deck status is
  empty/loading/ready/unavailable. Non-ready launcher fieldsets are disabled, and missing
  stems disable their individual launch/stop/level controls. Full is disabled unless
  the deck is ready with at least one host-reported available stem; original-only
  playback remains controlled independently by Play. The host supplies four deck
  positions, a variable number of stem positions per deck, and three EQ values; unavailable stems retain
  a placeholder position. Section counts and names can vary between decks.
- `MixerCommands` contains semantic operations, not React setters. `launch(deckId,
  sectionId, stemId?)` uses null for stop, an omitted stem for a whole-deck hot cue, and a stem ID for
  a section loop. Source
  changes send only `setDeck(id, 'full', value)`; all initialization policy belongs to
  the controller. An effect is selected by ID, even though Select displays an index.
- A selected section is an ID or null. A queued value is undefined for no pending
  change, null for a queued stop, or a section ID for a queued launch. These distinctions
  must survive the adapter; do not collapse null and undefined with `??` there.
- `MixerParams` supplies ranges, units, defaults and tapers. The host maps widget values
  to its engine units; the preview's 0–100 levels and synthetic gain law are not an
  engine specification. EQ fills explicitly originate at zero. Optional `stemLevel` separates stem defaults from channel-fader defaults.
- `MixerTheme` supplies resolved CSS colors keyed by stem/deck IDs, plus primary and
  signal colors. Tokens are scoped to the mixer root. The component never writes to
  body, storage, or another window's palette.

Optional `deckProps(id)` supplies host drag/drop handlers to the strip and waveform
row. These remain outside the disabled launcher fieldset, so empty/loading/error states
can accept a replacement. The widgets never interpret a library payload. Unknown track BPM is null.
`playbackAvailable: false` disables Run, launch quantization and loop capture for a host
that has no audio controller yet. Missing/undefined retains the previous bench behavior.

## Deck loop controls

Each launcher ends with In, Out and Exit loop/Reloop, aligned along its bottom edge.
Optional status messages sit above this row. Optional `deckLoopIn`,
`deckLoopOut` and `setDeckLoopEnabled` callbacks emit the deck ID. Deck `loop` and
`canLoopOut` fields govern the caption, active state and availability. In accepts a ready paused or playing deck; Out requires host approval; Exit/Reloop requires retained bounds. These
controls replace the master loop group. Section names emit hot-cue intent, while stem
cells emit loop intent; the host owns timing and audio behavior.

## Deck transport footer

Each deck has a square Play/Pause, momentary Cue and Sync controls below its routing row.
The routing row calls headphone monitoring **Phones** to distinguish it from transport
Cue. The master has no deck transport pair; its slim crossfader sits at the bottom of
that shared footer area.

Optional `setDeckPlaying(deckId, playing)` and `cueDeck(deckId, held)` commands emit
intent only. The host reports `playing` and `cueHeld`; cue points, audition and resuming
belong to the playback controller. Buttons are disabled for non-ready decks or missing
callbacks, including silent hosts. Sync emits `setDeckSync(deckId, synced)`
and displays the host-reported `synced` state; tempo and phase alignment remain host-owned.

Inactive Play and Cue keep their green and caution-colored labels. Playing Play/Pause
and held Cue fill with those colors and use the shared contrasting fill-text token,
including while hovered, so the icon and CUE label remain readable.

## Host transport and effect controls

`externalTransport` omits the master Run/Stop, tempo, launch timing and beat counter;
the bench retains them by default. The host can use its existing header unchanged.
Each effect definition may supply controls with stable IDs, names and Params. The face
renders the selector and its knobs as one subtly shaded control group and emits `setEffectParam(slot, effectId, paramId, value)`.
`effectValues` is keyed by slot, effect and parameter; absent values use Param defaults.
The master omits a separate title so the padded effect groups can occupy the header
space while their lower boundary stays aligned with the launchers.
Optional `setEffectHighPass` adds one High pass toggle per FX slot beneath its two knobs.
The host supplies `effectHighPass` and `effectHighPassHint`; the widget knows no cutoff
or DSP topology. The compact parameter padding keeps both toggles within the narrow
master section, and native pressed state/keyboard activation match the other toggles.

The widget knows no effect algorithms. Mix owns its effect definitions, values and audio graph.

Launcher status messages sit below the grid, leaving headings aligned across deck states.
Section and Stop button faces fill their grid cells, so their centered labels align with
the column heading in both stem and Full modes.
The master crossfader uses a 24px track for a taller target.

## Frame readings

`readFrame()` is a stable, synchronous, read-only sampler. It returns absolute beat
positions and normalized measured output levels keyed by deck ID, plus the master
level. A real adapter should read the engine/audio clock and cached metering; calling
it must not schedule or advance playback. The bench hook supplies invented readings.

`FramePlayhead` samples each deck's position on animation frames and updates its own
DOM marker. `FrameMeter` samples a level and applies presentation-only 35ms attack /
140ms release smoothing. These small children own their animation updates; the launcher
and all controls do not rerender at frame rate. All frame loops cancel on unmount.
The renderer can pause, miss frames or move to the background without becoming a clock
source. Hosts should keep their readers cheap because several displayed instruments
sample each frame.

Without a `waveform` range the bench keeps its 32-bar overview from `peaks`. Hosts may
provide a source window (`start`, `length`, `visible`) and, in it, one `lane` per source
they are playing — the original alone, or every stem. Each lane carries its own peaks,
optional low/mid/high `spectrum` tuples, cue positions and source-relative loop bounds,
and `FrameWaveform` scrolls each lane under its own playhead using that source's beat
reading. Optional seconds/duration frame fields support the source-time reading. The
canvas applies the scoped spectral theme to its silhouette over the same time
coordinates; widgets do not analyze audio or choose sources. Peaks and all beat/time
conversion remain host-owned. The widget never derives a loop from an audio file or
assumes that a source's beat equals the global transport beat.

## Bench adapter

`bench/usePreviewMixer.ts` owns fictional tracks, peaks, the frame-integrated preview
clock, queues, loop behavior, source changes, crossfade/gain calculations, and synthetic
meter levels. It adapts its private array positions into public IDs. Its stable reader
uses a ref to the latest simulated state. `bench/PlayCase.tsx` mounts the hook and passes
its result to the same `MixerView` that a real app will use.

`src/theme/*` owns the shared theme model, resolver and editor; see [theme.md](theme.md).
The bench reads ThemeRoot’s resolved colors and maps deck positions to host IDs. The
reusable face still accepts resolved colors and knows nothing about persistence.
Only the bench CSS positions the floating theme editor or hides workspace descriptions.
`src/mixer/mixer.css` contains the consolidated instrument layout, without bench selectors.

## Integrating mix

Mix mounts the face through `mix/src/play/useMixerViewModel.ts`, a subscription adapter
to its app-owned four-deck engine. The engine owns decoding, independent stem scheduling,
Sync, cue behavior, routing, effects, Link and measurement. The same library stays visible
in Prep and Play; [mix's topic](../../mix/docs/play-view.md) governs mode switching and loads.
No audio implementation or bench imports cross into these widgets.

## Verification

`MixerView.test.ts` checks stable-ID commands, host-authoritative selection updates,
source/stop delegation, unavailable state and frame sampling with no playback commands.
`preview.test.ts` checks the fixture adapter's queued launches, pause/immediate behavior,
source initialization, loop wrapping and Stop reset. Browser checks verify layout and
real widget interactions; `npm test -- --project=widgets` runs both with the widget suite.

## Focused positioning and DJ controls

Optional focused-source commands expose Play/Cue, focus, zoom and relative move phases
(begin/move/commit/cancel). WaveControls captures a pointer without jumping, emits beat
deltas from its initial position/width and rolls back on Escape, cancellation, lost capture
or window blur. The host preserves each addressed source’s playing/paused state during moves. Move active stems
is explicit; the face never synchronizes source positions itself. Arrow keys emit 1/8-beat
moves, Shift+Arrow one beat. Slider accessibility readings use seconds.

Momentary owns only input lifetime: pointer capture and keyboard hold, release exactly
once, cancellation and teardown. Space holds Cue; Enter during a hold requests Play
takeover. Its focus key ensures changing source releases the old source's hold.

Deck timing controls separately emit marker Q, launch timing and quick-loop length.
Loop scope, quick loop, resize, shift, boundary edits and loop-only Slip are host commands;
active/saved bounds and pending Out determine availability. Optional source frame readings
supply each lane's position and Slip background. A lane's `cue` and `stemCue` are
distinct checkpoints, even when their coordinates coincide.

Optional effect group/slot enables preserve host configuration. Tailing state and explicit
Clear tails are host-owned. Optional setPhones handles independent level and Cue/Master
blend; these are not added to MasterControl, keeping existing adapters compatible.


The mixer retains its aligned six-row structure. Loaded waveform rows overlay focused
Play/Cue; relative group movement and zoom live in the settings panel.
The loop row gives In/Out, Exit/Reloop, halve/double, move back/ahead, quick loop
and its settings trigger equal widths and 24px heights. Quick loop and settings join
with square inner corners and a single divider, retaining separate focus and actions. Timing and detailed
edits live in ContextControls. It delegates positioning, flipping and dismissal to shared Popup.
Escape restores trigger focus. Button, Toggle and Momentary share ButtonFace; comparable
performance actions are 24px high, while deck Play/Cue/Sync use 40px square faces.
Six-source level controls use two columns. Loop settings shares the other loop
buttons’ width, independent of the symbol font size. The master footer spans
the routing/transport subgrid; its crossfader separator aligns with deck transport.

The master footer puts group FX beside Phones. Normal FX click toggles the group;
right-click, Shift-click or Shift+F10 opens tail controls on that same trigger. Phones
opens its level/blend panel. There is no adjacent FX settings button.

Optional `beatJump(deckId, -1 | 1)` draws stacked ↑/↓ buttons after Sync on every deck,
disabled without a saved grid. It delegates the one-beat change to the host; widgets
never choose participants, move audio, alter Cue or implement boundary/Slip policy.


Fit stays visible beside a loaded waveform's settings trigger and emits `setZoom(id, 0)`.
The host supplies the entire source extent and `waveform.fixed`; FrameWaveform leaves
that strip fixed and moves its playhead/markers across the complete range. Drag distance
uses the supplied visible range in both modes, including playing sources. The optional
`syncLeader` flag labels the deck header; widgets neither elect leaders nor own tempo.
Synced launch timing displays Next bar and is read-only; sub-beat quick-loop options
are disabled while Sync is on.

There is no waveform source selector: the lanes a deck draws are the sources it is
playing. A deck on the original draws one lane; a deck on stems draws one per stem, in
stem ink and named, sharing the row's height. Pointing at a lane emits `setFocus` for
that source, which is what Play/Cue, dragging and focus-only looping act on; the focused
lane is drawn at full strength and the others are dimmed. Up/down arrows change lane from
the keyboard. Divergent sources are legible because each lane scrolls to its own
position rather than reporting a beat number.

Newly loaded decks default to Move active stems together. An individual stem-cell launch unlocks the option to uncheck it
for focused-stem movement; a whole-track Hot Cue restores grouped movement and locks
the choice again; grouped movement preserves relative offsets and does not
restart stopped stems.

The launcher names the whole-track column Hot cue and separates it from stem cells
with a vertical rule. Hot cues play through; stem cells loop independently.
The hot cue column and the stem columns share one width, so every launcher button in a
deck measures the same.

Loading a track leaves the channel as the desk was set: fader, trim, EQ, filter, both FX sends, crossfader assignment and headphone cue all keep their positions, and a synced deck stays synced provided the arriving track has a grid to hold it to. Everything the track owns — sections, waveform, grid, loops and Cue — is fresh, and every stem returns to full level. A deck loads playing the original track; its stems are chosen explicitly.

A newly loaded deck plays the original, so it draws that one lane; switching it to stems
draws them all. Loading does not change waveform zoom.

A dedicated gutter reserves the shared separator clearance around the Hot Cue divider, providing space on both sides
without narrowing the Hot Cue label itself.

The master strip shows labeled L/R meters in place of its former level fader. Hosts
supply `masterStereo` peaks in the frame; missing stereo readings display zero.
Master trim remains available. Each deck carries the same labeled L/R pair beside its
fader, from per-channel peaks at `decks[id].stereo`; a host that omits them reads zero.
Meter width belongs to the layout rather than the meter, so decks and master size theirs
independently.

Trim and the three EQ knobs share the same stack spacing, without a separator line.

Stem knob wrappers use flex layout to avoid inline baseline offsets. Drums and Trim
labels align at their top edge; six-stem grids also start at that edge.

The channel is a shared three-column grid (stems, fader/meter, Trim/EQ), aligned
at the top instead of centering each column separately. It shares the track of the
FX/filter row above it, so stems sit under FX A, the fader under Filter and Trim/EQ
under FX B, with the FX knobs themselves spaced evenly across their row rather than
pinned to those centres — three small knobs on a three-to-one track sit hard against the
edges. The master keeps equal thirds in both rows, so its EQ still lands under its FX B.
The centre takes three times the side columns, because it carries the most;
the ratio is one pair of tokens the three rows all read, so none can drift from the
others. Vertical `Separator` elements divide the deck's three sections in the FX, channel and
routing rows, the same rule the Hot cue divider uses. The channel and routing rows hold
theirs in gutter tracks; the evenly spaced FX row holds them as siblings, which keeps
every gap in that row equal. A gutter track and
an equal gap put the content in the same places, so the separators cost no alignment.
The fader assembly stops at its own maximum rather than filling the widened centre. The
plate carries evenly spaced horizontal ticks in the control edge colour, drawn as the
body's own background so the slot and the cap paint over them. The scale is inset from
both ends rather than ruling to the plate's edge, and its divisions are counted rather
than sized, so the first and last tick both land inside it. The master channel does the same against its own FX row: its meters span
the first two columns and carry the FX knobs' side margin, and Trim/EQ takes the third
under FX B.

Play carries the success role and Cue the caution role, so the transport reads as
running and holding rather than as two identical buttons. Cue takes `--caution` rather
than `--amber`, which resolves to the palette's primary and is not reliably warm.

Play/Cue/Sync stretch to their shared row height with a square aspect ratio; the
paired beat-jump controls divide the remaining column, along whichever axis leaves
each button more area. Individual buttons do not set their own dimensions.

The deck routing buttons sit between dedicated separator elements, outside the
row’s equal top and bottom padding. The separators are not borders on the controls.

The routing row follows the channel columns above it rather than the transport below:
Full centres under the stems, the crossfade assignment under the fader and meters, and
headphones under Trim/EQ. Each fills its column, and the crossfade assignment divides
its own between A, Thru and B. Transport keeps its own columns.

The footer fills the deck width. Play, Cue and Sync hold square columns sized to
the transport row; the remaining column takes the slack, so Thru, Full and the beat
arrows grow with the deck. The beat arrows rotate to whichever orientation gives them
more area — stacked while their box is taller than wide, side by side once it is wider
— and swap ↑/↓ for ←/→ with rewind on the left.

The deck fader is a slot and a cap drawn straight onto the strip, with no well and no
plate, so it carries the same weight as the knobs beside it. The slot is cut to the
master strip's background and framed like an empty meter; the cap is one flat bar in
the primary color, lifted by a shadow. A thumb's own size comes out of its travel, so
it never crosses either end of the track.

Faders and meters fill the channel height. The deck fader shows no percentage; the row
below the track carries the meter captions instead. Fader drag distance follows the
current track size.

Six-stem controls use two staggered columns across the full channel height.
Drums anchors the top left and Piano the bottom right; the opposite ends use
flex spacers equal to one fifth of the height remaining after a knob row, so all
six knob centers advance in equal vertical steps as the channel height changes.

A small, muted waveform icon occupies the empty corner beneath the left stem
column. A faint right-angle zigzag connects Drums through Piano behind the
controls and readings. Both decorations ignore input.


FX A and B divide their section into equal-height halves. Their headers retain
equal side spacing. Bypass and dropdown join inside one shared outline, with a
single internal divider and no extra rule across the effects panel.

A dedicated separator divides the equal FX halves, with parameter knobs centered
in the space below each header. The master monitoring row uses the same separate
dividers and balanced padding as deck routing. Its crossfader fills the bottom
row to match the transport buttons’ height.

Mixer separators are dedicated elements in both orientations. Each owns a one-pixel
stroke and six pixels of non-shrinking margin on either side, governed by one shared
spacing token. Section wrappers keep that clearance outside the controls; the Hot
Cue grid reserves the corresponding gutter. Compact mode changes that shared margin to five pixels; it never collapses.
Play targets 1280 × 720 as its minimum supported viewport. At that size the complete
mixer fits; smaller viewports retain control sizes and allow scrolling.

Compact Play layouts stagger both the stem and Trim/EQ controls into two columns,
keeping normal-size knobs and their readouts. The shared knob stack distributes
controls evenly between opposite spacers. Six-stem decks retain their connector
and waveform icon. Effects controls also retain their normal size and readouts.

The FX/filter row takes its height from its knobs; it has no fixed-height track
or additional vertical padding beyond the shared separators.
