# Checking the beat finding

The app can say what grid it found; it cannot say why. The analysis harness can.
It is the bug button beside the open track's title, and it opens over the window
— in a dev build and a packed one alike, because it runs the same pipeline on the
same decoded stems the lanes are drawn from, and what it decides goes back to the
app over the same bridge.

## The page

`src/debug/Analysis.tsx`, built on [`widgets/src/debug`](../../widgets/docs/debug.md).

The first look is the app's own pipeline — `transients.ts` → `tempo.ts` →
`follow.ts` — on the drums, run with a trace so every decision on the way to the
answer is kept. The **run** group runs any arm of the A/B rig (`src/debug/arms.ts`)
on the drums or the whole mix summed back together, so a wrong tempo can be
traced to the stage that lost it.

One time axis, zoomable to the sample: the drums; every transient by band; every
beat of the map, anchored solid and interpolated dashed; the grid the app holds
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
