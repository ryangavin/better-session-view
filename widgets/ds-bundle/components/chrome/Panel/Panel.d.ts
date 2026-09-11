import * as React from 'react';

/**
 * Panel — from bsv-widgets@0.1.0.
 */
export interface PanelProps {
  children?: React.ReactNode;
  /** Number of aligned sections in every column. */
  rows: number;
  /** Space between columns, in px. */
  gap?: number;
  className?: string;
}

export declare const Panel: React.ComponentType<PanelProps>;
