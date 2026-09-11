# Waveform V2

`src/debug/waveform-v2/` tunes the production waveform engine on the selected decoded
stem sum. The original Waveform lab and collapsed Legacy RMS experiment remain intact.
Opening V2 neither starts playback nor changes production defaults.

## Shared rendering

`topologyPaint.ts` builds a normalized peak ladder once per measurement and calls
widgets `edgesOf` / `densityFor`, then `paintSpectralOutline`. The production widgets
`Waveform` calls that exact painter when given its optional `presentation` prop.
`presentationOf` in `style.ts` creates that reusable `SpectralOutlineStyle`; the
existing production path remains unchanged when the prop is absent.

Both compact rows use the same geometry. **Three-band** divides the mirrored peak
silhouette into relative low/mid/high RMS layers. **Peak spectrum** uses the production
`spectralPainter` to blend those frequencies. Band weights affect relative color and
layer thickness, never the outer peak or audio gain. There is no luminous RMS center.
The measured first-order crossovers default to 250 and 2500 Hz and are adjustable in V2.
Frequency colors are not stems.

A whole-track measured sample-peak reference remains fixed through pan and zoom.
The production max-reduction ladder retains narrow peaks as detail changes. Smoothing
controls cubic tangents between outline points; it is visual interpolation and can
round or overshoot between measurements, not higher-resolution analysis. Zero-energy
columns are clipped out so curves do not fill measured silence. Deep zoom remains
limited to measured bins; the lab does not claim sample-level detail it lacks.
Frequency and stem activity use duration-weighted RMS, including the partial final bin.

## Frequency crossovers

**Low / mid crossover** and **Mid / high crossover** change the two first-order
filter coefficients in the shared preview `waveforms/measure.ts` scan. They remeasure
real decoded channels; the three cached band summaries cannot be split at new cutoffs.
The broad filters overlap, rather than abruptly classifying every frequency into one band.
Both layered and blended views use the resulting energies; peak height and stem activity
are unaffected. Original Waveform lab, Legacy RMS and production keep their default bands.

The controls require finite cutoffs, at least 1 Hz apart, from 20 Hz through the smaller
of 20 kHz and 45% of the decoded sample rate (below Nyquist). Each slider is bounded by
its neighbor. Invalid saved pairs reset together. **Reset crossovers** restores 250/2500 Hz
(or rate-safe defaults for unusually low sample rates), without changing visual settings.
Crossover storage is separate: `wdg-debug:mix-waveform-v2-crossovers`.

After 350 ms without another edit, measurement reads the existing decoded channel arrays
again: no new decode, full-track copy or mixture cache. Cost is linear in audio length;
only bounded 16,384-bin summaries are allocated. The scan yields every 32,768 frames and
checks cancellation. A newer edit or track change cancels stale work. While pending, the
last completed preview remains visible and its **Preview crossovers** status states the
applied values beside a measuring message. Only completed, current results replace it.

## Vivid peaks finish

The initial **Vivid peaks** setting keeps the earlier experiment's visual finish:
`#090913` backing, fully saturated red/green/blue band colors, relative weights 1/2/4,
color exponent 1.4, peak fill opacity 0.38, and a same-color edge at 0.95 opacity.
The low/mid and high/mid controls express those weights as 0.5 and 2. It carries only
the outer peak contour: no RMS-derived height, luminous inner path, RMS emphasis or
amplitude contrast transform. Color contrast changes frequency mixing, never height.

Those finish fields belong to widgets `SpectralOutlineStyle`, so production's optional
`presentation` and V2 use the identical painter. Its unspecified fields keep existing
production output unchanged. Translucent layers are disjoint bands; alpha does not
accumulate into an artificial bright center. The original Legacy RMS view stays
collapsed and available as a visual reference. Previous tuning storage is preserved
under its old key; the new peak-style key starts with this requested finish.

## Tuning

Four shared-widget sliders stay visible: **Smoothness** (0–1), **Detail** (0.5–2 times
the production zoom density), **Height ratio** (0.40–0.95 of lane half-height), and
**Color strength** (neutral to full palette). **Palette & layer balance** opens a band
selector with hue/saturation/lightness, low-to-mid and high-to-mid weights, and edge
opacity. **Fill opacity**, **Color contrast**, and the **Waveform finish** selector
control the translucent treatment and colored versus white edge. Shape settings apply to both rows, making comparisons controlled.

Starting points are **Vivid peaks**, **Topology A**, **Rekordbox inspired**, **Denon inspired**,
**Traktor inspired**, and **RGB**. They share a single renderer and our controls and
styling. They are aesthetic starting points, not proprietary analysis emulations or
copied skins. **Reset style** restores Vivid peaks. Changing a value shows Custom.
Guarded settings persist separately under `wdg-debug:mix-waveform-v2-peak-style` and survive
track changes. They do not change the app theme or playback.

The compact rows sample the existing Play lane height on mount (72px fallback).
**Larger view** adds 220px rows with the same source, range and normalization.
Scroll pans, Shift-scroll zooms; **Whole track** resets the range. No window resize.
**Stem activity** adds named 14px strips in app stem colors with a fixed −60 to 0 dBFS
RMS opacity scale. It does not recolor the frequency waveform. These view choices use
independent `wdg-debug:mix-waveform-v2-large` and `wdg-debug:mix-waveform-v2-stems` keys.

## Reference cues

- [Rekordbox's official waveform options](https://rekordbox.com/en/support/faq/v6/)
  identify Blue, RGB and 3Band. The reference-inspired layers use blue/orange/pale cues.
- [Denon Engine Prime's official guide, p. 7](https://cdn.inmusicbrands.com/denondj/EnginePrime/EnginePrime-UserGuide-v1_3_4.pdf)
  specifies blue lows, green mids and white highs; the
  [Engine DJ OS product view](https://enginedj.com/software/enginedj-os) illustrates
  a compact frequency-colored silhouette. Our preset follows those palette cues.
- [Traktor's official preferences](https://docs.native-instruments.com/ni-tech-manuals/traktor-pro-manual/en/preferences)
  offers Ultraviolet, Infrared, X-Ray and Spectrum. Our warm-to-cool preset explores
  that family of frequency color displays; its exact hues and curves are design choices.

These references inform representation, not pixel appearance or exact frequency semantics.

## Legacy RMS

The collapsed **Legacy RMS experiment** mounts only while expanded. It preserves the
original guarded `wdg-debug:mix-waveform-v2` settings, renderer, linear/dB scale,
emphasis, contrast, RMS options and overlays. Its settings affect only that preview.

## Verification

`waveforms/crossovers.test.ts` covers ordered finite cutoffs and rate-safe defaults.
`waveforms/measure.test.ts` verifies tone redistribution, overlapping boundary response,
unchanged peaks/default measurements and cancellation of a running scan.
`style.test.ts` covers storage recovery and conversion to the production presentation
API. `topology.test.ts` covers attack preservation, silence, fixed-reference quiet
zoom, partial-bin weighting and activity floor. Widgets tests cover weighted layers;
its Drawing / Waveform bench includes both optional presentations alongside unchanged
default cases. Check V2 in the existing harness at localhost:5673 without playback.

## Additional opt-in color studies

**Prism**, **Aurora**, and **Ember** offer three richer frequency palettes in the
starting-point selector. They never apply automatically. Their settings, two-source
rendering evidence and limitations are in [waveform-color-studies.md](waveform-color-studies.md).
