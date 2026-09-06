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

Feeds come **after** stem EQ, level, mute and solo, and contain the actual warped or
unwarped playback. They are not files read a second time. Enabling sharing does not
change the record's tempo, enable Warp, or synchronize start/stop. The Link instance
joins the session without proposing a new tempo; it provides the timeline used to
timestamp audio. Sharing is off on every renderer load.

`LinkAudioSender` takes named `AudioNode` outputs. It has no stem-specific routing, so
the future Play engine can supply Deck A, Deck B, Deck C, Deck D and Master as five
stereo channels. **The widgets Play room remains a silent study.** It has no audio
engine to connect and imports none of this. Deck effect, crossfader and master tap
positions belong to that engine's integration, not to the publisher.

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

Each enabled sender has one helper process and one Link Audio instance. The main
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
five-way sample routing, silence, clipping, timestamps, snapshot changes and bounded
buffer recovery. After preparation, `node mix/tools/check-link-audio.ts` builds a real
SDK receiver and verifies discovery plus independent left/right PCM and timeline
metadata for four stems, five deck/master outputs, and six stems. This check needs
local network discovery enabled. It does not replace monitoring/recording in Live.

Upstream: [Link Audio concepts and API](https://ableton.github.io/link/),
[Live Link Audio FAQ](https://help.ableton.com/hc/en-us/articles/25425913328924-Link-Audio-FAQ).
