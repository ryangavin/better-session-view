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
present. Missing stems stay disabled. Tracks with no stems start in Full mode. Full pauses
all sources and switches the addressed source group. The original is initialized from the
focused stem once; subsequent switches retain each group's independent positions, stopped
stems, selections, loops and Cue checkpoints. Switching does not start audio. The first
loaded deck sets the initial shared tempo while stopped and unlinked.

## Performance layout

Play keeps waveforms above the six aligned mixer rows: launcher/loop controls, sends,
channel, routing and transport under the headers. The performance area does not scroll
vertically; long section lists scroll inside their launcher. Six stems use two columns
of level knobs. Compact layouts fit the checked 1280×720, 1024×768 and 1366×768 viewports.

Loaded waveforms overlay the source chip, focused Play and Cue. The chip opens source,
relative group movement and zoom settings. The compact loop row keeps In, Out,
Exit/Reloop and quick loop visible; its settings button opens Q, launch timing, target,
length, Slip and region edits. Small actions use the shared 24px widget button face;
deck Play/Cue/Sync are 40px squares. A narrower 852px mixer layout fits a 1110px window
with its library sidebar. Loop controls remain within each deck.
The master footer places FX beside Phones, with a separator above the crossfader
aligned to the deck transport separators. Click FX to bypass/enable; right-click,
Shift-click or Shift+F10 on that same button opens tail controls. Phones opens its level
and Cue/Master blend. Context panels use the shared Popup placement and dismissal.

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
per slot. The group and individual slot enables gate new send input without changing
stored send levels or parameters. Existing returns decay after bypass. Effect selection
also retains the old return until quiet (or 180 seconds); a tail indicator reports activity
while the group is off. Clear tails explicitly discards it while bypassed. Send and Phones
gains initialize at zero before connecting: smoothing from the GainNode default of one
would otherwise inject startup audio into a supposedly unused effect.

Phones taps after trim/EQ/filter but before fader/crossfader. On a context exposing at
least four output channels, master is 1/2 and phones is 3/4. Stereo-only hardware reports
that separate cue routing is unavailable rather than leaking cue into the master.
Link Audio also exposes a named Phones feed. Independent Phones level and Cue/Master blend
mix selected pre-fader decks with the post-master output on the same audio clock. At 0%
blend only selected decks are monitored; at 100% only master is monitored. There is no
separate-device headphone picker.

## Transport, Cue, Sync and sections

Play/Pause resumes/holds each participating source at its exact independent position;
stopped stems stay stopped. Deck Cue stores a combination checkpoint: source positions,
participation, selections and loop regions, excluding gains. Focused Cue addresses only
one source. Paused away from the checkpoint, Cue stores the current state; playing Cue
returns and pauses; holding at the checkpoint auditions and release restores it. Play
while held latches playback. Keyboard Space holds Cue and Enter takes over; release,
cancel, lost capture, window blur and unmount cannot leave an audition running. Pending
preparation/resume and launch revisions prevent obsolete audio from starting.

Unsynced voices use native AudioBufferSourceNodes with 4ms start/stop fades. Sync lazily
prepares Signalsmith stereo worklets using `pinnedOf`, `passOf` and `sourceAt` scheduling.
Engaging Sync while playing applies one common beat-phase correction, preserving stem
offsets. Paused Sync arms tempo following; Play still resumes exact positions. Turning it
off continues at native speed. Global starts prepare all synced voices before choosing
one shared start sample. Worklet callbacks own scheduling independently of rendering.

A section-name hot cue clears deck loops and starts all sources at that boundary,
continuing onward. A stem cell loops only that stem's section; other stems remain
independent. In Full mode the original is addressed. Without sections, Track plays once.
Launch timing is explicitly Now, Next beat or Next bar, independent of Sync and marker Q.
Queued cells show the scheduled change; Stop is immediate.

Q snaps Cue and manual loop markers to the nearest saved-grid division (ties forward):
Off, 1/8, 1/4, 1/2, 1 or 4 beats. Collective snapshots use a common delta anchored to
focus, preserving offsets. Missing grids disable grid-dependent controls. Loop scope
chooses active stems or focus only. In works paused or playing, stores Cue and starts a
new capture; Out validates every target atomically with at least 20ms duration. Scope
cannot change while awaiting Out. Quick loops use the selected beat count (16 beats is
four bars in 4/4); half/double keep In fixed, move shifts by one beat, boundary buttons
adjust by Q or 1/8 beat. Invalid edits change nothing. Exit continues at each audible
position and retains saved regions. Reloop goes to In, preserving paused/playing state.
Loop edits do not rewrite Cue. A section-name launch clears old saved loops.

Slip applies to loops only. Each looping source retains its own advancing background
position; Exit rejoins it. The waveform shows this background marker. Ordinary Exit stays
at audible position. Pause, Cue, Stop, source-group switching or disabling Slip ends that
background history. It is not a general scratch, reverse or hot-cue Slip implementation.

### One-beat jumps

The stacked footer arrows move the deck's participating sources: ↑ advances one mapped
beat, ↓ rewinds one. Each source converts its own position through the saved beat map,
so beat offsets survive tempo changes. Full mode addresses the original. Before first
Play all available sources participate; after initialization stopped stems stay untouched.
Playing sources restart at one shared scheduled time; paused sources remain paused.

Jumps preserve Cue and mixer levels. They exit addressed loops, retain regions for
Reloop, discard addressed Slip backgrounds and cancel addressed queued launches/manual
In markers. They use audible positions rather than the Slip background. A jump that
would put any participant before sample zero or within 1ms of its file end is rejected
for the whole group, with a visible deck message; there is no wrap or partial clamp.
Missing grids disable the arrows. Held Cue or an active waveform move ignores jumps.

## Waveforms, meters and Link

Each decoded source produces beat-normalized overview peaks and frequency
shading in `overview.ts`. The overview begins at the beat containing file sample zero,
which can be negative: audio before the first downbeat must not be discarded. Its
explicit origin is retained when extracting each scrolling window. Map samples and
decoder samples are converted through seconds, so differing sample rates stay aligned.
The measured end of the map determines the overview length, not an estimated tempo.

Persistent 250/2500 Hz crossovers measure low/mid/high energy per bin and map those
bands to the shared theme’s spectral colors (RGB by default). The engine retains
energy tuples rather than baked colors. Theme edits repaint already-loaded, paused
waveforms without re-analysis or playback changes. Silence uses the theme’s idle tone. Spectral paint belongs
to the focused source audio, before mixer processing; deck colors remain on the labels and
rails. Both stereo channels contribute without cancellation. Analysis runs once during
loading, yielding cooperatively and honoring replacement cancellation. Focus defaults to
drums (or the first available source) and never follows launch activity implicitly. Zoom
selects the visible beat span. Source Cue, deck checkpoint, saved/active loop and other
source positions are distinguished in the waveform. Time/bar readings belong to focus.

Paused dragging moves the focused source relative to pointer-down, with no initial jump.
Move active stems explicitly applies one common bounded beat delta to the combination;
it requires the addressed sources paused. Release commits; Escape, pointer cancellation,
lost capture or window blur restores the pre-gesture state. Arrow keys move 1/8 beat,
Shift+Arrow one beat. Seeking exits addressed active loops but retains saved regions and
never overwrites Cue. Widgets emit intent; the engine owns clamping and state restoration.

`readFrame` reads the AudioContext clock and actual analyser peaks, cached within an audio
quantum. Widgets animate the scroll and meters at display refresh rate (normally 60 Hz).
Only low-rate whole-beat/selection/page state rerenders the mixer. Pausing, dropping frames
or hiding the browser cannot become the playback clock. Waveforms show the focused source, not a rendered sum of independently launched stems.

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

The worktree DJ harness at `/harness/dj-controls.html` mounts actual PlayView/MixerEngine
with generated source buffers. See [DJ control validation](dj-controls-validation.md) for
measured output checks, interaction coverage and remaining device checks.
