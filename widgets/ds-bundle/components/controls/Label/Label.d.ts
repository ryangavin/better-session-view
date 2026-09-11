import * as React from 'react';

/**
 * Label — from bsv-widgets@0.1.0.
 */
export interface LabelProps {
  children: React.ReactNode;
  /** Section headings sit above a group; a plain label sits under a control. */
  heading?: boolean;
  className?: string;
}

export declare const Label: React.ComponentType<LabelProps>;
