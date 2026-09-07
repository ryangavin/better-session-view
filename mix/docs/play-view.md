# Prep and Play

`src/play/` connects the controlled widgets mixer to a single app-owned `MixerEngine`.
`useMixerViewModel` is the React adapter: it subscribes to that engine, supplies stable
commands and frame readings, and resolves library IDs for loading. Widgets import no
playback or library code. Four copies of the single-track `useMix` are not a mixer.

## Window and ownership

Click the logo or press plain Tab to switch. The sidebar and hidden Prep page stay
mounted. Editable controls and dialogs retain normal Tab navigation. The outgoing view
pauses locally and releases its Link publisher; switching never starts the incoming
view or sends a Stop to other Link peers. The shared header controls the visible view's
engine. In Play, Space toggles the shared clock and loaded decks; deck Play/Pause remains
independent. Stop returns all decks to the beginning and clears section selections and
captured loops. Deck assignments, cue points and mix settings last for the window session.

The hook retains one engine per library root. A root change aborts loads and disposes
all voices, effects, Link capture and the AudioContext. Effect cleanup defers disposal
one microtask so React StrictMode's immediate replay cannot destroy the retained engine;
load cancellation is synchronous. Prep's own state and audio engine remain separate.
The header's [Audio settings](audio-settings.md) select the shared output device,
processing rate and latency preference. Applying them pauses both engines and replaces
their contexts while retaining loaded tracks, positions and mixer configuration.

The mixer fills available height. Spare height enlarges the four aligned waveform rows;
controls keep their established spacing. Song headers have two text rows with more
vertical room. At widths below the minimum control geometry the mixer scrolls horizontally
instead of shrinking touch targets. The library stays visible.

## Loading

Library drag payloads contain a track ID, never a filesystem path. The adapter verifies
that ID against the current library. Each strip and waveform row accepts the same drop;
loading is drag-and-drop only. A drop replaces that deck without selecting the Prep track.
A newer drop aborts older fetches and guards late analysis/decode results. Load errors are
shown on the deck and another drop retries. Loading does not start a deck.

`decks.ts` reads saved analysis, decodes the original and all available stems through the
existing library/audio APIs, and retains those buffers in the engine's shared context.
Saved beat maps (or saved uniform grids) govern Sync and section boundaries. Without a
saved grid, native-speed playback still works and Sync reports that preparation is needed.
A fallback tempo only supplies a waveform display; it is not a fabricated analysis result.
Reload a deck after saving preparation changes to refresh its sections and grid.

The four standard stem positions remain identifiable; guitar and piano are included when
present. Missing stems stay disabled. Tracks with no stems start in Full mode. Full switches
to the original at the current source position and stops the stem voices, preserving the
channel mix. Returning to stems starts the available stems at that position. It does not
layer the original over the separated audio. The first loaded deck sets the initial shared
tempo while stopped and unlinked; subsequent loads do not move it.

## Audio graph and levels

One lazily created AudioContext owns every deck and return. Each available source has a
`DeckVoice` and a stem gain. They feed a channel's trim, existing three-band Split EQ,
bipolar high/low-pass filter, fader and crossfade assignment, then the master. The master
has its own trim/EQ/filter/fader. Parameter changes ramp to avoid zipper noise.

All stem, channel and master volumes default to **100% = unity**. Zero is silence, and
volume controls cannot boost; trim supplies gain above unity. Stem gains are linear;
channel/master faders use a cubic taper. Neutral EQ is 0 dB, filter center is neutral.
Crossfade A is audible on the left, B on the right, both at center; Thru bypasses the
crossfader. There is no automatic gain matching or limiting. Use trim and the real meters
to manage headroom when summing tracks.

Deck sends are post-fader/post-crossfader and feed shared wet-only A/B returns. Master
sends tap the dry deck sum before the effect returns, preventing a return feeding itself.
Delay is one beat; Echo is a dotted eighth. Their Feedback/Tone controls map to a bounded
feedback loop and low-pass filter. Reverb is a parallel-comb network with Decay/Tone.
Chorus and Flanger modulate a short delay. Each effect keeps its own parameter values
per slot; switching effects replaces that return and discards its old tail.

Phones taps after trim/EQ/filter but before fader/crossfader. On a context exposing at
least four output channels, master is 1/2 and phones is 3/4. Stereo-only hardware reports
that separate cue routing is unavailable rather than leaking cue into the master.
Link Audio also exposes a named Phones feed. There is no separate-device headphone picker.

## Transport, Cue, Sync and sections

Play/Pause resumes/holds a deck's source positions. Cue follows the familiar player
convention: during playback it returns to the stored cue and pauses; while paused away
from cue it stores that position; at cue, holding auditions and releasing returns there.
Pressing Play during the held audition continues playback. The transport Cue point is
independent of the Phones switch. Pending resumes/preparation are generation-guarded so
releasing Cue, stopping, replacing a deck or leaving the view cannot start obsolete audio.

Unsynced voices use native AudioBufferSourceNodes. Sync lazily prepares Signalsmith stereo
worklets, using the existing `pinnedOf`, `passOf` and `sourceAt` beat-map scheduling.
Sync matches the shared tempo and nearest beat phase, preserving pitch and phrase position.
It is explicit per deck; unsynced decks keep their recorded timing. Turning Sync off
continues at native speed from the current source position. Global starts prepare all
synced voices before choosing one shared start sample. Worklet update callbacks schedule
future boundaries, independently of React and animation frames.

A section-name button is a hot cue: it clears that deck's active and saved loops,
starts all available sources at the named boundary, and continues through later sections.
In Full mode it does the same for the original mix. A stem cell instead loops only that
stem between the section boundary and the next section (or the track end). Without saved
sections, the Track name plays the whole source once. Synced launches while the clock is
running wait for the next bar; unsynced launches are immediate. Pending cells show a
queued indication until their scheduled audio time. Stop cells are immediate; the
section-column Stop stops all sources on that deck. Different stems can play different
sections simultaneously. Switching Full/stems clears prior selections and loop regions.

Each deck has In, Out and Exit loop/Reloop below its launcher. In releases the deck's
existing loops and captures the playing voices' source positions. Out captures their
later positions, engages those loops and draws the actual source bounds. Exit releases
both captured and stem-section loops on that deck, continuing from each voice's position;
it does not stop, jump to the loop start, or affect another deck. Reloop reinstates the
retained regions at their starts. Loop capture/exit cancels that deck's queued launches.
A section-name hot cue clears saved loop regions too, so an old capture cannot override
the new jump. The Play header and master strip have no loop buttons; Prep's header Loop
remains its single-track control.

Behavior references: AlphaTheta's [Cueing manual](https://downloads.support.alphatheta.com/manuals/all-in-one-dj-systems/XDJ-AZ/html/en/000COV_en/Cueing/Cueing.htm),
and Pioneer DJ's [control guide](https://blog.pioneerdj.com/djtips/what-do-all-of-these-buttons-do/).
The hybrid stem-section launcher is this app's existing concept; it is not described as
a standard CDJ feature. No jog-wheel, hot-cue bank or new effect control concept is added.

## Waveforms, meters and Link

The decoded original track produces beat-normalized overview peaks and frequency
shading in `overview.ts`. The overview begins at the beat containing file sample zero,
which can be negative: audio before the first downbeat must not be discarded. Its
explicit origin is retained when extracting each scrolling window. Map samples and
decoder samples are converted through seconds, so differing sample rates stay aligned.
The measured end of the map determines the overview length, not an estimated tempo.

Persistent 250/2500 Hz crossovers measure low/mid/high energy per bin and map those
bands to red/green/blue contributions. Silence remains neutral. Spectral paint belongs
to the original audio, before mixer processing; deck colors remain on the labels and
rails. Both stereo channels contribute without cancellation. Analysis runs once during
loading, yielding cooperatively and honoring replacement cancellation. Play shows eight bars
around a fixed playhead, with a 96-beat backing window to scroll smoothly through page
boundaries. Each deck follows its own actual source position; beat-grid lines share scale
and aligned playheads. The first enabled source is the track-position reference when
stems are playing different sections. Per-deck source loop bounds are passed to widgets,
not confused with the shared elapsed transport count. The time/bar reading belongs to
that source. Unsynced tracks naturally drift relative to each other.

`readFrame` reads the AudioContext clock and actual analyser peaks, cached within an audio
quantum. Widgets animate the scroll and meters at display refresh rate (normally 60 Hz).
Only low-rate whole-beat/selection/page state rerenders the mixer. Pausing, dropping frames
or hiding the browser cannot become the playback clock. Waveforms show the original
track as a positional reference, not a rendered sum of independently launched stems.

The existing LinkAudioSender publishes loaded deck outputs, master and Phones. Header
Link follows/sets shared tempo and transport. Synced decks also correct significant phase
drift against the Link timeline; unsynced decks remain native-speed. Local monitoring
is independent of the Link feeds and turns off when sharing is enabled. Changing the
published deck layout recreates the native feed session, so receiving routes need checking.
Native capture/protocol code is reused unchanged. A real Live peer and multichannel output
hardware remain necessary for end-to-end routing validation.

## Verification

The Play tests cover sidebar drag/drop, replacement races, library changes, retry,
independent four-deck scheduling, stem selection, source switching, cue audition/cancellation,
Sync replacement, loop bounds and routing endpoints. Existing pin/schedule/stretch/Link
suites cover the reused primitives.

Open `http://localhost:5673/harness/mixer-audio.html` and press Run audio checks for real
Web Audio renders: unity, trim, silence, EQ/filter attenuation, all five wet effects,
pitch-preserving tempo doubling, loop wrap and pause. This dev-only page sends no test
signal to speakers. It uses the real Signalsmith worklet rather than the unit-test mock.
The normal harness is also checked with four real library tracks playing and synced.
Physical iPad dragging and headphone outputs require device validation.
