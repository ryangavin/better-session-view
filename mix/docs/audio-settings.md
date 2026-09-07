# Audio settings

`src/audioSettings.ts`, `src/components/SettingsModal.tsx`, and
`replaceAudioContext()` in `src/engine.ts` and `src/play/engine.ts`.

The shared header's **Settings** button opens a widgets Modal in Prep or Play, with
Audio and Theme sections. Audio opens first; switching sections preserves draft audio
choices. Theme edits apply and save immediately without restarting audio. The audio
Apply button appears only in Audio; Done closes either section. Output
interface, processing sample rate and latency preference are machine-local settings
under `mix.audio.v1`, independent of the library and theme. Defaults follow the system
output and its preferred sample rate, with Web Audio's `interactive` latency hint.
Explicit rates are 44.1, 48, 88.2 and 96 kHz. Latency choices map to `interactive`,
`balanced` and `playback`; they are hints, not promises of a hardware buffer size.

Output discovery uses `enumerateDevices()` and refreshes on `devicechange`. A browser
with `selectAudioOutput()` also offers its permission chooser. No microphone stream is
opened to discover speakers. Hosts can expose only their default output until device
permission is granted. An explicit device requires AudioContext sink selection; an
unsupported host reports this rather than silently routing to another interface.

**Apply & restart audio** first stages two contexts using the requested sink, rate and
latency, validates the sink through `setSinkId()` when available, and checks the rate.
Failure closes staged contexts without touching the current graphs or preferences.
Closing the dialog during this asynchronous validation cancels the apply. Settings
persist only once validation succeeds. Prep decoding disables Apply; an in-flight deck
load is canceled during restart and displays a retry message.

Both engines then pause locally, release their Link Audio publishers and rebuild their
graphs on the staged contexts. Loaded AudioBuffers, source positions, mixer controls,
section selections, cue points and captured loops survive. Pending launches and held
Cue auditions are canceled. Nothing automatically resumes or sends Stop to Link peers.
Future contexts use the same preferences. The UI reads actual rate, destination channel
capacity and reported processing/output latency from the visible engine.

Retained buffers keep their original sample grid across a device-rate change. Prep's
`rate` getter therefore reports the buffer rate once loaded. Web Audio resamples native
sources; the stretcher prepares buffers for its new context rate. Analysis and waveform
coordinates must not be reinterpreted as samples at the new hardware rate.

The output interface serves both views. Play keeps master on channels 1/2 and headphones
on 3/4 when the destination exposes at least four channels. This is not a separate
headphone-device selector. Processing sample rate is not a claim about the Core Audio
hardware clock: exact driver buffers, clock source and aggregate-device configuration
remain in macOS Audio MIDI Setup or the interface driver.

Tests cover preference validation, staged-context cleanup, retained Prep buffer rate,
and a mixer restart with selected sections, source position and trim intact. Browser QA
checks the settings dialog and a real sample-rate change; physical interface switching
requires an Electron/hardware check.
