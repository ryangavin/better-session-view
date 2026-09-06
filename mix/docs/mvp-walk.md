# The MVP walk — Phase 0

Temporary. Written 2026-09-06 against main at 1406466, deleted in Phase 3. The
golden path (import → accept Analyze → generate → export) walked in a browser tab
at `http://localhost:5673` on two tracks that already had stems: **Some Chords**
(the one the harness report covers) and **How I Escaped the Matrix** (the one the
library listed as *no grid*). Nothing was changed on purpose; see *What broke* for
what changed anyway.

## Clicks

Every control passed on the path, in order. **Asked** is whether a person doing the
four-step test would have reached for it.

| # | where | control | asked |
|---|---|---|---|
| 1 | library | the track's row | yes |
| 2 | header | **Analyze** | yes — the test says accept what it shows |
| 3 | Analyze | *Beat algorithm* combobox (Dynamic beat tracker) | no |
| 4 | Analyze | **Run beat analysis** | no — the grid was already saved |
| 5 | Analyze | *Discard beat preview* (disabled) | no |
| 6 | Analyze | timeline: Whole song · Zoom in · Zoom out · ← · → | no |
| 7 | Analyze | First downbeat · Middle · Near end | no |
| 8 | Analyze | Individual stems toggle | no |
| 9 | Analyze | seven *Review … at bar N* section markers | no |
| 10 | Analyze | listening-position slider | no |
| 11 | Analyze | ▶ Listen for 4 bars · Metronome · *Listen to* combobox | no |
| 12 | Analyze | *Section spacing* combobox (8-bar phrases) | no |
| 13 | Analyze | *Review section change* combobox | no |
| 14 | Analyze | **Use these N sections when applying** | no |
| 15 | Analyze | Title · Artist · Album fields, catalogue search, remove cover | no |
| 16 | Analyze | three model cards | only on a track with no stems |
| 17 | Analyze | **Separate again** | only on a track with no stems |
| 18 | Analyze | **Back to mix** or **Apply analysis & return** | yes — and it is not clear which |
| 19 | header | **Export** | yes |
| 20 | export dialog | stems / ableton song pack (greyed) | no — stems is already on |
| 21 | export dialog | Vocals · Drums · Bass · Other · Full track (greyed) | no — all on |
| 22 | export dialog | *Laid straight at N BPM* (a pick that is always on) | no |
| 23 | export dialog | **pinned per** section · phrase · bar · beat | this is the one the MVP replaces with a loop length |
| 24 | export dialog | Cut into N sections | no |
| 25 | export dialog | Change… (folder) | no |
| 26 | export dialog | **Export stems** | yes |

Five clicks a person asked for: the row, Analyze, a way out of Analyze, Export,
Export stems. Twenty-one they walked past. Step 1 of the test (Import) was not
walked: the picker is an OS dialog and both tracks were already in the library.
Step 2 (Generate) was not walked for the same reason; on these tracks it is the
*Separate again* button at the foot of the Analyze page.

Also on the mixer, not on the path but on the screen the whole time: the tempo
slider, the clock, five snap radios, **Edit beat grid**, the tempo-range and
agreement summary (*128–131 · 100%*), **warp**, per-stem three-band EQ with two
crossover sliders, level, mute, solo, bass tablature, Reset, Show the whole track.

## What the export dialog said

| | Some Chords | How I Escaped the Matrix |
|---|---|---|
| laid at | 128 BPM · fitted | 144 BPM · fitted |
| density (measured) | **per bar** | **per bar** |
| sentence | *every bar line on the grid* | *every bar line on the grid* |
| length | 259 bars · 484 s | 383 bars · 636 s |
| sections offered | 8 | 9 (one of them 216 bars long) |
| folder the export dialog named | `~/Music/mixflow/some-chords/` | `~/Music/mixflow/how-i-escaped-the-…/` |
| folder written | `~/Music/mixflow/Some Chords 128bpm/` | `~/Music/mixflow/How I Escaped the Matrix 144bpm/` |
| after writing | *4 wav · 259 bars · pinned per bar* | *4 wav · 383 bars · pinned per bar* |

Both tracks measured into *per bar*, so the sentence beside the control says the
one thing per-bar pinning can only ever say. The export dialog never showed a number: what
per section or per phrase would have cost is not on it unless you click them.

## What broke

No fixes; a list.

- **Analyze offers two ways out and the test needs one.** *Apply analysis & return*
  and *Back to mix* sit side by side on a track whose grid is already saved and
  nothing was run. Which is "accept what Analyze shows"? Back was pressed both
  times, on the reasoning that nothing had been proposed.
- **Coming back from Analyze changed the ruler.** Some Chords opened with seven
  sections over 130 bars (Intro 1, Drop 13, Drop 2 29, Build 61, Drop 3 69,
  Drop 4 85, Outro 117). After Analyze → Back, with nothing applied, it had eight
  sections over 260 (Intro 1, Verse 25, Verse 2 53, Drop 109, Verse 3 117,
  Verse 4 165, Verse 5 197, Outro 229) — and the Analyze page had said "your 8
  current sections" while the ruler showed seven. Likely a first-open state
  drawn before the saved grid arrived; either way a person saw two different
  songs and pressed nothing.
- **The export dialog names a folder the export does not write.** *to* shows a lowercase
  slug (`some-chords/`); the files go to `Some Chords 128bpm/`. The success line
  afterwards has the real path, so it corrects itself after the fact.
- **Opening a track measures it, silently, and writes to the library.** The Matrix
  row said *no grid*; clicking it gridded the song and wrote `analysis.json`
  within ten seconds, with no progress shown in the mixer and no way to decline.
  Some Chords' `analysis.json` was also rewritten during the walk (13:02:50Z,
  after its export finished at 13:01) though nothing was applied — a save fired
  on some click on the path. Not identified.
- **The tempo summary asks a question it does not answer.** Matrix's header reads
  *134–270 · 100% ellis*: a range wider than an octave and a perfect score in the
  same chip. The export is at 144. A person cannot tell whether the file is at
  the right tempo or half of it.
- **Nine sections, one of them 216 bars.** Matrix's suggested sections are 28, 12,
  216, 24, 48, 32, 8, 8, 7 bars. The Analyze page was still "Reading song
  structure…" and offering "Use these 1 sections" when it was left. A section
  list that is half one section is not one a person would export by.
- **The first click on a library row after closing the export dialog did nothing.** Escape
  closed the export dialog; the next click on the Matrix row was swallowed and
  had to be repeated.
- **Each export wrote 0.7–0.9 GB.** Float WAVs of the whole record, four stems:
  Some Chords 4 × 171 MB, Matrix larger. Not an error, but the export dialog says
  nothing about size and a person with a small drive finds out afterwards.
- **The mixer clock read 0.4.4 on Some Chords** with the transport stopped at
  the start; Matrix read 1.1.1. Not chased.
