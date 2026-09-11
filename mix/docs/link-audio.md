# Audio outputs in a Link session

`src/linkAudio.ts`, `linkAudioWorklet.ts`, `linkAudioTypes.ts`, `electron/linkAudio.ts`,
`native/link-audio.cpp`, and `tools/link-audio.ts`.

## What a person receives

The header's **Link Audio** switch enables one peer called **mix[flow]**. Every loaded
stem is a named stereo channel: Vocals, Drums, Bass and Other, with Guitar and Piano
when the model supplies them. Live 12.4 or later can select the peer and then each stem
on separate audio tracks. Enabling Link Audio turns **Local audio** off to avoid hearing
the mix twice. That switch can restore the computer's speaker output while sharing;
it affects only a gain after the master sum, never the published stems. Disabling Link
Audio or a publisher failure restores local audio. Both changes use a short gain ramp.

Feeds come **after** stem EQ, level, mute and solo. They are not files read a second
time. Link enables synchronized, warped playback as well as audio sharing. The header
shows the session tempo; editing it proposes that tempo to Link, and changes from other
peers retime the actual playback. The supported shared tempo range is 20–999 BPM.
An existing session supplies its tempo; without peers, the app keeps its current tempo.
Loading another song changes its source grid, never the shared tempo. Disconnecting
keeps the last shared playback tempo. Sharing is off on every renderer load.

## Starts, stops, and the source grid

`linkTiming.ts` maps the native timeline to the audio context. A start calls the SDK's
`setIsPlayingAndRequestBeatAtTime` with a four-beat quantum and the **rendered beat at the
playhead**, derived from the selected pins. A pickup before the first downbeat therefore retains
its phase. The returned native start time is converted to the hardware presentation
clock and scheduled ahead in the audio engine. The header says **waiting for bar**
until playback begins; pressing Pause or Stop cancels the pending start. A late command
reply is replanned rather than played off-beat. With no peers the SDK allows an immediate
launch, subject to the engine's scheduling lead.

Stop and Pause are immediate and publish a stop request. Incoming start/stop changes
are followed without echoing them; joining a session does not adopt an already-playing
state. Live must also have **Start Stop Sync** enabled to exchange these commands.
Loading a track, entering grid editing, finishing playback, or opening analysis stops
only this app. Those actions must never stop the other players.

Link playback always uses the stretcher. The header offers **4 bars** (the default),
**8 bars**, **16 bars**, or **Sections** for Link pins — `linkEvery` in `state.ts`,
apart from the export dialog's loop length, which is what the files are for. Section
boundaries always pin; between pins the original timing ratios remain intact. Launch
phase uses the pinned output position, so seeking to an intentionally late interior beat
does not move the subsequent phrase off the Link grid. The ordinary
`straight()` tolerance is unsuitable here: an approximately steady recording can still
drift against a shared beat clock. A failed stretcher prevents a synchronized start and
reports the failure instead of silently falling back to unsynchronized playback.
The source map remains fixed while playback tempo changes. When no measured map exists,
the current even grid is used; aligning real musical downbeats still requires a correct
source grid. Tempo and phase updates project through the same pinned schedule from
the shared beat position, preserving interior groove while correcting
more than 3ms of drift instead of accumulating the delay of each tempo notification.
That threshold governs scheduling corrections; it is not a measured end-to-end latency
guarantee for Live or a network.

`LinkAudioSender` takes named `AudioNode` outputs. It has no stem-specific routing, so
the future Play engine can supply Deck A, Deck B, Deck C, Deck D and Master as five
stereo channels. **The widgets Play room remains a silent study.** It has no audio
engine to connect and imports none of this. Deck effect, crossfader and master tap
positions belong to that engine's integration, not to the publisher. Play Master is
tapped after its peak limiter, and Phones after its separate final limiter. Published
decks have no per-deck limiter; PCM16 encoding still saturates their overs at the
transport boundary. Keep individual deck feeds in range when publishing them.

## One audio clock and bounded buffers

One capture worklet has a stereo input per named output. Each 1,024-frame block holds
interleaved signed 16-bit PCM for each stream, in stream order. Mono is duplicated;
disconnected inputs are silent; non-finite values become silence; values outside
full scale are clipped. These are Link Audio's wire samples, not changes to local
floating-point playback.

The processor owns three reusable buffers. They travel to the renderer and return
after the IPC write completes. Only one audio write may be outstanding; when a reader
falls behind, audio is dropped rather than accumulated. The UI says **gaps** and its
tooltip counts dropped capture/forwarding blocks. This does not measure packet loss
inside the network or the receiver.

Clock snapshots are captured by the native SDK before the worklet uses their tokens.
They are retained across the pipe so a subsequent tempo or session change cannot be
applied retrospectively to an older rendered block. A short request/reply measurement
correlates the native clock and `performance.now()` using the least delayed recent
sample. `AudioContext.getOutputTimestamp()` maps that to the hardware presentation
time; every block is dated from its first audio frame, not its IPC arrival. This is
an estimated clock correlation, not a claim of sample-exact network synchronization.

Worklet ticks keep clock refreshes running during audio playback; an interval also
keeps an idle publisher alive. Expired clock data is dropped. The native process bounds
its snapshot history and rejects audio more than half a second from its current clock.
The Electron window disables background throttling so Live can be in front without
starving the PCM handoff. The browser harness uses the existing dev-only reach adapter
and incurs its JSON/base64 overhead; the packaged app uses Electron structured clones.

## Native ownership

Each enabled sender has one helper process and one Link Audio instance, with Start Stop
Sync enabled. A private control request changes tempo or plans a start; start planning
returns the committed snapshot and exact native launch time. The main
process validates channel names, counts, block dimensions and timing before writing a
private stdin pipe. Requests have timeouts, the queue is bounded, and the helper never
opens the library's audio files. It announces sinks for its lifetime. The SDK sends only
to subscribed sources; no subscription means no audio network traffic.

Changing tracks with the same output layout retains the peer and sink identities.
Changing the layout, clearing the track, disabling sharing, or reloading the renderer
releases that publisher. A missing renderer heartbeat expires the session after five
seconds; quitting the app kills all helpers. Errors disable sharing visibly and leave
local playback running. Toggle Link Audio again to retry.

## Build and check

`tools/prepare.ts` calls `prepareLinkAudio()` before the Electron build. It checks out
Ableton Link revision `902aef95bf94af49746fdda5369b42cdcfa1e6d2` and its pinned Asio
submodule, then builds the small C++17 helper with the macOS system compiler. The
fingerprint includes our source, SDK revision and CPU architecture. Nothing downloads
at playback time; `bin/link-audio` ships as an ordinary executable for signing.

The helper is GPL-2.0-or-later, using Ableton's GPL SDK option. Its complete corresponding
source, Asio source, license and standalone build command ship in
`bin/link-audio-source/`. The build checkout and fingerprint do not ship. This component
is distinct from the LGPL FFmpeg decoder.

`npm run typecheck` and `npm test -- --project=mix` cover types, input validation,
five-way sample routing, silence, clipping, timestamps, snapshot changes, bounded
buffer recovery, quantized scheduling, late-plan cancellation, remote starts, and
retiming from shared beat position. After preparation, `node mix/tools/check-link-audio.ts` builds a real
SDK receiver and verifies discovery plus independent left/right PCM and timeline
metadata for four stems, five deck/master outputs, and six stems. This check needs
local network discovery enabled. `node mix/tools/check-link-sync.ts` builds three real
SDK peers using a separate discovery port, so tempo and start/stop tests cannot change
the musician's real session. It covers initial tempo, joining, 20–999 BPM changes,
pickup phase and shared start/stop. The incumbent is allowed to establish itself before
joining: the SDK uses session ID order when sessions are founded within 500ms of each
other. These checks do not replace monitoring/recording in Live.

Upstream: [Link Audio concepts and API](https://ableton.github.io/link/),
[Live Link Audio FAQ](https://help.ableton.com/hc/en-us/articles/25425913328924-Link-Audio-FAQ).


## Four-deck Play owner

Play uses its own single `MixerEngine` and the same `LinkAudioSender`. It supplies loaded
deck outputs, master and Phones instead of preparation stems. Mode changes pause the
outgoing engine locally and release its publisher, preventing two publishers from the
same window. Header transport/tempo commands address the visible engine. Deck Sync is
explicit: synced voices follow the shared tempo/beat phase; native-speed decks do not.
See [play-view.md](play-view.md) for routing, scheduling and validation boundaries.
