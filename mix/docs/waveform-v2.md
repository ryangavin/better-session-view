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
silhouette into relative low/mid/high RMS layers. **Spectrum** uses the production
`spectralPainter` to blend those frequencies. Band weights affect relative color and
layer thickness, never the outer peak or audio gain. There is no luminous RMS center.
The measured first-order crossovers remain 250 and 2500 Hz. Frequency colors are not stems.

A whole-track measured sample-peak reference remains fixed through pan and zoom.
The production max-reduction ladder retains narrow peaks as detail changes. Smoothing
controls cubic tangents between outline points; it is visual interpolation and can
round or overshoot between measurements, not higher-resolution analysis. Zero-energy
columns are clipped out so curves do not fill measured silence. Deep zoom remains
limited to measured bins; the lab does not claim sample-level detail it lacks.
Frequency and stem activity use duration-weighted RMS, including the partial final bin.

## Tuning

Four shared-widget sliders stay visible: **Smoothness** (0–1), **Detail** (0.5–2 times
the production zoom density), **Height ratio** (0.40–0.95 of lane half-height), and
**Color strength** (neutral to full palette). **Palette & layer balance** opens a band
selector with hue/saturation/lightness, low-to-mid and high-to-mid weights, and edge
opacity. Shape settings apply to both rows, making comparisons controlled.

Starting points are **Topology A**, **Rekordbox inspired**, **Denon inspired**,
**Traktor inspired**, and **RGB**. They share a single renderer and our controls and
styling. They are aesthetic starting points, not proprietary analysis emulations or
copied skins. **Reset style** restores Topology A. Changing a value shows Custom.
Guarded settings persist separately under `wdg-debug:mix-waveform-v2-style` and survive
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

`style.test.ts` covers storage recovery and conversion to the production presentation
API. `topology.test.ts` covers attack preservation, silence, fixed-reference quiet
zoom, partial-bin weighting and activity floor. Widgets tests cover weighted layers;
its Drawing / Waveform bench includes both optional presentations alongside unchanged
default cases. Check V2 in the existing harness at localhost:5673 without playback.
