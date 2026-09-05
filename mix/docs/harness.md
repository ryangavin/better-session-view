# Debugging and experiments

The bug button at the left edge of the library footer opens a tabbed debug workspace over the window
— in a dev build and a packed one alike. Beat analysis runs the app’s pipeline and
can hand a corrected map back to the app. Waveform lab compares designs using the
same decoded stems the lanes are drawn from.

## Beat analysis

The normal **Analyze** is a separate product component,
`components/TrackReview.tsx`; see [track-review.md](track-review.md). The diagnostic
component retains its full algorithms, band controls and evidence. Its optional `editing`
presentation remains covered for exact-map application but no longer supplies the product
page. Pending analysis timers and audition sources are released when unmounted.

The **Beat analysis** tab is `src/debug/Analysis.tsx`, built on [`widgets/src/debug`](../../widgets/docs/debug.md).

The [grid evidence workbench](grid-evidence.md) adds al Dente audio context, per-stem RMS,
candidate/kept/saved-grid agreement, signed onset offsets, weak-passage navigation and
optional scoring against imported truth JSON. Download evidence captures a run's grids,
detections, metrics and reference scores. All existing analysis and correction tools remain.

The first look is the app's own pipeline — `transients.ts` → `tempo.ts` →
`follow.ts` — on the drums, run with a trace so every decision on the way to the
answer is kept. The **run** group runs any arm of the A/B rig (`src/debug/arms.ts`)
on the drums or the whole mix summed back together, so a wrong tempo can be
traced to the stage that lost it.

One time axis, zoomable to the sample: the drums; every transient by band; every
beat of the map, struck solid and interpolated dashed; the grid the app holds
now, for comparison; the local tempo the follower held to and the stretches it
read a period off. Under it, the autocorrelation with every candidate marked,
the phase sweep that placed the winner, and the tempo sweep from 1.1.1.

**Listen.** Play the stems with a click on every beat — the kick, the snare or the
hats alone, through the transient finding's own band filters — loop a stretch,
scrub. The ear is the strongest check there is.

**The grid by hand.** Alt-click a hit or a beat to make it 1.1.1; a straight map is
ruled again from there and its tempo swept. **Two beats**: pick any two, the count
between them is read off the tempo the analysis already has, and the line is
refined through every hit in the song. **Sweep** holds 1.1.1 and walks the tempo a
beat per minute either side; the bottom of the error curve is the tempo, and the
panel says how the whole number nearest it compares.

**Take** hands the map to the app as if Auto-warp had found it: the lanes redraw
and it is kept beside the track (`electron/analysis.ts`). **Export** lays every
stem straight from 1.1.1 at the tempo in the box, padded to whole bars, into the
export folder, named for the tempo — `bridge.export.stems`, which is the same
call the Export sheet makes. The folder drops into Live like a loop off a pack.

## The batch run

```
npm run warp:mix                        every track in the library, tempo found vs known
npm run warp:mix -- --ab --report       every arm, scored side by side into harness/reports/ab.md
npm run warp:mix -- --only=Sandstorm
```

`tools/mix-warp.ts` runs the arms headless over the app's library and, with
`--report`, writes what each saw. The truth files and the scorer it reads are the
previous page's (`harness/`), which still opens at `/harness/` under
`npm run dev:mix-ui` with the reports beside it; the in-app page supersedes it for
looking and listening, and the batch run is what the arms are still for.

## Where

| | |
|---|---|
| `src/debug/Analysis.tsx` | the page |
| `src/debug/arms.ts` | the beat finding, several ways |
| `src/debug/draw.ts` | the rows and the plots, in palette inks |
| `src/debug/audition.ts` | stems and a click, looped and scrubbed |
| `src/trace.ts` | what the two stages write when handed a trace; the app's own run passes none |
| `electron/export.ts` | the stems laid straight, on disk |
| `tools/mix-warp.ts` | the batch run, the reports, the scoring |
| `harness/` | the previous page: truth, the scorer, the error report |


## Musical alignment

The **Musical alignment** experiment is documented in [alignment.md](alignment.md).
It uses the kept beat map and explicit original/recurring/section policies to render
shared-stem audio, with source/fitted audition and individual WAV downloads. Its
varispeed, range and rate limits are explicit; it does not change the main player's policy.

## Waveform lab

The **Waveform lab** tab compares three designs using the currently decoded stems:
A, a frequency-colored mixture; B, stem RMS shares inside the mixture outline; and C,
the current sections over a neutral mixture with an RMS contour. Compact stem activity
strips use a fixed −60 to 0 dBFS opacity scale. The spectrum menu offers Blue, RGB and
3Band for A; these are experimental mappings, not implementations of vendor algorithms.

All rows use the same source-time window and whole-track peak normalization. Choose a
section to frame it, zoom/pan with the buttons or the scope gestures, or focus one design.
The drawings never change the beat map, slices, playback settings or exported audio.
The track chooser selects the app’s track, just as Beat analysis does. Switching tabs
unmounts the previous experiment (including its audio), and Reset tab starts it afresh.
The selected tab survives closing and reopening the workspace.

`src/debug/waveforms/measure.ts` sums stems per channel before measuring peak magnitude
and RMS; opposite stereo channels do not cancel. Two first-order low-pass states at
250 and 2500 Hz produce low, mid (their difference), and high (the residual) band RMS.
Stereo energy is averaged across channels. B divides the mixture peak height by relative
stem RMS, so its colored regions are contributions, not literal additive stem peaks.
C shows existing section guesses/edits; RMS is explicitly signal level, not inferred
musical energy. There are no fabricated vocals, confidence scores or warp claims.

Measurements retain at most 16,384 bins, yield regularly and cancel on unmount without
copying full sample buffers. The preview stops zooming at about 100 bins across. It is
for visual comparison, not sample editing. New tracks wait for decoding before reading
buffers so the previous song is never drawn under the new title.

## Adding an experiment

1. Create a component beneath `src/debug/` receiving `{ context: Mix }`, or adapt a
   component receiving `mix` in the registry as the existing entries do.
2. Add one stable entry to `experiments` in `src/debug/Workspace.tsx`: `id`, `title`,
   `description`, `component`. No header, modal, widget or bridge changes are needed.
3. Use any React content. Shared `Harness`, `Scope`, `Plot`, and toolbar widgets are
   available, not mandatory. Keep experiment-specific calculations in its own directory.
4. Dispose of audio and effects and cancel pending work on unmount. Render async errors
   locally. The workspace isolates render failures and provides Reset tab.
5. Run `npm run dev:mix` and visit `/harness/reach.html` on the mix dev server (normally
   port 5673). This is the app’s real preload and library in a browser, not mock data.
   Open the bug button, choose the tab, and inspect the results there.

`widgets/src/debug/Workspace.tsx` owns only tabs, lifecycle, reset and render-error
containment; `mix/src/debug/Workspace.tsx` owns the registry and app context. Experiments
stay here until their design earns a place in the main interface.

### Combined visual directions

The lab includes **D · Prism**, **E · Threads**, and **F · Emblems**, with the more
expressive **G · Aurora** selected by default.
Each puts spectrum, source activity, peak shape, sustained level, sections and the current
grid into one drawing. The earlier studies remain in the View menu, which also offers
**Compare structured directions**. Switching views retains the range; selecting another track
starts its view at the whole track.

- **Prism** fills the upper half with frequency bands and keeps the lower half neutral.
  Monochrome source threads and entrance symbols occupy a compact gap at the center.
- **Threads** uses stem hues for unfilled paths inside the upper silhouette. Each path’s
  position is its midpoint in the ordered RMS shares, not that stem’s literal amplitude.
  Three neutral strips above the waveform show low, mid and high RMS on a −60 to 0 dBFS
  brightness scale. Color has only the source role in this design.
- **Emblems** keeps the body neutral and puts composite frequency color in a narrow rim.
  Sustained source activity becomes brackets with one entrance symbol and an exit tick.

Source symbols are stable across the designs: drums ◇, bass ●, vocals ○, other +,
guitar △, piano □. A 600 ms RMS curve inside the lower waveform carries sustained signal
level. Section brackets use dashes for an automatic section set and solid lines when the
set includes user edits; this does not imply individual boundary approval. Grid ticks
sit at the lower edge, thinning with zoom. They describe the app’s current grid, including
its fallback grid, and make no claim about future warping.

**Read** and the layer buttons quiet everything except the chosen layer. Choose the same
button again for Everything. This is a visual inspection aid, not a change to the track.
Hue, fixed position, shape, line character and spatial placement can be compared without
changing the data. `directions.ts` draws these projections; `features.ts` derives their
landmarks once per measurement so zoom never changes the underlying activity decision.

Landmarks use 400 ms smoothed stem RMS, a threshold of the greater of −42 dBFS and 24 dB
below that stem’s smoothed peak, gaps closed up to 400 ms, and spans at least 600 ms long.
They are activity heuristics on separated audio, not perfect instrument/vocal detection.
Symbols whose spans have less than 18 pixels are omitted to keep the display legible;
the measured intervals themselves remain unchanged. Continuous source threads use a
fixed −54 to −6 dBFS opacity scale. No model confidence or render displacement is invented.


### Aurora

**G · Aurora** is a flowing, psychedelic interpretation of the same audio. Source time
still runs left to right. Each stem becomes a ribbon whose thickness comes from 2.4 s
smoothed RMS raised to 0.65, normalized to the whole track’s maximum sum. Layered contours
follow those same ribbon boundaries; high-frequency RMS adds small edge highlights.

The rainbow gradients, glow and slow vertical wander are deliberate artistic treatments,
not frequency categories or further musical analysis. Sections become quiet labels above
the ribbons, and source names sit inside them. This is a static composition: it flows
geometrically, with no independent animation or audio playback. Pan and zoom use the same
source-time axis; dragging the drawing pans it. The detailed ruler, layer isolation and
analysis legend are omitted for this view. The three structured directions retain those
controls and their shared comparison. `waveforms/aurora.ts` owns this drawing and caches
its extra smoothed levels by measurement, without changing decoding or playback.

### Disco Lasagna al Dente, The Listening Garden and Electric Delta

The [al Dente technical recipe](waveform-lasagna.md) records the measurement pipeline,
smoothing, exact color and lighting formulas, collapsed projection and prototype limits.

These are more deliberate revisions of three playful studies:

- **H · Disco Lasagna al Dente** is an ordered stem score. Every source owns a horizontal
  stratum. Thickness is 800 ms smoothed RMS, normalized to that source so its internal
  dynamics remain readable; its base hue never changes meaning. Broad spectral balance
  shifts its hue, with saturated bodies and a brighter center emphasizing energy.
  Three interior contours reinforce the shape without additional data. Silence narrows
  the stratum to its baseline. The Layers menu offers Stems, Collapsed RGB and Compare
  both, sharing one time range. Pocket studies (the default) adds 48 px and 24 px
  collapsed strips plus library previews at 160, 96 and 64 px wide, each 32 px tall.
  The thumbnails always show the whole track while the strips follow the selected range.
  A fixed V/D/B/G/P/O shelf identifies decoded stems; absent stems show dashes. The
  shelf indicates availability, not detected activity. These are previews inside the lab,
  not changes to the library. `waveforms/PocketStudies.tsx` owns the miniature previews.
  Collapsed RGB uses measured mixture peaks
  for its outer silhouette and RMS for its bright core, normalized to the track peak.
  Each pixel preserves the maximum peak and averages squared RMS/band values over its
  bins. Low/mid/high RMS become red/green/blue, with fixed gains of 1/2/4 followed by
  maximum-channel normalization and a 1.4 power for chromatic contrast. This is an
  expressive spectral mapping, not a Rekordbox algorithm or a calibrated spectral meter.
- **I · The Listening Garden** grows one cluster per musical bar, read from the current
  beat map. When bars would be less than 11 pixels apart, adjacent bars aggregate so the
  garden remains legible. Each source has a stable species: drums are diamond-topped
  reeds, bass has round fruit and roots, vocals flower, and other sources branch. Stem
  RMS controls height; low-band RMS controls roots and stem weight, mids control leaves
  or branches, and highs control flowers and fruit. These are bar summaries, not onset
  marks or claims about botanical reality.
- **J · Electric Delta** replaces Cathedral Soup. Each source owns a stable current lane,
  with 800 ms smoothed RMS controlling its luminous core. Broad spectral balance gently
  shifts that core. Downbeats from the current beat map become pulses on the strongest
  source at that instant. Section boundaries are vertical buses joining every current,
  with one node per source; section names and quiet washes remain peripheral.

All three retain source time from left to right and use the existing zoom, pan and section
focus controls. Their canvases are also the time ruler, so dragging pans and modifier-scroll
zooms without adding clinical ruling over the artwork. The View menu keeps every earlier
study available. `waveforms/excursions.ts` owns these drawings and caches their smoothed
measurements by decoded track; it does not alter audio, sections, analysis or playback.

## Waveform rendering: stem identity

`debug/render/rows.ts` puts decoded sources in the same order as the mixer and derives
label, tint and buffer ID from that source ID. Manifest order and asynchronous decode
completion must not change which audio a named lane displays. **Track stems** shows all
available stems. **6-lane stress test** fills six rows for timing; repeated sources retain
their real names and colors and explicitly say **(copy)**. A four-source track has Other,
not an invented Guitar lane. Both the vector path and column comparison read the same ID.
