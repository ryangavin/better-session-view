import type { CSSProperties, ReactNode } from 'react';
import './chrome.css';

/**
 * Controls that belong on one line, sharing a rhythm.
 *
 * A device panel reads as one instrument rather than a pile of controls because
 * Live's is a strict grid: every caption on a line sits at one height, every
 * reading at another, whatever is between them. Left to themselves the controls
 * can't do that — a knob is 60px tall and a fader is 76px, so a row of both is
 * ragged at the top and the bottom at once.
 *
 * So the row owns the rhythm and the controls submit to it. Three bands —
 * caption, control, reading — and each widget lays its own parts into them
 * through a subgrid, which is the one way to align the *insides* of siblings
 * rather than the siblings themselves. A widget with nothing to put in a band
 * leaves it empty: a value box reads inside its own body, and it lands in the
 * control band where it belongs.
 */
export interface RowProps {
  children?: ReactNode;
  /** Space between controls, in px. */
  gap?: number;
  className?: string;
}

export function Row({ children, gap, className }: RowProps) {
  return (
    <div
      className={`wdg wdg-row${className ? ` ${className}` : ''}`}
      style={(gap === undefined ? {} : { '--wdg-row-gap': `${gap}px` }) as CSSProperties}
    >
      {children}
    </div>
  );
}
