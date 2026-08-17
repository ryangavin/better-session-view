import type { CSSProperties, ReactNode } from 'react';
import './chrome.css';

/**
 * A faceplate whose controls read in vertical lanes.
 *
 * `Row` aligns the three parts of unlike controls on one horizontal line. A
 * panel solves the other common device layout: repeated parameter lanes whose
 * sections must land at the same heights all the way across. Each
 * `PanelColumn` participates in the panel's shared row grid through subgrid.
 */
export interface PanelProps {
  children?: ReactNode;
  /** Number of aligned sections in every column. */
  rows: number;
  /** Space between columns, in px. */
  gap?: number;
  className?: string;
}

export function Panel({ children, rows, gap, className }: PanelProps) {
  return (
    <div
      className={`wdg wdg-panel${className ? ` ${className}` : ''}`}
      style={
        {
          '--wdg-panel-rows': rows,
          ...(gap === undefined ? {} : { '--wdg-panel-gap': `${gap}px` }),
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

export interface PanelColumnProps {
  children?: ReactNode;
  className?: string;
}

export function PanelColumn({ children, className }: PanelColumnProps) {
  return <div className={`wdg wdg-panel-column${className ? ` ${className}` : ''}`}>{children}</div>;
}
