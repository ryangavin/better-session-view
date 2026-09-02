import {
  assignFrets,
  fretMark,
  transposeNotes,
  type FrettedNote,
  type TranscribedNote,
  type Tuning,
} from './tab.ts';
import type { Span } from './zoom.ts';

export interface DrawnFret extends FrettedNote {
  at: number;
  until: number;
  label: string;
}

/** Fret the whole phrase before filtering, so paging cannot change fingering. */
export function fretsIn(
  notes: readonly TranscribedNote[],
  tuning: Tuning,
  seconds: number,
  span: Span,
  transpose = 0,
): DrawnFret[] {
  if (!(seconds > 0) || !(span.to > span.from)) return [];
  const wide = span.to - span.from;
  return assignFrets(transposeNotes(notes, transpose), tuning)
    .filter((note) => note.end / seconds >= span.from && note.start / seconds <= span.to)
    .map((note) => ({
      ...note,
      at: (note.start / seconds - span.from) / wide,
      until: (note.end / seconds - span.from) / wide,
      label: fretMark(note),
    }));
}
