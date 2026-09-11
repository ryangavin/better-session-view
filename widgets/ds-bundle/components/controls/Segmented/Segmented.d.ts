import * as React from 'react';

/**
 * Segmented — from bsv-widgets@0.1.0.
 */
export interface SegmentedProps {
  items: readonly string[];
  index: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: string;
  name?: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
  title?: string;
}

export declare const Segmented: React.ComponentType<SegmentedProps>;
