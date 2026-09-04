# Musical alignment experiment

`src/debug/alignment/`: `model.ts` derives an explicit policy map, `render.ts` reads it
through the existing export sinc, `render.worker.ts` keeps that work off the UI thread,
and `AlignmentLab.tsx` exposes it in the debug workspace. This is a bounded audio proof
of concept, separate from the main window's measured pin-density policy in `pinned.ts`.

## Structure and policy

The source is the app's **kept** `Beats`, including edits. Beat analysis's **Take** is
the existing way to keep a revised analysis before opening this experiment. No analysis
runs here, and changing policy writes neither the grid nor slices nor main playback.
Configuration lasts for this mounted tab; Download timing evidence saves the request,
complete source map, track ID, integer pins, per-beat positions and speeds as JSON.
There is no configuration import yet.

Source start/end are displayed as one-based bars, with the end exclusive. Destination
starts at local bar 1 / sample zero; meter is explicitly 4/4. The range must lie inside
both the stored beat map and decoded audio. There is no end extrapolation or automatic
padding. Audio outside the selection is excluded, not silently included in its render.

- Original timing copies the selected samples unchanged; the target tempo is disabled.
- Recurring alignment requires a boundary every configured whole number of bars (1–64),
  counted from the selection start. Four and eight are ordinary values. Endpoints always
  hold; a final shorter span retains its actual musical length. No section cuts or
  interior detected beats become extra pins.
- Named section fits just the selected endpoints to an explicit whole number of output
  bars (1–64). Choosing an existing slice copies its source boundaries/name only; the
  user declares output bars. A name never implies a length. This policy does not combine
  with recurring boundaries. Choosing a last section extending beyond the stored beat
  map gives a visible range error, not extrapolation.

## Rounding and rendering

All source pins round once to canonical source samples. All destination pins round
absolute cumulative musical positions once at the canonical rate: `round(beats*60*rate/bpm)`.
Thus every required destination is within half a sample of its ideal, adjacent spans
share one integer boundary, and total duration is not a sum of independently rounded
spans. Between pins the map is affine. Timing-interval proportions are preserved;
absolute milliseconds change with speed. Invalid/nonmonotonic maps and collapsed
boundaries fail visibly. No drift threshold can add pins.

Rendering requires every decoded stem's rate and length to match the canonical map.
The worker receives one map and all channels, cropped with 64 source samples of context
on either side (the existing sinc uses 32 lobes). Original timing bypasses the sinc.
Other policies read every contiguous span at one speed against the shared source crop.
No per-stem analysis or phase decisions, independent rounding, or resampler latency are
introduced. Existing separation/import alignment is assumed; equal lengths alone do not
establish that physical transients line up. No latency is guessed or compensated here.

This renderer is the existing **varispeed** export resampler, not the main player's
Signalsmith pitch-preserving worklet. Pitch follows speed. Because that sinc has no
speed-dependent anti-alias filter, this experiment refuses source/output speeds outside
0.95–1.05; even inside that bound small high-frequency aliasing is possible. Both source
and output are limited to 120 seconds to bound memory and interactive render work.
The mathematical policy is broader than these explicit preview limits.

The UI draws rigid destination beats, mapped descriptive beats, and required pins
separately. The table shows sample boundaries and successive rate changes. Recurring
offsets compare corresponding descriptive beats; section offsets compare to the nearest
rigid grid beat because no internal correspondence is required. Neither metric triggers
correction. Original mode shows region ends, with no destination grid.

## Audition and evidence

Render all stems produces real audio. Native players compare the original selected
region with the fitted result, recombined or one stem at a time, before mixer effects.
Starting either pauses the other and main playback. An optional destination metronome is
mixed only into the fitted audition, never downloaded stem WAVs. Both players can repeat.
The fitted player counts observed end-to-start playhead wraps so repeated playback can
be watched. Manual seeking from the last second to the first also increments it; media
time events do not measure device-output gaps or certify gapless playback.
Each stem downloads as float32 WAV through the existing `wavOf` encoder. Policies changing
invalidate old audio and terminate active workers; Cancel render and unmount also stop work.
Object URLs are revoked on replacement/unmount.

Exact frame counts are not proof of clean transients or loop joins. Piecewise rate steps
are unsmoothed. Native media looping is an audition convenience, not a sample-accurate
sequencer conformance test. Repeating a fixed rounded file can accumulate its unavoidable
sub-sample duration error. Smoothing, pitch-preserving rendering, measured separation
latency, representative live/swing/weak-transient listening and DAW verification remain
separate experiments. No claim of artifact-free audio is made.

## Validation

`model.test.ts` exercises 4/8/custom recurrence, partial final spans, declared sections,
original bit-exact samples, unconstrained swing, affine interval ratios, reproducibility
without source edits, malformed requests, absolute rounding, WAV frame counts, shared
aligned/polarity-inverted impulses at rate changes, constant-signal continuity and crop
context equivalence. These tests run the actual resampler, not just display metadata.
An additional four-bar impulse-loop test repeats rendered samples three times and checks
the downbeat, WAV frame count, and accumulated bound from whole-file sample rounding.

The development browser at `/harness/reach.html` exercises the same renderer on library
audio. This does not replace human listening or establish physical separation latency.
The next useful experiment is a known drifting/live reference compared against these
minimal maps, with measured boundary transients, before choosing rate smoothing.

On 2026-09-04 the visible browser rendered SOFI Needs a Ladder at 128.06 BPM:
bars 1–9 used three four-bar boundaries and produced 719,663 samples per stem;
switching to eight bars removed the midpoint. Original mode produced the untouched
719,694 source samples. The four-bar region 22–26 produced 359,831 samples per stem,
and its fitted player with the destination click registered three automatic restarts
without seeking. The A/B players paused each other, and changing policy removed stale
audio. This verified rendering and repeated playback, not seamless joins: no browser
audio capture/listening tool was available for a listening judgment.
