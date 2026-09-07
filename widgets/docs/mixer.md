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
  stems disable their individual launch/stop/level controls. The host supplies four deck
  positions, a variable number of stem positions per deck, and three EQ values; unavailable stems retain
  a placeholder position. Section counts and names can vary between decks.
- `MixerCommands` contains semantic operations, not React setters. `launch(deckId,
  sectionId, stemId?)` uses null for stop and omitted stem for the entire deck. Source
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

## Host transport and effect controls

`externalTransport` omits the master Run/Stop, tempo, launch timing and beat counter;
the bench retains them by default. The host can use its existing header unchanged.
Each effect definition may supply controls with stable IDs, names and Params. The face
renders the selector and its knobs as one subtly shaded control group and emits `setEffectParam(slot, effectId, paramId, value)`.
`effectValues` is keyed by slot, effect and parameter; absent values use Param defaults.
The master omits a separate title so the padded effect groups can occupy the header
space while their lower boundary stays aligned with the launchers.
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

Without a `waveform` range the bench keeps its 32-bar overview. Hosts may provide a
source window (`start`, `length`, `visible`) and source-relative loop bounds. `FrameWaveform`
scrolls that window under a fixed playhead using the supplied beat reading. Optional
seconds/duration frame fields support the source-time reading. Peaks and all beat/time
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
