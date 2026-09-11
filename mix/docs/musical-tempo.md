# Musical tempo and gentle Sync

This contract separates detector observations from the musical clock. A kick or clap
can land early or late without changing the song's BPM. `src/musical.ts` fits automatic
maps, retains the original sample observations with versioned provenance, and leaves
manual and unidentified legacy grids intact. Library summaries, Prep and deck loading
use the same interpretation. Reading an existing analysis does not rewrite it on disk.

## Research boundary

Verified against the [rekordbox 7.2.18 manual](https://cdn.rekordbox.com/files/20260807093645/rekordbox7.2.18_manual_EN.pdf):
Normal analysis suits consistent tempo; Dynamic suits significant tempo changes (p237).
Beat Sync matches both BPM and beat position (p168). Pitch bend temporarily speeds or
slows playback (p78–79); Master Tempo preserves pitch during speed changes (p120).
[Pioneer DJ's official explanation](https://forums.pioneerdj.com/hc/en-us/community/posts/360056401772-BPM-Sync-vs-Beat-Sync-What-s-the-difference)
distinguishes BPM-only Sync from Beat Sync. The
[current FAQ](https://rekordbox.com/en/support/faq/rekordbox7/#faq-15798) confirms Normal
analysis produces static beat grids. These describe observable controls, not a published
internal controller, pin spacing or correction horizon. Our implementation below is our
own policy, not a claim about rekordbox's proprietary DSP.

## Clock estimation

A robust regression of detected sample positions against counted beats is the default.
Distant beat pairs seed slope; robust weighted least squares removes alternating-groove
lag bias and downweights outliers. Median residuals seed phase. Results are weakly cached
by immutable map identity, so rendering does not refit unchanged evidence. Isolated displaced attacks
are excluded from the model comparison's worst fifth. A split needs at least 32 beats on
each side, a slope change above 0.5%, at least 80ms accumulated separation, near-continuous
phase, and at least 75% reduction in trimmed squared error. At most four subdivision
levels prevent per-beat fitting. A sustained half/double counting discontinuity is flagged for review, with no invented
range or usable Play Sync map; timestamps cannot decide whether that is a real tempo
change or a tracking error. A steady half-time feel does not trigger this guard.
Musical octave and missing-beat errors still require review. This fit
cannot establish the correct counted pulse or first downbeat from timestamps alone.

Raw evidence remains in `Beats.musical.raw`, including its own sample rate and first
beat, with interpretation version 1 and regional BPMs. A manually set beat, manual grid
or unidentified legacy algorithm bypasses automatic fitting. Source sections retain
beat numbering. No named song has a hardcoded tempo; song-specific BPM and regional
changes require direct measurement rather than inferring tempo from half-time feel.

## Playback contract

Only playing decks participate in local leadership; loaded/paused decks have no vote.
The sole playing deck leads. At normal speed it uses native unity playback even with
Sync armed. An explicit tempo adjustment remains a separate override; Normal speed
clears it. Link remains external tempo authority; disconnecting while playing retains
the last shared rate as a local override rather than changing speed unexpectedly.

A follower's base ratio is master BPM divided by source musical BPM. A uniform musical
grid therefore produces a uniform ratio: groove is carried with the recording. Variable
and manually edited maps use broad eight-bar spans plus confirmed tempo boundaries.
This is independent of the header's quick-loop size and Q marker quantization.

Initial launch, Cue latch and deliberate seek acquire phase separately. Ongoing phase
tracking does not seek into the recording: it retimes from the continuous current
source position. Corrections have a 0.015-beat deadband, target a sixteen-beat recovery
horizon, cap additional speed at ±1%, and change by at most 0.25 percentage points each
250ms update. Large errors consequently take longer than that nominal horizon. This
is a conservative initial policy whose audible suitability needs listening acceptance.

**Preserve pitch** is independent of Sync and defaults on. On uses pitch-preserving
stretching when speed differs (unity mappings bypass spectral processing, including
already-matched followers); off uses native playback-rate changes with corresponding
pitch movement. It never matches another song's key. Both paths integrate the same
source-time map for position, loop duration and scheduled end; changing AudioParam
alone would leave the displayed playhead wrong. Native normal-speed playback bypasses
the stretcher regardless of this preference.

## Acceptance and limits

Synthetic tests cover steady tempo with jitter/frame quantization/outliers, a sustained
step, short fills, half-time feel, manual-grid protection, sole-playing leadership,
explicit speed control, pitch preference and rate/position integration. Read-only
`MixerEngine.playbackDiagnostics()` exposes renderer path and actual source/output rate.
The release smoke playbook tracks rendered tonal/percussion comparison and listening.
Timing arithmetic and control tests do not prove transient fidelity, audible pitch-lock
quality, or song-specific BPM accuracy. No real library reanalysis or unattended audio
playback is part of this change.

Future worklet boundaries use current `outputTime` and future `output`. The former
prunes elapsed segments inside Signalsmith; using a future time there could discard
active audio. Future events are appended strictly after the preceding boundary, because
Signalsmith also replaces events exactly at `outputTime`. The offline rendered regression
caught these cases in broad-span playback,
and the same correction applies to Prep scheduling.

## Synthetic computation benchmark (2026-09-11)

On this development machine, 100 fresh five-minute 129 BPM grids with alternating
−9/+12ms attack displacement and an 85ms outlier every 47 beats took 94.3ms total
(0.94ms/grid). Raw adjacent-interval BPM ranged 107.31–161.68; the fitted musical
region was 129.00013. At target 129, old per-beat source/output rates ranged
0.79787–1.20212; broad musical-map rates ranged 0.9999978–1.0000076. This measures
clock arithmetic on a constructed fixture, not listening quality or real-song accuracy.

The actual offline tonal/percussion regression is in `e2e/tempo-render.spec.ts` and
`harness/tempo-render.ts`; release-smoke documentation records the rendered bounds and
keeps listening, sustained drift rendering and song-specific acceptance separate.
