# Pinning the record to the grid

`src/pinned.ts`, read by `src/straighten.ts` for the export and `src/schedule.ts`
for the stretcher. Issue #41 is the plan this comes from.

## Two questions, kept apart

`warp.ts` supplies the effective musical grid: a sample for every beat. Automatic
grids retain detector observations separately through [musical tempo](musical-tempo.md). This answers *where does the audio go*: a **pin** is a source sample that
plays at an output sample, and between two pins the record runs at one speed.
They used to be the same thing. The beat map was the time map, so every beat was
pinned to its line on export and under warp alike, and on a record made to a
click that is the detector's few milliseconds of scatter turned into a speed
change on every beat. That is what a squashed export sounds like, and it was
every export: the bypass that plays a straight record unstretched was playback
only.

## What is pinned

The **sections** always. A slice is a bar on the grid, and each one lands exactly
on its bars whatever else is decided; the end of the record is pinned to the end
of its last whole bar, and 1.1.1 to output zero. What the map has before 1.1.1
is a section of its own, pinned at its first beat, so a count-in plays at its own
speed and lands on the one.

Between the sections, one density, and they differ in nothing but how many
pins there are:

| pinned | which is |
|---|---|
| per section | one speed a section. Every push and pull inside is exactly as it was played |
| every 16, 8, 4 or 1 bars | every line a loop of that length starts on, **counted from 1.1.1** |
| per beat | every beat on its line, which is what the map did before it could be asked |

**The lattice is counted from 1.1.1, never from a cut.** Live's global
quantization counts from 1.1.1, so a file pinned every eight bars loops cleanly
at every eight-bar line a launch can land on. A cut adds a pin and moves no
other: cut at bar 37 and pinned every 8, the pins are 32, 37, 40, 48 — not 45.

**The offline default is measured.** `loosest` tries the densities from the sparsest and
takes the first whose bar lines all land within ten milliseconds — about a
sixty-fourth of a beat at 128 — and reports how far the worst is off. Every bar
always lands them, so per beat is never measured into; it is asked for.

**Link defaults to four bars.** Its header selector offers 4, 8, 16 bars or sections,
using the same window choice as export. This leaves interior groove intact while
holding phrase boundaries to the shared tempo. Clock corrections follow the pinned
schedule; launch phase is the rendered output position, including when seeking
between pins. Link never overrides this choice to per beat.

**The export dialog asks what the files are for.** *Loops of* 4, 8 or 16
bars, or *sections*: the measured answer when it is one of those, eight bars
otherwise. Sections pins the cuts alone, so a twenty-four bar section lands
its first and last bar on the grid and keeps every push and pull between them
— that is what a section is for, and a loop length would quantize the feel
out of it. Every bar and per beat exist for the stretcher, the tests and the
harness. The sentence beside the control says which lines the finer loops
would want and how far the worst of them is off, never as a percentage:
*every 4-bar line on the grid*, or *the worst 4-bar line 6 ms off*. Under a
loop of four the finer lines are the bar lines. The line after writing says
the whole of it: *4 wav · 259 bars · pinned every 8 bars*.

**The export reports as it goes.** `straighten.ts` lays a span at a time
through a generator; the main process drains it with the event loop given
back between spans and pushes `openflow:export-progress`, so the dialog draws
a bar and the window is not frozen for the length of a stem. The sync entry
drains the same generator, so the paced export and the tests cannot lay a
different file.

**One answer for the stretcher and the export.** The window holds the loop
length and hands it to both with the cuts, so a section looped under warp plays
what its file will hold. It is not written beside the track: how tightly to pin
is a question about what the files are for, and the next export may be for
something else. Linked to Live, playback follows the header's **Link pins**
instead — its own choice, because under Link the question is how tightly to
follow the room, not what a file is for.

**Cut into sections, each section is laid at its own tempo.** A record that
runs at 128 and then at 140 is not a record at 135: laid there both halves
are warped and neither loops in Live at the tempo on the file. So each
section is laid at the whole number nearest the median beat inside it —
`tempoBetween` in `warp.ts` — which on a steady section is no warp at all,
the least there is; the file carries that tempo in its name, the folder the
range (`Example 128-140bpm`), and the dialog's list shows the
tempo beside each section before anything is written. A ramp gets the median
of its own beats, which is as honest as one number can be about a ramp, and
it is not the section anyone loops. The header keeps saying the range; the
stretcher under warp plays at the one tempo the header holds. An uncut
export is still one tempo for the whole record.

**The folder is named once.** `src/exportNames.ts` says what an export is
called — `Some Chords 128bpm` — and the dialog and the main process both read
it, so the dialog never names a folder the export does not write. Cut into
sections, each stem gets a numbered folder holding its sections in order —
`2 - drums/04 Drop - Some Chords - drums - 128bpm.wav` — so one drag of a
stem's folder onto one Live track lands every section of it as clips in the
running order: four drags for a song, not one per section. The line after
writing reads its worst line on the same lattice the sentence did.

## What holds

- Pinned per beat lays bit for bit what `following` laid before it existed, at
  44.1 kHz on a slowing, a stepping, a wobbling and a straight record — checked
  against the old code before it went.
- Pinned per section, every beat interval inside a section keeps its ratio to
  the next one to nine decimals, and the cuts land to the sample.
- Every lattice line's output is exactly its beat times the spacing, and its
  source is the map's beat; a cut adds its pin and leaves the lattice where it
  was.
- Pins are strictly increasing in both coordinates at every density, so a speed
  is always finite and positive and time never runs backwards.
- Adding a cut moves nothing before it. Pinning more densely never lands a bar
  line further off; pinned every 4 corrects no less than every 8.
- Cuts out of order or below zero are refused; a cut past the end is dropped.
- Playback: the offline transport harness passes on the pinned schedule — seek
  within half a sample, loop join as smooth as the audio, section loop inside its
  span, stems at zero lag through a tempo change, level within a hundredth of a
  decibel.

## Measured on the library

`npm run loops:mix` — `tools/mix-loops.ts` — lays every track's drums stem
pinned every 4, 8 and 16 bars, hears the output again, and writes how far each
lattice line is from the kick nearest it to `harness/reports/loops.md`: median
and worst per track per length. No threshold is asserted. A line tens of
milliseconds out is a grid that is wrong there, not a pin, and goes to the beat
finding as a bar number. [`harness.md`](harness.md) has the batch run.

## Not yet

- The warp lane draws the beats and not the pins. Pin density is visible in the
  Link header selector and the export dialog; the timeline does not draw pins yet.
- Cuts snap to whatever the ruler is drawing; a section meant as a loop should
  sit on whole bars, and the length column should be typeable.
- Nothing in the library is played by a person. Every bar earns its place on a
  drummer who drifts, and there is no such record to judge it on.
- A rate step at a cut is the one discontinuity per-section pinning has. Small on
  anything measured so far; unmeasured on anything that moves.
- Smoother interpolation between pins, and soft pins, only if the above shows
  affine spans failing.

## Decisions

- **2026-09-04** — the map stays what it is; the transformation is a second
  type rather than a change to `Beats`. Piecewise-affine between hard pins, no
  cost function: the prompt's rigidity ladder is pin density, which is explicit
  and testable, and nothing measured yet shows affine spans failing.
- **2026-09-04** — the default density is measured, not chosen, and shown with
  its number. A percentage was rejected as an opaque scalar.
- **2026-09-04** — words: beats are detected, a drawn one is a `BeatMarker`, a
  pin holds audio to the grid, a section is *pinned to* its bar count. "Anchor"
  and the warp lane's old "pin" were renamed so pin means one thing.
- **2026-09-06** — the lattice is counted from 1.1.1, not from each section's
  first whole bar, because that is what Live's global quantization counts
  from. *Phrase* went with it: `Every` is section, beat, or a bar count of
  1, 4, 8 or 16, and the dialog offers the three a loop is for. Nothing new is
  written to `analysis.json`. The control says *Loops of 8 bars* and the
  sentence *pinned every 8 bars*; never *quantize*, *warp*, *snap* or *anchor*.
- **2026-09-06** — *sections* stays on the dialog beside the loop lengths.
  Ryan: a twenty-four bar section should land its first and last bar and
  nothing between should be forced to four or eight. The measured default may
  be sections.
- **2026-09-06** — a record may change tempo, and the header says so as a
  range; the export does not varispeed it to one number. Cut into sections,
  each is laid at its own tempo — the minimal warp — so the steady sections
  loop in Live at the tempo on the file. Synthetic tempo changes illustrate distinct export tempos.
