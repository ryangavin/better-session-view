import * as React from 'react';

/**
 * Select — from bsv-widgets@0.1.0.
 * @replaces select
 */
export interface SelectProps {
  items: readonly string[];
  index: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: string;
  name?: string;
  /** In px. Settle caller-owned labels so changing the selection cannot resize a panel. */
  width?: number;
  className?: string;
  title?: string;
}

export declare const Select: React.ComponentType<SelectProps>;
