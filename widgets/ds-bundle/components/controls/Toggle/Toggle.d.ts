import * as React from 'react';

/**
 * Toggle — from bsv-widgets@0.1.0.
 */
export interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  name?: string;
  /** Springs back instead of staying down, like `live.button`. */
  momentary?: boolean;
  /** In px. The label is the caller's and can be any length, so unlike the controls that read a `Param` this one can't reserv */
  width?: number;
  className?: string;
  title?: string;
  children?: React.ReactNode;
}

export declare const Toggle: React.ComponentType<ToggleProps>;
