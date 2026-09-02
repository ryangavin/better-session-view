# Notation displays

`src/notation/Tablature.tsx`, `PianoRoll.tsx`, and `notation.css`.

These are displays, not music-domain adapters. A host decides what a note means and hands
the widget the answer it can draw:

- `Tablature` gets labelled strings and events that have already been assigned to one of
  them. It owns string geometry, quiet duration hairlines, collision-thinned fret labels,
  bar ruling and click-to-seek. A host may supply each label's ink.
- `PianoRoll` gets a highest-to-lowest keyboard and note blocks that already carry their
  labels, colours and exceptional marks. It owns row geometry, bar and beat ruling, label
  fit and a playhead element the host can move without rendering React at frame rate.

That boundary keeps `widgets/` ignorant of Live, tracks, clips, keys and instruments.
chart[flow] still decides degree colour and whether a note needs a fifth-string mark;
mix[flow] still turns detected pitches into a coherent fret path. Neither app draws the
notation after making those decisions.

Both timelines use the units supplied by their host. A piano roll can be in beats while a
tablature view is in fractions of a file; the reusable fact is their geometry, not one
project's transport.

Their timelines agree without pretending their notation does. The piano roll keeps filled
duration blocks because duration is its shape. Tablature stays closer to plain text: the
fret number interrupts a string with no badge or border, bars are the only vertical ruling,
and duration is a one-pixel underline. The host chooses the fret ink because colour has
musical meaning; the widget keeps that colour off the duration cue so the number remains
the thing a player sees first.
