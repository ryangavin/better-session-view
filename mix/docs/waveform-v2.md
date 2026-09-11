# Waveform V2

`src/debug/waveform-v2/` compares two focused refinements of Waveform lab's
**A · Musical topology**. The existing lab, rendering experiments and production
waveforms remain unchanged. Opening this debug tab measures the selected decoded
stem sum without starting playback or selecting a different track.

## Comparison

**Three-band** divides the mirrored peak silhouette into blue lows, orange mids and
pale highs. Their thickness is relative broad-band RMS, not additive band peaks.
**Spectral RGB** colors the same silhouette with red lows, green mids and blue highs,
using the established 1/2/4 weights and a restrained color curve. Both use quiet fills
and a slightly brighter one-pixel edge, without an RMS center, smoothing or glow.
The first-order crossovers are 250 and 2500 Hz; these are frequency colors, not stems.

Both rows share real source time and one fixed whole-track measured sample-peak
reference through pan and zoom. A screen column takes the maximum peak of every
source bin intersecting that pixel. Color and stem activity use duration-weighted RMS
of those same bins, including the partial final bin. No interpolation invents detail
between bins. Narrow attacks survive overview reduction; silence stays empty. This
is measured sample peak, not an oversampled inter-sample true-peak meter.

The compact rows sample the existing Play lane's height on mount (72px fallback when
no Play lane exists). The height is printed beside the preview; no window resize is
performed. **Larger view** adds both designs at 220px with the same source, range,
width and normalization. Scroll pans, Shift-scroll zooms; Whole track resets the range.

**Stem activity** adds separate named 14px strips using the app's stem colors and a
fixed −60 to 0 dBFS RMS opacity scale. It does not recolor the frequency waveform.
Silence/below-floor activity is transparent; separation bleed can remain visible.
These two view choices use independent `wdg-debug:mix-waveform-v2-large` and
`wdg-debug:mix-waveform-v2-stems` storage keys.

## Legacy RMS

The collapsed **Legacy RMS experiment** preserves the earlier component, its renderer,
aligned half-point-per-pixel buckets and guarded `wdg-debug:mix-waveform-v2` settings.
It mounts only while expanded. Linear/dB scale, emphasis, contrast, window RMS versus
peak of short RMS, raw overlay, scale comparison and section labels remain available.
Peak/RMS share centered integer-bin intervals, Float64 duration-weighted power prefixes
and the whole-track peak reference. Bounded cubic controls avoid overshoot; the luminous
center is capped and clipped to the peak. Silent input stays zero on both scales.
Those controls affect the legacy preview only.

## Verification

`topology.test.ts` covers attack preservation, silent gaps, fixed-reference quiet zoom,
source-resolution expansion, partial-bin weighting, frequency shares/RGB meanings and
stem activity floor. Existing model tests cover legacy alignment, RMS measurements,
dB mapping, bounds and persisted-state validation. Workspace routing retains the old
tabs. Visually check the existing harness at localhost:5673 without audio playback.
