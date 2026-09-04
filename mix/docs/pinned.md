# Pinning the record to the grid

`src/pinned.ts`, read by `src/straighten.ts` for the export and `src/schedule.ts`
for the stretcher. Issue #41 is the plan this comes from.

## Two questions, kept apart

`warp.ts` answers *where were the beats*: a sample for every beat, as it was
heard. This answers *where does the audio go*: a **pin** is a source sample that
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

Between the sections, one of four densities, and they differ in nothing but how
many pins there are:

| pinned per | which is |
|---|---|
| section | one speed a section. Every push and pull inside is exactly as it was played |
| phrase | every four bars, counted from the section's first whole bar |
| bar | every bar line |
| beat | every beat on its line, which is what the map did before it could be asked |

**The default is measured.** `loosest` tries the densities from the sparsest and
takes the first whose bar lines all land within ten milliseconds — about a
sixty-fourth of a beat at 128 — and reports how far the worst is off. Per bar
always lands them, so per beat is never measured into; it is asked for. The
export sheet shows the answer in those words beside the control, with the
number, and never as a percentage: *pinned per section — every bar line on the
grid*, or *the worst bar line 31 ms off*.

**One answer for the stretcher and the export.** The window holds the density
and hands it to both with the cuts, so a section looped under warp plays what
its file will hold. It is not written beside the track: how tightly to pin is a
question about what the files are for, and the next export may be for something
else.

## What holds

- Pinned per beat lays bit for bit what `following` laid before it existed, at
  44.1 kHz on a slowing, a stepping, a wobbling and a straight record — checked
  against the old code before it went.
- Pinned per section, every beat interval inside a section keeps its ratio to
  the next one to nine decimals, and the cuts land to the sample.
- Pins are strictly increasing in both coordinates at every density, so a speed
  is always finite and positive and time never runs backwards.
- Adding a cut moves nothing before it. Pinning more densely never lands a bar
  line further off.
- Cuts out of order or below zero are refused; a cut past the end is dropped.
- Playback: the offline transport harness passes on the pinned schedule — seek
  within half a sample, loop join as smooth as the audio, section loop inside its
  span, stems at zero lag through a tempo change, level within a hundredth of a
  decibel.

## Not yet

- The warp lane draws the beats and not the pins. It should draw both, apart.
- Cuts snap to whatever the ruler is drawing; a section meant as a loop should
  sit on whole bars, and the length column should be typeable.
- Nothing in the library is played by a person. Per phrase and per bar earn their
  place on a drummer who drifts, and there is no such record to judge them on.
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
