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
| Faders 5–8 | Unused |
| Fader 9 | Master gain |
| Fader buttons 1–4 / 9 | Controller focus A–D / Master; matching LED |
| Knobs 1–7 | Focused deck/master Send A, Send B, filter, low/mid/high EQ, trim |
| Knob 8 | Unused |
| Top pads 1–4 | Focused deck quick loop, half, double, loop on/off |
| Top pads 5–8 | Unused |
| Bottom pads 1–5 | Focused deck Play/Pause (green), held Cue (orange), Sync, beat back, beat forward |
| Bottom pads 6–8 | Unused |
| Play / Stop | Global `setRunning(true)` / `stopAll()` |

Focus belongs to the controller adapter; the app has no global selected-deck action.
It never selects a Prep song or loads a deck. The on-screen focus buttons provide the
same choice. All pads follow that focus and are inactive in Master focus. Bottom-row transport
order matches the selected deck UI; loop controls occupy the top row. All transport pads require a ready deck and retain the engine's existing saved-grid,
loop-boundary and playing-state policies. Nothing directly controls the DOM or DSP.

Faders are absolute native CCs, not MCU pitch-bend/motor faders; no motor movement is
sent. Plugin/Mixer/Sends knobs use absolute positions, initialized from app state.
Transport encoder mode uses the native relative pivot of 64 (65 means +1, 63 means −1),
not MCU signed magnitude. Mode reports gate each area; Custom modes are left alone.
Knob values reflect app changes back to the hardware, except while a reported touch is
held; release refreshes the position. An incoming absolute position is cached before
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
With SysEx enabled, the screen names mix[flow], focus and the seven knob assignments.
No encoder LED rings are invented for this hardware.

Cue uses `cueDeck(id, true/false)`, not the headphone cue control. Note Off and Note On
velocity zero both release it. Duplicate presses are ignored; disconnect, mode/focus
change and global Stop release held cues. Play while the focused deck’s Cue is held requests
`setDeckPlaying(id, true)` even while audition is already playing, preserving the engine's
existing latch: releasing Cue then neither stops nor returns the position. No DSP or
engine transport behavior was changed. Play/Cue use stationary channel-1 palette
colors 22/10 at rest and 21/9 while active, rather than gray 1 while paused. Empty
or Master focus pads are off. Pad-mode reports clear the sent cache before feedback,
so returning to DAW mode restores colors. This verifies generated packets against the
MK4 protocol; actual physical colors still require the hardware trial.

Debug rate counters sample once a second: input including ignored clock, applied
continuous controls, engine publishes, feedback passes, output packets/bytes/SysEx,
local subscriber notifications, maximum event age and bounded pending controls. These
are diagnostics, not a claim of measured end-to-end audio latency. The sustained-burst
tests verify the 60Hz bound, final values, summed turns, immediate discrete edges and
latest-only outgoing feedback. The live rate sample remains part of the hardware trial. The user reported continued
slow drawing despite the limiter. A controlled React measurement then found the full
App subscription rerendering every library row on every fader update. Mixer state now
subscribes in PlayView and Header, leaving the engine owner and library untouched.
See [control render isolation](play-view.md#control-render-isolation) for measured
before/after costs and the live-validation limit.

## Validation and limits

CoreMIDI enumeration verified the MK4 61 identity and MIDI/DAW pairs. Unit tests exercise
packet validation, releases/unrelated messages, parameter routing, mode changes, touch
suppression, deduplicated feedback, output loopback, unplug/reconnect and canceled opens.
No simulator UI was built. The coordinating task visually verified the panel and its
button labels in the actual Electron window. The user subsequently confirmed hardware
control works. Read-only CoreMIDI capture recorded native BF15 absolute encoder values
and 90 60/61 pad presses plus A0 aftertouch. A turning sequence advanced in steps of four
but repeatedly jumped backwards, consistent with host position echoes resetting the
encoder. The regression test prevents that echo; subjective response after the fix,
other controls, LED and display behavior still need confirmation. The bounded message monitor records raw incoming/outgoing
bytes for that trial. A port opening successfully is not proof of every control mapping.

The initial MCU exploration is not active in this adapter. Other Launchkey generations,
HUI, MCU emulation, Push, MIDI Learn, banking, recording, keys, custom pad modes and
firmware changes are outside this prototype.

## Protocol references

- [Novation MK4 DAW protocol](https://userguides.novationmusic.com/hc/en-gb/articles/23754923378066-Launchkey-Programmer-s-DAW-mode)
- [Novation MK4 programmer reference, diagrams](https://fael-downloads-prod.focusrite.com/customer/prod/downloads/launchkey_mk4_programmer_s_reference_guide_v2_en.pdf)

The guide maps faders to BF CC5–13, Plugin encoders to BF CC21–28, relative encoders to
BF CC85–92, fader buttons to notes37–45, top pads to notes96–103 and bottom pads to
notes112–119. Transport buttons use BF CC115/116. Only the DAW pair is used.
