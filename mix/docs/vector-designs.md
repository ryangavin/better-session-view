# Vector waveform design browser

Waveform rendering opens the Design browser, with the existing vector/column/overlay
comparison and stress controls retained under Performance bench. The browser is a first
vector adaptation of Waveform lab, not a replacement for the production lane renderer.
The track selector and shared segmented workspace control sit together in the Harness
header. The Design browser uses one waveform-first surface: a compact primary toolbar,
a large canvas and section evidence aligned along the same time axis. Preset, Paint,
Ribbon layout and range remain at hand. The shared Controls toggle reveals geometry,
density/curve, sizing, blend, order, height, overlays and comparison. Notes reveals the
technical explanations. These toggles change presentation without resetting analysis,
render choices or the time window.

`src/debug/render/DesignBrowser.tsx` owns track measurement, controls, comparisons and
overlays. `musicalVector.ts` owns summary preparation and painting. It reuses the shared
`@openflow/widgets/wave/outline.ts` closed-path curve builder and peak detail ladder.
Widgets receive geometry, not mix-specific measurements or knowledge of stems.

## Combinations

Presets use the shared `Select` inside the standard debug `Toolbar` and `Group`.
Custom appears when geometry, palette or treatment changes; selecting Custom explicitly
retains the current settings. There is no page-specific preset button or tab component.

Five geometries (mixture peak, separate stem layers, flowing stack, Silk ribbon, stem ribbons), three palettes
(spectral RGB, source colors, rainbow) and six treatments (luminous core, solid,
spectral rim, contours, threads, Melt) can be combined. Presets seed combinations for Collapsed
RGB, Prism, Emblems, Lasagna, Threads, Aurora, Electric Delta, woven Silk, stem ribbons and Melt. These are adaptations:
they do not reproduce every original ornament. The garden's botanical renderer remains
in Waveform lab. Source entrance markers and section boundaries are optional overlays.

Compare presets places all ten on one axis. Geometry/color/treatment remain fixed per
preset in comparison mode; density, curve, height and overlays apply to all. Single-view
edits create a custom combination. Heights are 24, 48, 160 or 320 CSS pixels plus Fill view, the default for a fresh
browser. Fill view uses a viewport-sized stage observed with ResizeObserver; the waveform
gets its height minus the optional 78px evidence strip. Compact windows retain a minimum
usable height and can scroll. Opening Controls reduces the stage's height. Compare mode
uses 160px per preset when Fill view is selected, retaining the fixed choices otherwise.
The observer disconnects on unmount. Existing in-memory height selections survive HMR.
The curve
amount is 0/0.5/1, and density is 0.25/0.5/1/2 points per pixel. Compact heights hide
section text. Palette meaning is explicit: RGB is spectral balance; rainbow is ornament;
source colors identify source layers (mixture-only geometry uses a neutral lavender).

## Analysis and geometry

The cancellable Waveform lab measurement reads decoded audio before gain, mute, EQ or
warp. It retains at most 16,384 bins of channel-preserving mixture peak/RMS, broad-band
RMS and per-stem RMS. The current summary resolution is displayed. The browser limits
zoom to about 100 bins across; the separate bench keeps its existing raw-sample handover.

Mixture peaks are normalized by their track maximum and packed symmetrically into a
min/max ladder for `edgesOf()`. The master is padded to a power of two with zero cells
so odd final-bin peaks survive the existing pair-folding code. View time is mapped using
the original bin duration and padded cell count, so padding does not stretch the song.

RMS and spectral values use Float64 prefix sums of squared bin values. A query is the
square root of the mean squared values in whole bins covering its range. Bin endpoints
are rounded outward; the last partial analysis bin has equal bin weight. The mixture RMS
core is an independent closed path on the same track-peak scale, clipped inside the outer
path when painted. Curves can overshoot between points; clipping prevents the core from
escaping the silhouette, not all interpolation overshoot in the silhouette itself.

Stem geometries use 800 ms smoothed RMS normalized per source and raised to 0.68. A stack
centers the sum of those extents; it does not claim additive physical mixture amplitude.
The thinner inner path is decorative in stem geometries. Source colors use source IDs.

Spectral gradients use up to 256 stops (roughly one per four CSS pixels). Each stop
samples broad-band RMS with fixed gains 1/2/4, normalizes by its strongest channel and
raises each channel ratio to 1.4. This transfers the collapsed RGB idea onto a continuous
vector fill rather than retaining thousands of painted columns. It intentionally smooths
color detail compared with the original pixel rendering. Paths go through the shared
curve builder; paint and geometry are separate stages.

Each row exposes sampled geometry/paint timing in its hover legend. Geometry read and
vertex counters exclude color queries, overlays, and extra stack-bound calculations;
these are not total pipeline performance claims. The original Performance bench is the
place for the existing sweep/storm comparison. Measurement happens on track opening,
not on each redraw. Switching away cancels measurement and clears the local controls.

## Verification

### Melt: source pigment

Melt keeps the original flowing stack available and adds a softer source-driven variant.
It smooths source RMS with two consecutive eight-second power-domain passes, raises it to 0.85, and scales all sources by the
track-wide maximum sum of those values. Thus relative levels survive rather than each
source being independently normalized. This is an expressive level balance, not source
separation confidence or perceptual loudness. The centered silhouette follows that sum.
Melt limits control points to approximately one every four seconds (or the selected
density, whichever is coarser), so the shared curves describe phrases instead of fine
envelope fluctuations. Source colors stay solid inside each layer. Twelve overlapping
vector ribbons approximate a smoothstep color transition along each shared boundary;
the blend radius is capped at 1.25 CSS pixels, 0.8% of row height, and one quarter of
each neighbor’s thickness. The overlapping fills prevent antialias seams and replace
the previous per-pixel gradient columns. Each ribbon uses the same control points and
curve setting as the body, clipped to the combined silhouette. Separate stem lanes use
solid source fills because their boundaries do not touch. No blur filter, contour strokes or core lines are drawn.
Section names remain, but vertical section rules disappear in this treatment. The existing
palette selector still applies; source meaning belongs specifically to Source colors.
Melt on mix-peak geometry changes paint only; two-pass source smoothing and shared
normalization apply to stem and stack geometry. The blend ribbons add paint-time path construction proportional to control-point and
source count; the hover build timing excludes these paint-time paths. Geometry and
blends remain closed vector paths.

`musicalVector.test.ts` checks power-domain aggregation and preservation of an odd
final-bin transient through the padded peak ladder and time mapping. Existing waveform
measurement and shared outline tests cover their respective algorithms. Browser checks
cover the collapsed treatment, compact preset comparison and controls on decoded audio.


### Silk: woven light

`silkVector.ts` draws a projected folded sheet inspired by fine-line ribbon artwork.
It uses the existing two-pass smoothed stem energy and shared pigment reference: total
energy sets breadth and relative energy apportions source colors across the sheet.
Absolute source time plus smoothed source balance sets an ornamental rotation, so folds
stay in the same place while panning. Rotation, bowing, transparency and depth lighting
are expressive geometry, not measured audio phase or beat boundaries.

The sheet has 24 transverse intervals (12 below 60px height). Each time slice paints
rear facets before front facets, with thin bright filaments and translucent surface
fills. These are vector line segments and polygons, with horizontal color gradients;
no blur, raster assets or filters are involved. Density controls temporal tessellation.
The shared Paint select offers Filaments and Solid silk for this geometry; the curve
select is hidden because the analytic projection does not use the shared outline curve.
All three palettes work. Sections retain names without vertical rules. The existing
stack and Melt remain available. Silk is an expressive preview, not an amplitude or
phase diagnostic; its projected width can narrow when a loud ribbon turns edge-on.


### Independent stem ribbons

Silk · stem ribbons gives each decoded source its own fixed-color sheet. The shared
Ribbons control switches between Overlaid and Separated. Separation translates and
rescales the same time-based projection into source lanes; it does not change its folds
or energy reference. Source colors are fixed in this geometry and the palette control
is hidden. Labels appear in separated lanes when they have at least 40px of height.

Each stem's smoothed energy divided by the shared pigment ceiling drives opacity,
with an expressive 0.7 power compression. Silent sources disappear. In the overlay,
the sum of normalized stem energies raised to 1.7 sets the overall extent, exaggerating
quiet/full contrasts. Source shares determine widths around one shared centerline; no source has a vertical
offset in the overlaid view. The cross-section is symmetric around that axis, including
during turns. Combined energy therefore affects every ribbon’s extent while individual
source shares remain visible. Separated lanes keep
the individual shared-reference scale.
Stem ribbons now use the section-aware turnover described below, not free-running drift.

Normal blends translucent sheets in drawing order. Energy forward sorts sheets by
smoothed energy at each time slice, quieter first; Source order keeps decoder order.
Screen and Additive emphasize intersections and are order-independent color blends.
Separated mode uses normal blending and hides the overlap controls. Filaments, Solid silk and Pearlescent remain available; the preset starts with
Pearlescent and Normal blending. Pearlescent shades the source-colored surface across
24 facets, with a narrow specular highlight following the ornamental fold and only
every fourth filament visible. The highlight is painted into vector facets, without
a blur or glow filter. Switching to a different geometry maps this stem-only paint
to Solid. This remains a debug
study, with per-slice vector facets rather than the production waveform lane renderer.


### Section-aware ribbon turnover

The Design browser passes source-time section starts independently of the Sections
visibility toggle. Stem ribbons sort/deduplicate these starts and omit the first start
(the beginning of the first section is not a transition). Every remaining boundary
centers a smooth half-turn. Its radius is at most 16 seconds and 45% of either neighboring
section interval, so nearby turns remain distinct. Without section transitions there
are no invented periodic folds. Existing section metadata remains unchanged.

Projection uses signed cosine, so the two edges actually exchange sides. At each
boundary the sheet passes edge-on, with a small curved cross-section giving depth.
The earlier absolute-cosine/minimum-width projection could only bend back and created
a kink; that restriction is removed. A narrow point at a boundary therefore represents
a deliberate section turnover, not silence. The same turns apply in separated lanes.

`silkVector.test.ts` verifies boundary-centered half-turns, edge exchange, no-section
behavior, proportional source shares and exaggerated aggregate extent without inventing
energy in silence. These checks supplement the existing measurement tests.


### Arrangement fullness versus loudness

The Shape selector defaults to Arrangement fullness, with Loudness retaining the earlier
aggregate-energy extent and source proportions. `ribbonFullness.ts` adds a cancellable
preview-only FFT pass to the design browser's decoded input. It uses 2048-sample Hann
frames about every 100ms and preserves channels by averaging spectral power after
summing stems within each channel. Sixteen logarithmic bands span 50Hz–16kHz (capped
at Nyquist). Band values are mean FFT-bin power, not integrated bandwidth power.
The lowest bands have limited resolution at this frame size and may share FFT bins.

Coverage is the soft fraction of bands between −36 and −18dB of the frame's strongest
band, with an absolute silence gate; it is averaged arithmetically over approximately
four seconds for persistence. It is a relative spectral occupancy proxy, not a calibrated
measure of musical complexity, loudness or saturation. Broadband percussion can score
high, so coverage contributes only 35% to fullness.

The remaining 65% is source participation: each stem's smoothed level is compared to
its own track 95th-percentile reference, ramping from zero at 8% to full participation
at 60%. Near-silent references have a floor. This is sustained activity, not separation
confidence; leakage may contribute. Fullness divided by 0.9, capped at one, is raised
to 2.2 for expressive contrast; a reduced aggregate-energy factor keeps silence empty.
Square-root source shares and gentler source opacity/independent-lane scaling make
quieter stems more legible without reversing the level ordering. These are deliberate
visual exaggerations; Loudness remains available for comparison.

The expandable Section evidence table reports mixture RMS in dBFS, mean coverage and
mean participation using existing section boundaries. It does not rename or reanalyze
sections. Tests cover gain-independent coverage, narrow versus broad spectra, silence,
channel preservation and cancellation. FFT coverage is optional on Measurement so the
original Waveform lab analysis and existing consumers remain compatible.


### Integrated evidence and layout choices

The layout iteration considered a waveform-first canvas, a timeline-aligned evidence
view and a slim section inspector. The first two combine without reducing horizontal
time resolution: the optional evidence strip is a shared ScopeRow beneath the waveform,
so zoom, pan and cursor stay aligned. Each section shows coverage and participation as
small bars and values. Narrow visible sections retain bars and omit text. The full
measurement table remains in a closed disclosure below the surface, including RMS.
Evidence is currently specific to stem-ribbon geometry; comparison mode omits the strip
but retains table access. The Notes toggle keeps analysis resolution, color semantics
and expressive-versus-measured limitations available without separating the waveform
from its controls. No measurement or renderer algorithm changed in this layout pass.
