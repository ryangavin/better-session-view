import * as React from 'react';

/**
 * Chain — from bsv-widgets@0.1.0.
 */
export interface ChainProps {
  /** The devices, in order. */
  children?: React.ReactNode;
  /** Where a dragged device would land, counted between children — 0 before the first, `count` after the last. The strip draw */
  dropAt?: number;
  /** What an empty chain says. Live's is "Drop an audio effect here". */
  placeholder?: string;
  /** How many rows of controls a device in this chain is tall — two, the way Live's footer is, unless a host says otherwise.  */
  rows?: number;
  /** In px, if a host would rather say it outright than in rows. */
  height?: number;
  className?: string;
}

export declare const Chain: React.ComponentType<ChainProps>;
