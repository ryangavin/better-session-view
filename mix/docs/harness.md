# Checking the beat finding

The app cannot show whether the beats it found are right: the pipeline's
intermediates are internal, and a grid drawn at one tempo cannot say where a
pulse was missed. The harness can. It is not user-facing, and is built to be
thrown away when the beat finding is trusted.

## Run

```
npm run warp:mix -- --report            every track in the app's library
npm run warp:mix -- --report --only=Sandstorm
npm run warp:mix -- --file=/path/to.wav  a file: into the harness's own library, separated, run
npm run warp:mix -- --youtube=URL        the same from a video (--model= to choose the separator)
npm run dev:mix-ui                       then open http://localhost:<mix port>/harness/
```

A run writes `harness/reports/<track id>.json` — the transients, the fit, the
follow, the map, and the trace from both stages — with the stems hard-linked
beside it, and an index. The folder is generated and ignored, apart from
`harness/reports/truth/`, which is yours.

## What the page shows

One time axis, zoomable to the sample. The drums stem; every transient by band;
every beat of the map, anchored ones solid and interpolated dashed; the local
tempo the follower held to, with the stretches it read a period off; the truth
where there is one. Under it, the autocorrelation with every candidate period
marked and the phase sweep that placed the winner, so an octave or an off-beat
error is seen at the decision that made it rather than inferred from the grid.
Play the stems with a click on every beat, from either map, and loop a region.
The ear is the strongest check there is.

## Truth, and the error report

Set a loop over a stretch worth correcting — sixteen bars is plenty — and press
Correct. The predicted beats in the region become the truth, and you fix them:
drag one to where it should be (it snaps to the nearest transient; Alt to
place freely), Alt-click one that is not a beat, double-click where one is
missing, rotate the bar line, halve or double. Each fix is recorded as the
kind of error it names. Save writes `harness/reports/truth/<track id>.json`.

The next `--report` run scores every track with a truth file into
`harness/reports/errors/<track id>.md`: on time, shifted, missed and spurious
per true beat, F-measure and continuity, the shape of the misses — half or
double tempo, between the beats, a bar line that starts late — and, for every
true beat, what was heard under it and whether the map's beat there was
anchored or interpolated. That page is written to be read by whoever is
changing `src/transients.ts`, `src/tempo.ts` or `src/follow.ts` next. The JSON
beside it diffs across runs.

A known tempo in `tools/mix-warp-truth.json` is not laid out as beats. A rip
running 0.08% off its label is 190 ms adrift after four minutes, and every
beat would score missed; it stays a tempo check, in the table.

## Where

| | |
|---|---|
| `src/trace.ts` | what the two stages write when handed a trace; the app passes none |
| `tools/mix-warp.ts` | the run, the report, the intake and the scoring |
| `harness/types.ts` | the report, the truth and an edit |
| `harness/score.ts` | the judgement, pure, tested |
| `harness/edit.ts` | the corrections, pure, tested |
| `harness/main.ts`, `draw.ts`, `audio.ts` | the page |
| `harness/vite-truth.ts` | the dev server writing a saved truth to disk |
