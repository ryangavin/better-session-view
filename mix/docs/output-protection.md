# Stem gain and output protection

Play stem knobs display −∞…+6 dB. Storage and commands remain linear percent:
0 is exact silence, 100 unity, and 100×10^(6/20) the upper bound. Existing values retain
their amplitude. stemGain.ts owns the bound and text; decks.ts provides a stable shared
Param/default/display callback. Commands clamp finite values and ignore non-finite
values. The audio graph still divides stored levels by 100. Reset stays at unity.

## Routing

Dry deck sum and both wet FX returns enter master Trim/EQ/filter, then the master limiter.
Its output feeds local main, published Master, recording taps, master meters and the
headphone master blend. Direct pre-fader cue gets a matching 5 ms delay before mixing
with that master blend. The final headphone sum and headphone level feed their own
limiter before the hardware cue pair and published Phones/recording taps.

Matching cue delay prevents combing from different lookahead latencies when mixing
identical cue/master signals. Gain reduction in the master path can still make the
blend inputs differ. Published Deck A–D and isolated FX taps remain unlimited.
Link Audio PCM16 encoding saturates their overs at its boundary. There is no per-deck
compression; these limiters do not prevent distortion inside upstream nonlinear FX.

## Algorithm and lifecycle

peakLimiter.ts uses fixed-size delay buffers and a monotonic maximum queue: amortized
O(1) processing per sample, no per-block allocation. Both channels share one gain.
The lookahead peak determines immediate gain reduction; release approaches unity with
a 50 ms time constant. Ceiling is −1 dBFS, with no makeup gain or static attenuation.
Subthreshold samples are unchanged after delay when no earlier overload is releasing.
Non-finite input becomes silence. Heavy sustained overload necessarily changes dynamics.

Lookahead is round(sampleRate×0.005) samples. Main has nominal 5 ms added latency;
headphones nominal 10 ms, because their aligned blend passes a second limiter.
At 44.1 kHz one stage is 221 samples, about 5.01 ms. This is sample-peak, not
oversampled true-peak limiting: reconstructed/inter-sample peaks are not guaranteed.
It is not a loudspeaker or hearing safety guarantee.

outputProtection.ts loads one local bundled AudioWorklet module per context and creates
separate master/phones processors with stable external nodes. No CDN dependency.
Before readiness there is no bypass. Playback awaits readiness, while context.resume
is requested immediately in the user gesture. Module/processor failure reports an error
and leaves output silent. Disposal prevents late module completion from reconnecting.
Context replacement creates fresh processors and matching cue delay. Master meters
read protected output.

## Verification

Pure DSP tests cover exact unity after delay at 44.1/48/96 kHz, overload/impulses,
stereo linking, block boundaries, recovery and invalid samples. Lifecycle tests cover
failed load, disposal during load, shared module/separate processors and processor failure.
Engine tests retain asynchronous Cue/Play semantics and verify unchanged stored stem gains.

The isolated OfflineAudioContext regression in mix/dsp/limiter-render.test.ts renders
real bundled worklets at three rates: subthreshold error is zero and a 50/50 cue/master
blend stays aligned. Actual engine rendering sums four decks with four +6 dB stems each,
+12 dB deck/master Trim and both FX sends. Hardware main, Phones and master recording tap
stay at/below the ceiling; master tap matches main. Individual deck output exceeds unity,
confirming no hidden per-deck dynamics. Results: report/mix-dsp/limiter-render.json.
Production Vite build includes the worklet. These are offline checks, not measured
physical output latency. Native UI has been visually verified to show 0.0 dB on all
16 stem knobs; mute/max/reset are also covered through the widget/host contracts.
