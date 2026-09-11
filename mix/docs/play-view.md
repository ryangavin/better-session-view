# Prep and Play

Intended behavior is governed by [the behavior specification](behavior-specification.md);
measured status lives in [validation](dj-controls-validation.md).

`src/play/` connects the controlled widgets mixer to a single app-owned `MixerEngine`.
`useMixerViewModel` owns the engine lifetime, supplies stable commands and frame
readings, and resolves library IDs for loading. It does not subscribe App to mixer
state: `PlayView` and `Header` subscribe locally. Space reads the current engine
snapshot inside the key handler. Widgets import no
playback or library code. Four copies of the single-track `useMix` are not a mixer.

## Window and ownership

The app starts in Play with Play selected in the header.

The left-aligned Prep/Play segmented control immediately beside the logo selects stem
separation or the DJ mixer, with exactly one active option. The logo is static branding.
Press plain Tab to switch. The sidebar and hidden Prep page stay
mounted. Editable controls and dialogs retain normal Tab navigation. The outgoing view
pauses locally and releases its Link publisher; switching never starts the incoming
view or sends a Stop to other Link peers. The shared header controls the visible view's
engine. Its centered controls are visually separated into Transport (play/stop, tempo
and position), Timing (launch timing, marker quantization and quick-loop length, in Play),
and Audio (Link Audio, Local audio and Link status). Prep's loop remains in Transport
and its conditional Link pins remain beside Link Audio. In Play, Space toggles the shared clock and loaded decks; deck Play/Pause remains
independent. Stop returns all decks to the beginning and clears section selections and
captured loops. Deck assignments, cue points and mix settings last for the window session.

Standalone Play freezes its transport clock when the final participating source stops or
pauses. Explicit deck/stem stops and Cue release update it immediately; natural endings
are detected by the existing 40ms engine tick. Only the selected Full/stems group counts;
its playing sources count even at zero gain or with headphone-only monitoring. Held Cue
and scheduled starts keep the clock alive. Auto-stop preserves positions, Cue, loops and
mix settings; it sends no Link command. With Link enabled the shared transport continues
when decks finish or pause. The explicit global Pause/Stop commands retain their existing
Link behavior. Starting again resumes paused sources; a finished source restarts at its
first mapped beat (or file start without a grid). A launch from an idle standalone clock
starts immediately instead of waiting for an otherwise empty clock's next bar.


The hook retains one engine per library root. A root change aborts loads and disposes
all voices, effects, Link capture and the AudioContext. Effect cleanup defers disposal
one microtask so React StrictMode's immediate replay cannot destroy the retained engine;
load cancellation is synchronous. Prep's own state and audio engine remain separate.
The header's [Audio settings](audio-settings.md) select the shared output device,
processing rate and latency preference. Applying them pauses both engines and replaces
their contexts while retaining loaded tracks, positions and mixer configuration.

The mixer fills available height. The four-track overview has no outer vertical margin;
its existing border meets the adjacent sections without empty bands. Spare height enlarges the four aligned waveform rows;
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
A track with no saved grid is gridded here rather than arriving without one: the beat
finding runs on the original the deck has already decoded, in a worker, and the deck
stays on `Finding the beat…` until it answers. Measured on the library, the shipping
algorithm reads the same tempo from the whole mix as from a drums stem on every track
that has a tempo at all, so this costs nothing against separating first. What it finds
is written beside the track, and so is a refusal — a song with nothing steady in it is
not asked again on every drop. Sections still come from Prep; an unprepared track has
the one whole-track hot cue.
When a deck creates a new waveform scan, the desktop publishes a track-scoped notification
after saving it. An already-mounted library row then displays that saved original waveform
without a reload; offscreen rows defer the cache read until visible. A failed save sends
no completion notification. Library browsing still performs no audio analysis.
Every source is fetched and decoded at once rather than in turn: decoding happens off the
main thread, so asking for them together is the difference between five seconds and two.
Saved beat maps (or saved uniform grids) govern Sync and section boundaries. Without a
saved grid, native-speed playback still works and Sync reports that preparation is needed.
A fallback tempo only supplies a waveform display; it is not a fabricated analysis result.
Reload a deck after saving preparation changes to refresh its sections and grid.

The four standard stem positions remain identifiable; guitar and piano are included when
present. Missing stems stay disabled. Full is disabled on empty or original-only decks;
loaded decoded buffer availability determines whether stems can be selected, rather than
stale library metadata. The engine also rejects a switch to an empty stem group. Every deck starts in Full mode, because the original always
sums better than its own stems do; launching any stem clip is itself the request for
stems, and switches the deck without a separate control.

Switching pauses nothing. `apply` already gates each voice's output by the mode, so the
swap is a gain ramp and the outgoing group plays on underneath it, which is what makes it
inaudible — the alternative, pausing and rescheduling every source, was audible every
time. A group nothing has ever asked for — the stems of a deck that opened on the original —
starts whole, since there is no earlier choice to respect; where some of it is already
enabled, the parts stopped on purpose stay stopped. The incoming group is started from
where the outgoing one is *every* time, running or not: having played on under the ramp it has drifted from what was heard, and adopting
its own position would move the deck by however long the other source was up. So the two
agree at the moment the gains cross, and each group keeps its own positions, stopped stems, selections,
loops and Cue checkpoints. The cost is that both groups run once both have been heard.
Switching does not start audio. Loading does not establish tempo authority. Without Link, the first playing gridded
deck becomes leader; the header always shows the canonical playback tempo, initially 120 BPM.

## Performance layout

Play keeps waveforms above the six aligned mixer rows: launcher/loop controls, sends,
channel, routing and transport under the headers. The performance area does not scroll
vertically; long section lists scroll inside their launcher. Six stems use two columns
of level knobs. Compact layouts fit the checked 1280×720, 1024×768 and 1366×768 viewports.

Loaded waveforms overlay a settings trigger, focused Play and Cue. The trigger opens
relative group movement and zoom. Loop controls keep their 24px height. With at most
1490px available to Play, they use two rows: In, Out and Exit/Reloop above the paired
halve/double, move back/ahead and quick-loop/settings controls. Wider layouts keep
one row with equally sized actions. Quick loop and its adjacent settings button form one attached pair
with a single divider; both remain separately focusable. Settings opens loop target
and Slip. The quick loop's length is one setting for the whole rig, set
in the header in bars, so the decks cannot disagree about what a loop is; it defaults to
two bars. Moving the loop is a pair of buttons beside the quick loop rather than a menu
item, because sliding a region is done far more often than it is configured — and it is
not the transport's beat jump, which moves the playhead and leaves the loop. Quick loop encloses the playhead rather than moving it:
the region begins at the division boundary at or before the current position, and
playback carries on inside it. Small actions use the shared 24px widget button face;
deck Play/Cue/Sync are squares that fill the transport row. The compact mixer has a 964px minimum width so its transport squares and
beat-jump stack fit; narrower available areas scroll horizontally. Loop controls remain within each deck.
The master footer places FX beside Phones, with a separator above the crossfader
aligned to the deck transport separators. Click FX to bypass/enable; right-click,
Shift-click or Shift+F10 on that same button opens tail controls. Phones opens its level
and Cue/Master blend. Context panels use the shared Popup placement and dismissal.

## Audio graph and levels

One lazily created AudioContext owns every deck and return. Each available source has a
`DeckVoice` and a stem gain. They feed a channel's trim, existing three-band Split EQ,
bipolar high/low-pass filter, fader and crossfade assignment, then the master. The master
has its own trim/EQ/filter and separate left/right output meters; it has no level fader
in the Play interface. Parameter changes ramp to avoid zipper noise.

All stem, channel and master volumes default to **100% = unity**. Zero is silence, and
volume controls cannot boost; trim supplies gain above unity. Stem gains are linear;
channel faders use a cubic taper. Neutral EQ is 0 dB, filter center is neutral.
Crossfade A is audible on the left, B on the right, both at center; Thru bypasses the
crossfader. There is no automatic gain matching or limiting. Use trim and the real meters
to manage headroom when summing tracks.

Deck sends are post-fader/post-crossfader and feed shared wet-only A/B returns. Master
sends tap the dry deck sum before the effect returns, preventing a return feeding itself.
Each FX slot has a third **HP** cutoff knob in the same row as its two effect parameters.
All three use the same shared dial size as FX A / Filter / FX B below; removing the inner
horizontal padding gives them the master strip's full width without changing its minimum.
The host supplies an enum Param: Off, then 20Hz–2kHz in 48 logarithmic steps per decade
(about 5% per step). Its readout uses Hz/kHz; keyboard arrows move one step and the shared
double-click reset returns to Off. The actual cutoff is smoothed with the existing 8ms
time constant, as is the parallel unity-bypass/filtered-input crossfade when entering or
leaving Off. Off is unfiltered input; there is no extra button or control row.

The second-order Butterworth filter (12dB/octave, Q=1/√2) sits on the summed deck/master
sends entering each effect. Dry/direct audio remains untouched. Tone remains the existing
low-pass on wet output and delay-style feedback. The high-pass remains outside feedback,
so changing cutoff does not reshape existing tails or change feedback stability. All five
effect types share this input stage.

`effectHighPass.ts` maps widget positions to Hz and saves numeric cutoff values per A/B
slot immediately in `mixflow.effect-high-pass.v2`. Zero means bypass. Missing/malformed
values become Off; out-of-range positive frequencies clamp to the supported range.
The old v1 toggle migrates On to exactly 200Hz and Off to bypass, only when v2 is absent.
Slot settings survive type changes, context replacement and app reopen. Widgets receive
the host Param, positions, command and tooltip; filter design stays in mix.
The offline browser regression at `/harness/fx-highpass/` renders all five real effect
graphs without speaker output, checking range endpoints, 200Hz response, dry identity,
bypass, existing tails, real-time cutoff changes and both bypass transitions.

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

Unsynced voices use native AudioBufferSourceNodes with 4ms start/stop fades.
Native loops cache one region buffer per voice, blending 4ms on each side of the
wrap with a smooth complementary gain curve. The region retains its sample-rounded
length and source markers; only the seam changes. The blend can borrow up to 4ms
outside the marked region, clamping at file edges. This avoids a raw amplitude jump
without shortening the musical loop or relying on main-thread callbacks at each wrap.
Changing the region replaces that cache; each cached region costs one additional
float32 buffer for its channels and duration.
Changing between native and stretched playback overlaps their gain ramps for 20ms;
the outgoing path remains connected until its fade completes. Stretched repositioning
updates the active worklet schedule without an intervening inactive command. The
stretcher's gain starts at zero so preparing it cannot leak audio into the existing mix. Sync lazily
prepares Signalsmith stereo worklets using `pinnedOf`, `passOf` and `sourceAt` scheduling.
Engaging Sync while playing applies one common beat-phase correction, preserving stem
offsets. Paused Sync arms following; Play aligns the group to the leader beat phase. Turning it
off continues at native speed. Global starts prepare all synced voices before choosing
one shared start sample. Worklet callbacks own scheduling independently of rendering.

A section-name hot cue clears deck loops and starts all sources at that boundary,
continuing onward. A stem cell loops only that stem's section; other stems remain
independent. In Full mode the original is addressed. Without sections, Track plays once.
Without Sync, launch timing is explicitly Now, Next beat or Next bar, independent of
marker Q. Sync fixes section launches to the next leader bar (four beats).
Queued cells show the scheduled change; Stop is immediate.

Q snaps Cue and manual loop markers to the nearest saved-grid division (ties forward):
Off, 1/8, 1/4, 1/2, 1 or 4 beats. Q, launch timing and the quick loop length are the
rig's, set in the header and shared by every deck, because four decks disagreeing about
when a launch lands is a fault rather than a feature. A synced deck answers to a whole beat when Q is off,
since it is already held to the shared grid: Cue lands on a beat, and an In or Out nudge
steps a beat rather than rounding away to no move at all. Collective snapshots use a
common delta anchored to focus, preserving offsets. Missing grids disable grid-dependent
controls. Loop scope chooses active stems or focus only. In works paused or playing,
stores Cue and starts a new capture; Out validates every target atomically with at least
20ms duration. Scope cannot change while awaiting Out. Quick loops use the selected beat
count, shared by every deck; half/double keep In fixed, and move shifts by one beat.
Pressed again inside a running loop, In and Out are that loop's boundaries rather than a
new capture: In brings the front up to the playhead and Out pulls the tail back, both on
the Q division. That is the fine end of the gesture halving is the coarse end of, so
there are no separate boundary buttons. Invalid
edits change nothing. Exit continues at each audible position and retains saved regions.
Reloop goes to In, preserving paused/playing state.
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

### Local leader and loop scheduling

Outside Link, the oldest still-playing gridded deck leads; a stable playing source in
that deck supplies beat phase. Loading or syncing another deck never sets the tempo.
An unsynced leader supplies its mapped native beat rate; a synced follower becoming
leader retains its current rate. Pause, stop, natural end and replacement allow the next
playing deck to lead. LEADER appears in its header. The main tempo is editable once a local leader is playing. Editing a native leader
prepares and enables pitch-preserving Sync before applying the requested tempo; synced
followers receive that rate. Loading a deck cannot change it. The header always displays
the canonical playback BPM: 120 initially, then the last rate after pause, stop, natural
end or replacement. This is retained engine state, not a separate display fallback.
It remains read-only without a local leader or Link; starting a native leader still
establishes its mapped tempo. Link updates that same value even while stopped or
without remote peers, and disconnecting retains its last rate.

The header's **1× / Normal speed** button restores the local leader's effective source BPM
from the loaded saved grid (`loadedDeck` includes manual corrections), not the current
scaled playback tempo. It calls the same master BPM command as editing the tempo field,
preserving the existing Sync preparation, phase and scheduling path. It is disabled with
no playing local leader, an unknown BPM, or Link's external tempo authority. For a variable
grid this is its analyzed representative BPM, rather than a promise that every beat is
uniform. Preparing a new grid requires reloading the deck as above.


Followers are checked every 250ms and corrected when phase error exceeds 0.025 beat,
using one scheduled correction for their playing sources. Gesture/Cue holds and queued
operations defer correction; scrub commit requests it immediately. This is a bounded
correction policy, not a claim of mathematically zero error at every sample. It does not
reunify independent song sections. Synced loop entry/reloop/edit waits for the next leader
bar, with a queued message. Synced regions snap to whole beats with at least one beat;
sub-beat quick-loop choices remain available with Sync off. Exit is immediate.

### Playing scrub and whole-source view

The waveform supports relative dragging while playing or paused, with the existing
explicit group-move choice. Playing sources continue from scheduled moved positions;
paused sources stay paused. Gesture progress includes elapsed playback time. File edges
clamp a common delta; playing positions stay 2ms short of the end to avoid wrapping.
Moving exits addressed loops/Slip backgrounds while retaining saved regions and Cue.
Cancellation restores gesture-start positions/loops and each source's prior playback
state; commit retains the new positions and a synced follower reacquires beat phase.
This is audible seeking, not reverse vinyl scratching.

Fit is always beside the settings trigger on a loaded waveform. It shows the entire focused
source from sample zero to its end, including pre-downbeat audio, with a moving playhead.
`zoom: 0` selects this fixed view; normal zoom remains 4–64 beats. Fit again returns to
32 beats; zoom controls also leave Fit. The waveform model supplies `fixed`, its complete
beat extent and overview bins; widgets own only rendering and input.

## Waveforms, meters and Link

Each decoded source produces beat-normalized overview peaks and frequency
shading in `overview.ts`. The overview begins at the beat containing file sample zero,
which can be negative: audio before the first downbeat must not be discarded. Its
explicit origin is retained when extracting each scrolling window. Map samples and
decoder samples are converted through seconds, so differing sample rates stay aligned.
The measured end of the map determines the overview length, not an estimated tempo.

Reading the samples is the other half of a load, and it is kept. `measureScan` walks each
source once against **time** — two hundred bins a second, five values apiece — and
`analysis/<track>/scan.bin` beside the track holds every source's walk, refused when the
separation key or a source's length no longer matches what decoded. `overviewOf` gathers a
grid's columns out of a scan in a few milliseconds, so an edited beat grid redraws instead
of re-reading, and a second load of a song never reads a sample. A track that was never
separated keeps the scan of its original alone, and a separation writes its
stems' scans as they land ([`stems.md`](stems.md)), leaving a first load only
the original to walk. The walk comes up for air on a time budget
through a message port rather than a timer: a nested `setTimeout` is clamped to four
milliseconds, and to a second or more behind another app, which is enough to make a walk
look like a hang.

Persistent 250/2500 Hz crossovers measure low/mid/high energy per bin and map those
bands to the shared theme’s spectral colors (RGB by default). The engine retains
energy tuples rather than baked colors. Theme edits repaint already-loaded, paused
waveforms without re-analysis or playback changes. Silence uses the theme’s idle tone. Spectral paint belongs
to the focused source audio, before mixer processing; deck colors remain on the labels and
rails. Both stereo channels contribute without cancellation. Any walk that is needed
runs once during loading, coming up for air cooperatively and honoring replacement
cancellation. A deck draws the sources it is playing: the original alone in full mode, and
one lane per stem otherwise, each scrolling under its own playhead so stems that have been
moved apart are seen apart. Pointing at a lane focuses it — there is no source menu — and
focus supplies position, scrub and Play/Cue behavior. Focus defaults to drums (or the first
available source) and never follows launch activity implicitly. Zoom
selects the visible beat span. Source Cue, deck checkpoint and saved/active loop are
distinguished within each lane. Time/bar readings belong to focus.

Dragging moves the focused source relative to pointer-down, with no initial jump.
Move active stems explicitly applies one common bounded beat delta to the combination;
each source retains its playing/paused state. Release commits; Escape, pointer cancellation,
lost capture or window blur restores the pre-gesture state. Arrow keys move 1/8 beat,
Shift+Arrow one beat. Seeking exits addressed active loops but retains saved regions and
never overwrites Cue. Widgets emit intent; the engine owns clamping and state restoration.

`readFrame` reads the AudioContext clock and actual analyser peaks, cached within an audio
quantum. Widgets animate the scroll and meters at display refresh rate (normally 60 Hz).
Whole-beat/selection/page changes and mixer control edits rerender the mixer. Pausing, dropping frames
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
draws them all. Loading does not change waveform zoom. The deck sits on the track's first
beat with its cue point there, rather than on the silence a file starts with.

The grid drawn over a lane shows beats and bars while beats are far enough apart to be
read as beats, bars alone once they are not, and faint bars at Fit, where a whole song's
bars are a few pixels apart and anything stronger is a haze over the waveform.

Every lane's playhead sits in the same column, loaded or not: the four rows are read
against each other, and a deck waiting for a track had put its line at the left edge,
which reads as a position rather than as an empty deck.

Empty decks keep drop guidance in their header and waveform label. A deck being read
says so in its own waveform lane, at a size that reads across a booth, over a hatched
strip that cannot be dragged — there is nothing to draw and nothing to scrub until it
answers. The launcher's status line is left for what is worth interrupting somebody
about: a refused tempo, a failed load, an output that cannot carry the cue. A deck that
simply has no sections says nothing, because its one whole-track hot cue already does.

The Hot Cue divider uses the shared separator clearance on each side.

Master metering splits the post-processing stereo output into independent analyzers.
The frame provides left/right peaks; mono cancellation cannot hide either channel. Deck
channels split the same way, so each deck meters its own left and right after its fader.

Channel stems, fader/meter and Trim/EQ share a top-aligned column layout on the same
three-column track as the FX/filter row above, so stems sit under FX A, the fader under
Filter and Trim/EQ under FX B. The centre column is three times a side column; vertical
separators divide the three in the channel and the routing row; and the fader assembly
holds a maximum width rather than filling the centre, with its meters set further from
the fader than they are from each other. The master channel matches its own FX row, spanning its
meters across the first two columns and taking the third for Trim/EQ. Stem
wrappers do not add baseline offsets. Four-stem rows align with all four EQ rows;
six stems use two staggered columns, anchored by Drums at the top left and Piano at the bottom right.

Channel and routing rows honor their content height rather than clipping knob
stacks into fixed tracks. Routing uses equal top/bottom padding, so its divider
follows the full mixer bottom margin.

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
Each Play deck keeps at least 260px of width so its routing, knobs and transport
controls stay inside its column. When the mixer cannot fit beside the library, scroll
it horizontally to reach the remaining decks; the library stays visible.

Compact Play layouts stagger both the stem and Trim/EQ controls into two columns,
keeping normal-size knobs and their readouts. The shared knob stack distributes
controls evenly between opposite spacers. Six-stem decks retain their connector
and waveform icon. Effects controls also retain their normal size and readouts.

The FX/filter row takes its height from its knobs; it has no fixed-height track
or additional vertical padding beyond the shared separators.


### Control render isolation

Continuous gain/FX edits must not rerender App, its library, or hidden Prep. The former
App-level mixer subscription did exactly that; `useMix` returned a fresh object and
invalidated every memoized Song row. The subscription belongs at the consuming view,
not in the engine-owner hook. Header has its own subscription so transport, tempo and
Link still update when App does not render. Engine lifetime and loading stay in App.

`src/play/renderIsolation.test.ts` exercises the real Library with 300 rows and 60
separately flushed gain publishes. Before isolation this produced 18,000 row renders:
2,368ms total, 1,424ms in Library React rendering, worst Library render 93ms. Afterward
it produces zero owner/row renders while the subscribed control sees all 60 updates;
the measured sweep was 2–4ms. The regression asserts render counts and final values,
not machine-dependent time thresholds. A second measurement renders the actual
four-deck controls: 60 updates took 418–460ms, React p95 7–18ms in these runs. That
remaining widget work is not claimed to be free. These are happy-dom development
measurements with no audio/MIDI or browser painting, not live FPS or audio latency.
The subsequent physical fader trial was accepted by the user as very smooth,
comparable to their DJ controller. This confirms the reported responsiveness issue
subjectively on the actual setup; it does not establish a measured FPS or latency.
