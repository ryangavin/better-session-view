# Beat-grid evidence workbench

`src/debug/AnalysisEvidence.tsx` adds read-only diagnostics to Beat analysis. It retains
the detector, follower, audition, correction, Take, export and trace plots. Both scopes
share the axis and label width, so review buttons frame all evidence together.

## Audio context

The workbench reuses the cancellable Waveform lab measurement and collapsed al Dente
renderer: decoded audio before mixer settings and warp, with channels preserved.
RGB shows broad low/mid/high balance, the outline shows peak and the core shows RMS.
White ticks mark candidate downbeats. Stem rows use a fixed −60 to 0 dBFS light scale,
without per-source normalization. See [the recipe](waveform-lasagna.md) for formulas.
The displayed bin duration makes the at-most-16,384-bin resolution explicit. These
envelopes explain context; the original transient detector provides exact timing.

## Detector agreement

`gridEvidence.ts` compares every explicitly stored in-file beat with the nearest low/mid
transient from the current run, in seconds. High-band hits and extrapolated grid beats
are excluded. The ±20/40/80 ms selector sets the support threshold. The table reports
support, median/p95 absolute distance, time outside the stored map span, and nonfinite
entries or non-increasing intervals. No-onset distances are unavailable, not zero.

The residual plot shows onset minus beat (positive means the hit follows the grid),
clipped at ±100 ms; table distances stay unclipped. Weak ten-second windows are ranked
by ascending support, ties in time order. Windows without stored beats are labeled.
This locates weak evidence, not necessarily musical mistakes: silence, pickups,
syncopation and offbeat rhythms can be valid. Nearest matching is not one-to-one, and
a follower anchored to the same detector naturally earns many zero residuals.
Agreement is an internal consistency check, not independent accuracy or confidence.

Save comparison copies the grid. Candidate, kept and saved grids are all rescored
against the current run's detections and tolerance. The saved label records arm/input
and map mode. The copy lasts until clear, track change or tab unmount.

## Reference accuracy

The reference panel reads the existing `harness/types.ts` Truth JSON format. Imports
validate track ID, in-track region, positive rate, finite increasing samples in-region,
downbeat indices and manual/known source. Limits are 5 MB and 100,000 beats. Importing
does not write the truth repository or the song.

`truthReference.ts` converts candidate sample coordinates to the reference rate and
calls the existing `harness/score.ts` scorer. Matching stays at 70 ms, tight timing at
10 ms, independent of the onset tolerance control. Candidate/kept/saved scores show
F1, continuity, missed/spurious beats, mean signed offset and octave/offbeat/phase flags.
Frame reference region focuses that passage. The reference scorer uses predicted minus
reference time, the opposite sign to the onset plot. Manual and tempo-derived `known`
references remain distinct; neither is silently created from the candidate grid.
Trace-specific anchor fields are unavailable because this adapter supplies an empty trace.

Download evidence writes versioned JSON: track identity, run label, tolerance and metric
definition, audio-summary resolution/source metadata, all three grids and their diagnostics,
current transients, imported reference and full reference scores. It contains no audio.
For reproducibility across algorithm versions, retain Git revision and environment beside
the report; the UI does not infer them. Reports are downloads, not persistent baselines.

## Tests and scope

`gridEvidence.test.ts` checks residual sign, inclusive tolerance, mixed rates, silence,
coverage, high-band exclusion, malformed intervals and end boundaries.
`truthReference.test.ts` checks wrong-track/nonmonotonic rejection and scoring across
rates. Existing scorer tests cover matching behavior.

The iteration loop is: save a comparison, run/edit, inspect weak passages, listen with
the existing click, score an independent reference where available, download evidence.
This work adds diagnostics, not a new flexible-grid algorithm or automatic annotations.
