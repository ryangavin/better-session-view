# Notation displays

`src/notation/Tablature.tsx`, `PianoRoll.tsx`, and `notation.css`.

These are displays, not music-domain adapters. A host decides what a note means and hands
the widget the answer it can draw:

- `Tablature` gets labelled strings and events that have already been assigned to one of
  them. It owns string geometry, duration strokes, collision-thinned labels, the musical
  ruling and click-to-seek.
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

They also share one visual sentence: a labelled gutter, hierarchical musical ruling,
filled duration blocks and text inside the event when it fits. Tablature keeps string
lines and fret numbers while the roll keeps keyboard rows and note names; making them
agree does not make one masquerade as the other.
