# Launchkey controller prototype

`src/controllers/launchkey.ts` owns a renderer-only Web MIDI adapter. Debug → Controllers
opens `src/debug/controllers/ControllerPanel.tsx`; App owns its lifetime, so closing the
workspace keeps the chosen controller working. Switching to Prep releases it until
Play resumes; changing the library or restarting the app restores the remembered pair.
Connection never starts audio. Auto-connect can be turned off in the panel, and an
intentional Disconnect persists that opt-out. The footer connection indicator opens the panel even with an empty library. It has
its own leaf subscription so controller logs/metrics never invalidate the Play tree.
Its text distinguishes disconnected/waiting, port linked/awaiting input, and receiving
DAW input without relying on loaded tracks or running audio. Hardware focus LEDs and
the optional linked/active screen title also work with empty decks.

## Connection

Find MIDI ports requests browser MIDI access. Screen labels explicitly requests SysEx;
leave it unchecked for control/LED operation without display messages. Errors are visible
and the user can retry without SysEx. Only matching Launchkey MK4 DAW ports are offered.
After explicit discovery, a single matching pair is preselected. Choose input
**Launchkey MK4 61 DAW Out** and output **Launchkey MK4 61 DAW In**, then Connect.
The bounded debug log includes discovery, permission outcome, all detected port names,
selected pair, open/close results and MIDI packets, so an empty discovery is diagnosable.
These names were read from CoreMIDI on the user's machine, rather than inferred from a
remembered model. Discovery itself only requests access and inventories ports. With auto-connect enabled,
a matching remembered pair is then opened automatically.

Connect opens that pair and sends the documented native DAW enable (`9F 0C 7F`), then
selects DAW pads, Plugin encoders and Volume faders. This is **Novation's native MK4
protocol, not MCU/HUI**. Disconnect sends `9F 0C 00`, detaches input, releases the state
subscription and closes both ports. An unplug waits for the same pair to return and reconnects automatically while in
Play with auto-connect enabled; no reconnection starts playback. Startup/reconnect feedback comes from the current mixer. Status distinguishes opened
ports and a mode request from actual received DAW input; sending a packet is not a mode
acknowledgement.
Avoid another DAW simultaneously controlling the same DAW pair.

## Remembered connection

`mix.launchkey.controller.v1` stores enabled, SysEx preference and both selected port
IDs/names after a successful connection. Startup/Play requests access once; a denied or
gesture-required request stays visible and requires manual Find/opt-in to retry. Port
state events reconnect a returned pair. Exact IDs also require the remembered name;
changed IDs may use a unique exact-name match. Ambiguity never picks another device.
The already-configured initial prototype had not persisted anything; migration is
restricted to its verified Launchkey MK4 61 DAW names and last-observed labels-on setting.
Subsequent successful choices replace that migration default.

Disconnect disables and saves auto-connect. Turning its checkbox off prevents future
automatic connections while leaving a currently connected surface usable; explicit
Disconnect releases it. Turning the checkbox on or explicitly connecting opts back in.
Closing the debug panel does not disable auto-connect. The setting survives app exit.

## Mapping

| Hardware | Existing application action |
|---|---|
| Faders 1–4 | Deck A–D gain, 0–100 |
| Faders 5–9 | Unused |
| Fader buttons 1–4 / 9 | Controller focus A–D / Master; matching LED |
| Knobs 1–3 | Focused deck/master FX A, Filter, FX B |
| Knobs 4–6 | Focused deck/master Low, Mid, High |
| Knob 7 | Focused deck Trim; unused in Master focus |
| Knob 8 | Master Trim, regardless of focus |
| Mod wheel | Selected deck scrub: movement up/down moves forward/back |
| Top pads 1–4 | Focused deck quick loop, half, double, loop on/off |
| Top pads 5–8 | Unused |
| Bottom pads 1–5 | Focused deck Play/Pause (green), held Cue (orange), Sync, beat back, beat forward |
| Bottom pads 6–8 | Unused |
| Play / Stop | Global `setRunning(true)` / `stopAll()` |

Focus belongs to the controller adapter; the app has no global selected-deck action.
It never selects a Prep song or loads a deck. The on-screen focus buttons provide the
same choice, show a selected state, and work with empty decks. Deck EQ, filter, sends
and Trim can be set before loading; loading retains controller focus. Select buttons
1–4 stay lit even when empty. `ControllerIndicator` passes the resolved deck inks from
the existing theme through a leaf effect: RGB SysEx matches those colors, with the
selected deck or Master button green and unselected deck colors at 35%. Without SysEx,
four distinct dim palette colors remain lit and selection is still green. No color work reaches App renders.
Assigned pads stay lit for every selected deck, including empty decks. Top-row loop
pads use the selected deck's theme ink at 35%; quick-loop and loop-toggle brighten to
100% when its loaded loop is enabled. Pad RGB uses selector43h; without SysEx, distinct
deck palette colors provide dim/bright states. Unassigned pads and all Master-focus
pads stay off. Track-dependent pad commands still require a ready deck. Bottom-row transport
order matches the selected deck UI; loop controls occupy the top row. All transport pads require a ready deck and retain the engine's existing saved-grid,
loop-boundary and playing-state policies. Nothing directly controls the DOM or DSP.

Incoming controller messages accept all 16 MIDI channels on the existing chosen inputs.
Message type, control/note number, value and hardware mode still determine routing.
Fader selectors use CC37–45 with nonzero presses and zero releases. The user's physical
capture was channel 1: `B0 25 7F`, `B0 27 7F`, `B0 26 7F`, `B0 2D 7F`, each with
zero-value releases. The previous BF-only selector decoder rejected these presses.
Faders, absolute/relative knobs, pads, transport and mode reports now also ignore the
channel nibble. Outgoing protocol channels remain unchanged: selector palette feedback
uses B0 and button RGB uses SysEx selector53h (pads use43h).

The panel's **Fader buttons · CC/RGB v2** diagnostic shows mode and raw selection evidence;
**Last hardware button packet** remains visible independently of continuous controls.
Manual Debug focus changes have been physically verified to update screen labels and
selector LEDs. The user confirmed physical button-driven focus works after removing channel filtering.
The new empty-deck layout and deck-colored loop pads still require a physical trial. No extra MIDI connection or permission request is introduced.

Faders are absolute native CCs, not MCU pitch-bend/motor faders; no motor movement is
sent. Plugin/Mixer/Sends knobs use absolute positions, initialized from app state.
Transport encoder mode uses the native relative pivot of 64 (65 means +1, 63 means −1),
not MCU signed magnitude. Mode reports gate each area; Custom modes are left alone.
Knob values reflect app changes back to the hardware. Channel-specific touch suppression
is disabled: touch CC21–28 and absolute knob CC21–28 cannot be distinguished when channels
are ignored, so these IDs always mean positions. Connection initialization disables DAW touch events
using documented feature CC71 on channel 7 (`B6 47 00`) before knob feedback. If another
application enables touch output, its events cannot be distinguished from positions
without channel information. Other overlapping feature-control replies likewise use
the mapped control interpretation; the adapter does not enable all feature replies. An incoming absolute position is cached before
the engine publishes, so it is never echoed straight back into a moving encoder.
Hardware acceleration is retained without extra scaling. The packet log renders at
most every 50ms. Continuous controls use `continuous.ts`: the leading value applies
immediately, then at most 60 batches/second retain only the latest absolute value per
control or sum relative deltas. There is no growing event queue or trailing debounce.
Focus/mode changes flush the final value before changing targets; disconnect preserves
the final queued value and clears timers. Discrete buttons and Cue releases bypass
this limiter. Outgoing state feedback is separately coalesced to 20Hz and changed-only;
SysEx labels do not resend on each engine tick. Clock/realtime and unused poly-aftertouch
are discarded before packet formatting or log notifications. LEDs report focus, running state and loop state.
With SysEx enabled, the stationary screen shows the selected deck letter and track
title, or Empty deck; Master selection shows Master. All eight knob labels remain
assigned, including the unused position in Master focus.
The stationary display uses target32, arrangement1 (two text lines). Target33 uses the
same arrangement for a brief selection overlay, explicitly triggered with config127
on each valid selector press, including reselecting the same deck. The hardware's
existing temporary-display timeout returns to the stationary screen; no host timer
or display-timeout setting is changed. Knob targets21–28 are untouched. Text is
sanitized and limited to32ASCII characters per field. Track changes update the idle
title through changed-only feedback; ordinary mixer publishes do not resend text.
Selection refreshes only changed values rather than clearing the whole sent cache.
The diagnostic now includes the resulting deck/title alongside received raw bytes.

No encoder LED rings are invented for this hardware.

Cue uses `cueDeck(id, true/false)`, not the headphone cue control. Note Off and Note On
velocity zero both release it. Duplicate presses are ignored; disconnect, mode/focus
change and global Stop release held cues. Play while the focused deck’s Cue is held requests
`setDeckPlaying(id, true)` even while audition is already playing, preserving the engine's
latch: releasing Cue then neither stops nor returns the position. The shared engine
auditions immediately without beat-phase correction; pressing Play while held aligns
to the running reference only with Sync enabled. Sync off retains the existing voice
and timing. The same behavior applies to on-screen controls. Play/Cue use stationary channel-1 palette
colors 22/10 at rest and 21/9 while active, including the resting layout on empty decks.
Master focus pads are off. Pad-mode reports clear the sent cache before feedback,
so returning to DAW mode restores colors. This verifies generated packets against the
MK4 protocol; actual physical colors still require the hardware trial. Knobs 1–3
mirror the UI as FX A, Filter, FX B in input, outgoing positions and screen labels.
Filter retains its bipolar −100…100 range in both absolute and relative modes; FX
sends remain 0…100. Knobs 4–6 are Low, Mid, High; engine EQ arrays are stored in
High/Mid/Low order, so both input and feedback reverse those three indexes. Knob 7
addresses deck Trim and is ignored (with no position feedback) in Master focus.
Knob 8 always addresses global Master Trim and its feedback always reads that value.
EQ remains −24…12 dB and both trims −12…12 dB.

### Neutral detents

`detent.ts` is MIDI-only. Filter, three EQ bands and both trims capture their actual
neutral value 0 within two MIDI steps and remain there until movement exceeds four
steps. EQ's asymmetric range is respected: neutral is not its normalized midpoint.
Relative raw travel is remembered while output stays snapped, so deliberate turns
escape instead of sticking forever. External edits invalidate that remembered base;
focus, mode and disconnect clear it. FX sends have no detent. Incoming absolute
positions cache the resulting app value before publication, preventing the soft
capture from feeding a position reset into the moving encoder. Unchanged values do
not publish again. The original 60Hz limiter and local React subscriptions stay intact.

### Mod-wheel input and scrub

The MK4 exposes wheels through its standard MIDI interface, separate from DAW controls.
After the selected DAW pair opens, the adapter opens only its matching `MIDI Out`
input (on this machine `Launchkey MK4 61 MIDI Out`), remembered by ID and exact name.
It accepts CC1 on the keyboard's configured channel; the panel reports the actual
received channel and bounded log records the bytes. Notes, pitch bend and other CCs
are ignored. Missing/failed/ambiguous standard ports leave DAW controls working; port
return reconnects only that input. Disconnect, Prep and disposal release it too.
No MIDI output is opened for scrubbing and no playback is started by connection.

`jog.ts` primes its baseline from the first CC1 value without moving audio. Later
value differences are summed in bounded 60Hz batches: a full 127-step sweep moves
four beats. A single canonical `moveDeck` gesture retains the source group's playing
or paused state and clamps at audio bounds; it ends after 120ms without movement.
Discrete transport finishes the gesture first. Focus/disconnect flush the old target
then reset the baseline; track replacement and port loss discard stale pending
movement. Empty/Master targets do not move. Wheel channel and physical feel remain
part of the hardware trial, not claims inferred from the parser tests.

### Unassigned ninth fader

CC13 from physical fader 9 is ignored. Button 9 still selects Master. The removed
master level has not been reintroduced in the UI and is not controller-accessible;
the engine's existing `master` gain remains internal. Previous controller use may
have attenuated a currently running engine. This change never raises that gain
unexpectedly. A newly created engine defaults it to 100; any live recovery must be
coordinated with the user while stopped/muted. Master Trim is the bounded ±12 dB
control on knob 8, not a replacement silence-to-unity master fader.


Debug rate counters sample once a second: input including ignored clock, applied
continuous controls, engine publishes, feedback passes, output packets/bytes/SysEx,
local subscriber notifications, maximum event age and bounded pending controls. These
are diagnostics, not a claim of measured end-to-end audio latency. The sustained-burst
tests verify the 60Hz bound, final values, summed turns, immediate discrete edges and
latest-only outgoing feedback. The rate counters remain available for hardware diagnostics. The user reported continued
slow drawing despite the limiter. A controlled React measurement then found the full
App subscription rerendering every library row on every fader update. Mixer state now
subscribes in PlayView and Header, leaving the engine owner and library untouched.
See [control render isolation](play-view.md#control-render-isolation) for measured
before/after costs and the live-validation limit.

## Validation and limits

CoreMIDI enumeration verified the MK4 61 identity and MIDI/DAW pairs. Unit tests exercise
packet validation, releases/unrelated messages, parameter routing, mode changes,
suppression, deduplicated feedback, output loopback, unplug/reconnect and canceled opens.
No simulator UI was built. The coordinating task visually verified the panel and its
button labels in the actual Electron window. The user subsequently confirmed hardware
control works. Read-only CoreMIDI capture recorded native BF15 absolute encoder values
and 90 60/61 pad presses plus A0 aftertouch. A turning sequence advanced in steps of four
but repeatedly jumped backwards, consistent with host position echoes resetting the
encoder. The regression test prevents that echo. After the App subscription isolation, the user confirmed very smooth fader/UI
response on the actual keyboard, comparable to their DJ controller. This is subjective
hardware acceptance, not measured FPS or end-to-end latency. Other controls, LED and
display behavior still need confirmation. The bounded message monitor records raw incoming/outgoing
bytes for that trial. A port opening successfully is not proof of every control mapping.

The initial MCU exploration is not active in this adapter. Other Launchkey generations,
HUI, MCU emulation, Push, MIDI Learn, banking, recording, keys, custom pad modes and
firmware changes are outside this prototype.

## Protocol references

- [Novation feature controls](https://userguides.novationmusic.com/hc/en-gb/articles/23754916107922-Launchkey-feature-controls)
- [Novation MK4 DAW protocol](https://userguides.novationmusic.com/hc/en-gb/articles/23754923378066-Launchkey-Programmer-s-DAW-mode)
- [Novation MK4 programmer reference, diagrams](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/launchkey_mk4_programmer_s_reference_guide_v2_en.pdf)

The guide maps faders to BF CC5–13, Plugin encoders to BF CC21–28, relative encoders to
BF CC85–92, fader buttons to CC37–45, top pads to notes96–103 and bottom pads to
notes112–119. Transport buttons use BF CC115/116. Only the DAW pair is used.


### Screen diagnostics

Manual Debug deck selection has been physically verified to update the hardware screen.
**Screen output** reports actual SysEx permission, successful MIDI API display-send count,
stationary/selection configuration, last operation and caught output errors. A send count
is API acceptance, not a hardware acknowledgement. These fields observe the existing path
without changing display configuration, permissions, ports or playback. The earlier blank
screen report was superseded by the manual-selection trial; the remaining mismatch was
physical B0 selector input rejected by the BF-only decoder.

### Fader labels and touch terminology

With SysEx enabled, targets5–8 display **Deck A Level** through **Deck D Level**.
Targets9–13 say **Unused**, matching unassigned faders5–9. Configuration44h selects the
numeric layout and automatic display on movement, without the touch-trigger bit.
The numeric value is the hardware MIDI value, not a dB claim. Existing knob labels and
stationary deck/title remain intact; configuration and text are cached rather than
resent during continuous movement.

Novation documents continuous-control touch messages on channel15. Its display config
describes the touch gesture as Shift + rotate; this is not evidence of capacitive
touch-sensitive hardware. Touch reporting stays disabled in the all-channel input mode.
Movement labels and new pad colors require physical verification.
