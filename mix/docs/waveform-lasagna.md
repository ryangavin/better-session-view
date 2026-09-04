# Disco Lasagna al Dente: analysis and rendering recipe

This records the implementation of the vivid stem view and collapsed RGB view developed
in the Waveform lab on 2026-09-04. The central strategy is to measure a small set of
meaningful audio properties once, then give geometry, color and light distinct jobs.
The rendering is Canvas 2D; no image assets, shader, FFT or new inference model are needed.
Stem separation has already happened upstream.

## Source map

| Responsibility | Source |
|---|---|
| Read decoded audio, manage cancellation and shared view range | [`WaveformLab.tsx`](../src/debug/waveforms/WaveformLab.tsx) |
| Measure mixture peaks, RMS, broad bands and individual stem RMS | [`measure.ts`](../src/debug/waveforms/measure.ts) |
| RMS smoothing and track-wide peak reference | [`features.ts`](../src/debug/waveforms/features.ts) |
| Stem and collapsed drawings, color constants and smoothing cache | [`excursions.ts`](../src/debug/waveforms/excursions.ts) |
| Select and dispatch visual designs | [`directions.ts`](../src/debug/waveforms/directions.ts) |

## 1. Measure the actual mixture while preserving channels

The input is each available stem's decoded `AudioBuffer`, accessed through
`getChannelData()`. These arrays are read directly, without copying the complete audio.
Measurements describe original decoded audio before mixer gain, EQ, mute, solo or warp.

For each sample and channel, sum the stems first:

```text
mixture[i, c] = sum over stems s of source[s, i, c]
```

Measure that sum, rather than adding stem RMS values or separately normalized drawings.
This preserves constructive and destructive interference between stems. Channels remain
separate until their squared magnitudes are averaged, so opposite-polarity left/right
audio does not disappear through a mono downmix. For mismatched channel counts, the
last available source channel is reused; samples beyond a source's length contribute zero.
Inputs are assumed to share the supplied sample rate and time origin.

For `L` samples, choose `B = max(1, ceil(L / 16384))` samples per analysis bin.
This bounds the track summary to at most 16,384 bins, each nominally `B / sampleRate`
seconds long. Within a bin containing `N` sample/channel pairs:

```text
peak = max(abs(mixture[i, c]))
mixRMS = sqrt(sum(mixture[i, c]^2) / N)
stemRMS[s] = sqrt(sum(source[s, i, c]^2) / N)
```

The final partial bin uses its actual sample count. Peaks preserve short transients;
RMS describes sustained signal magnitude. Squared RMS represents mean-square energy;
RMS itself is neither a perceptual loudness measure nor LUFS.

## 2. Get useful spectral color with two inexpensive filters

Each mixture channel has two persistent first-order low-pass states, at nominal
250 Hz and 2,500 Hz. For cutoff `f` and sample rate `Fs`:

```text
alpha(f) = 1 - exp(-2*pi*f/Fs)
low   += alpha(250)  * (sample - low)
upper += alpha(2500) * (sample - upper)

lowSignal  = low
midSignal  = upper - low
highSignal = sample - upper
```

Accumulate and square-root the mean squares of each signal in each bin, just like mix
RMS. Filter state survives bin boundaries. This supplies three broad spectral descriptors
without an FFT. These gentle, overlapping responses are not brick-wall frequency bands;
their energies do not sum exactly to the mixture energy. They are sufficient to make
changes in bass weight and upper-frequency content visible, but do not identify notes,
instruments, harmonic content or individual transients.

## 3. Stem view: shape follows level, light adds drama

Give each source a fixed horizontal lane. Smooth its bin RMS with a symmetric window
of approximately 800 ms, averaging **squares** before taking the square root:

```text
smoothed[i] = sqrt(mean(rms[j]^2 in the window around i))
reference = max(0.001, max(smoothed across the whole track))
power = (smoothed[i] / reference)^0.68
halfThickness = power * laneHeight * 0.38
```

`smooth()` uses a Float64 prefix sum of squared bin values, making every window lookup
constant-time. The window is shortened at track edges. The 0.68 exponent lifts quiet
detail without expanding the maximum. A track-wide reference keeps zoom from changing
the scale. Each stem has its own reference: equal thickness across two lanes does not
mean equal absolute level. This choice lets quieter sources remain readable.

Each lane starts from a recognizable hue: drums 28°, bass 226°, other 174°, vocals
316°, guitar 112°, piano 278°. The mixture's spectral values then affect every lane's
lighting; these are not measurements of that individual stem's spectrum.

```text
warmth = (midRMS + 2*highRMS) / (lowRMS + midRMS + highRMS || 1)
brightness = min(1, highRMS * 18)
bodyHue = sourceHue + warmth * 48
bodyLightness = 23 + power * 30 + brightness * 12
```

Draw the body at 100% HSL saturation. Inside it, draw a narrower center occupying 28%
of the body's full thickness, with hue `bodyHue + 35`, lightness `54 + power * 25`,
and opacity `power * 0.85`. This creates a saturated body around a hot center: louder
passages become both thicker and brighter, while spectral changes shift the color.

Outline both edges with a light source-related hue and a 7 px shadow glow. Add three
faint interior contours at 25%, 50% and 75% of the thickness. These contours and glow
are ornament following existing geometry, not additional measurements. A dark violet
background gives the bright regions room to stand out. Silence leaves a thin baseline.

The drawing samples a smoothed bin at each horizontal pixel, with outline vertices
every two pixels and interior vertices every three. The smoothing supplies continuity;
this is an envelope, not a sample-accurate oscillogram.

## 4. Collapsed view: one mixture, two nested shapes, RGB spectrum

Collapse by drawing the measured mixture itself. Do not stack the independently scaled
stem shapes. For each horizontal pixel, map its time interval to analysis bins and
aggregate the included bins:

```text
pixelPeak = max(bin peaks)
pixelRMS = sqrt(mean(bin RMS^2))
pixelBand[b] = sqrt(mean(bin band[b]^2))
reference = max(0.001, whole-track maximum mixture peak)

outerHalfHeight = min(1, pixelPeak / reference) * availableHalfHeight
coreHalfHeight = min(outerHalfHeight, pixelRMS / reference * availableHalfHeight)
```

This preserves peaks when several bins share a pixel, while the inner region conveys
sustained energy. A transient-heavy passage can have a tall outline and a narrow core;
a dense passage fills more of that outline with light. Both shapes are symmetric about
the center line; the upper and lower halves do not represent different stereo channels.

Convert the broad-band RMS values to RGB:

```text
balanced = [lowRMS, 2*midRMS, 4*highRMS]
strongest = max(0.000001, balanced[0], balanced[1], balanced[2])
RGB[b] = round(255 * (balanced[b] / strongest)^1.4)
```

Red describes lows, green mids and blue highs. Fixed gains of 1/2/4 let quieter upper
bands compete visually with bass. Normalizing by the strongest channel makes color
describe spectral balance rather than overall level. The 1.4 exponent increases channel
contrast; balanced contributions can still approach white. These constants are artistic
choices, fixed across tracks and zoom, not a reproduction of Rekordbox's algorithm.

Draw the outer shape with this color at 0.38 opacity, the RMS core at full opacity,
and one-pixel outer edges at 0.95 opacity. The darker silhouette and luminous core
provide the light/energy effect without animated illumination or a glow filter.

## 5. Keep comparison fair and computation bounded

Both layouts use the same measurement, track peak and source-time axis. Compare both
places a 190 px collapsed row above a 300 px stem row. Stems alone uses 430 px;
collapsed alone remains 190 px. Changing layout retains zoom and pan. Section labels
and subtle background washes come from the app's existing section boundaries and beat
map; al Dente performs no new beat or section detection.

Analysis is linear in samples × channels × sources. It yields to the browser every
64 bins and checks an `AbortSignal`, so leaving the tab or changing track discards the
work. Summaries use Float32 arrays, filter states use Float64 arrays, and extra stem
smoothing is cached in a `WeakMap` keyed by the measurement. Drawing does not re-read
the full audio. Collapsed rendering traverses visible summary bins plus screen columns;
stem drawing scales with screen width × stem count.

## Limits and verification

### Compact extension

Pocket studies adds 48 px and 24 px collapsed strips on the shared zoom axis. At heights
of 64 px or less, the same renderer centers the waveform vertically with a 2 px margin
and removes section washes and in-canvas text. Peak aggregation, RGB mapping and RMS
core remain unchanged: it rerenders at the destination size rather than shrinking an image.

[`PocketStudies.tsx`](../src/debug/waveforms/PocketStudies.tsx) also draws whole-track
thumbnails at 160, 96 and 64 CSS pixels wide. Each is 32 px tall: 20 px of waveform and
a 12 px stem shelf. The shelf keeps V/D/B/G/P/O in fixed positions, with colored letters
for decoded sources and dashes for absent sources. It encodes availability separately
from frequency color, and its accessible description spells out the available stems.
Canvas backing dimensions account for device pixel ratio. These previews reuse the
selected track's measurement and never decode the entire library. A production library
integration would need persisted or lazily generated summaries; that is not implemented.

### Analysis resolution

The fixed 16,384-bin summary limits deep-zoom detail. Pixel aggregation uses whole bins,
with integer boundaries and equal bin weighting; it does not weight fractional coverage
or give the shorter final bin a proportional weight. At sub-bin zoom, it reuses a bin.
The stem view samples its smoothed summary rather than peak-aggregating every pixel.
These are deliberate prototype simplifications to revisit for a production renderer.

Only the scalar whole-track peak from `featuresOf()` is needed for collapsed al Dente.
The shared lab also computes 600 ms mix smoothing, 400 ms stem smoothing and activity
spans for other designs; al Dente does not use those curves or activity heuristics.

[`measure.test.ts`](../src/debug/waveforms/measure.test.ts) covers stem cancellation,
opposing stereo channels, a transient and final partial bin, input preservation,
low/high tone differentiation, and cancellation of work.
[`features.test.ts`](../src/debug/waveforms/features.test.ts) checks power-domain
smoothing and the other designs' activity heuristics. These do not assert aesthetic
quality or independently test the collapsed pixel/color mapping.

The vivid and collapsed revision was inspected in the real browser harness on
“Raise Your Weapon,” including the comparison layout and zoomed collapsed layout.
Repository type checking and all 522 mix tests passed at that revision. This document
records those checks; it does not imply automated visual regression coverage.
