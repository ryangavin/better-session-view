import * as React from 'react';

/**
 * Row — from bsv-widgets@0.1.0.
 */
export interface RowProps {
  children?: React.ReactNode;
  /** Space between controls, in px. */
  gap?: number;
  className?: string;
}

export declare const Row: React.ComponentType<RowProps>;
