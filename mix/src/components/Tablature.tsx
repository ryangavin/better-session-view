import { useMemo } from 'react';
import {
  Tablature as TablatureWidget,
  type NotationGrid,
  type TablatureNote,
} from '@openflow/widgets/notation/Tablature.tsx';
import {
  assignFrets,
  fretMark,
  transposeNotes,
  type TranscribedNote,
  type Tuning,
} from '../tab.ts';
import { fretColor } from '../tablature.ts';
import { barAt, placeOf, type Bars } from '../warp.ts';
import type { Span } from '../zoom.ts';

export interface TablatureProps {
  notes: readonly TranscribedNote[];
  tuning: Tuning;
  transpose?: number;
  seconds: number;
  bars: Bars;
  span: Span;
  height: number;
  onSeek?(fraction: number): void;
}

/**
 * mix[flow]'s adapter around the reusable notation widget.
 *
 * The app owns pitch correction and the whole-phrase fret path. The widget is
 * handed only drawable string events, a grid and a timeline view.
 */
export function Tablature({
  notes,
  tuning,
  transpose = 0,
  seconds,
  bars,
  span,
  height,
  onSeek,
}: TablatureProps) {
  const assigned = useMemo(
    () => assignFrets(transposeNotes(notes, transpose), tuning),
    [notes, tuning, transpose],
  );
  const drawable = useMemo<TablatureNote[]>(
    () => seconds > 0 ? assigned.map((note) => ({
      from: note.start / seconds,
      to: note.end / seconds,
      string: note.string,
      label: fretMark(note),
      color: fretColor(note),
      kind: note.unplayable ? 'unplayable' : note.muted ? 'muted' : 'note',
      strength: note.confidence,
    })) : [],
    [assigned, seconds],
  );
  const strings = useMemo(
    () => tuning.map((string) => ({ label: string.name })),
    [tuning],
  );
  // Memoised because the widget repaints on the grid's identity, and a fresh
  // pair of closures every render would be a repaint every render.
  const grid = useMemo<NotationGrid>(
    () => ({ barAt: (place) => barAt(bars, place), placeOf: (bar) => placeOf(bars, bar) }),
    [bars],
  );

  return (
    <TablatureWidget
      strings={strings}
      notes={drawable}
      view={span}
      height={height}
      grid={grid}
      className="mf-tablature"
      onSeek={onSeek}
    />
  );
}
