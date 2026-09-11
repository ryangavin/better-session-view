import * as React from 'react';

/**
 * Port — from bsv-widgets@0.1.0.
 */
export interface PortProps {
  /** Unique **for this side** across the whole graph — a cord names two of these and nothing else, so they are the graph's on */
  id: string;
  side: "in" | "out";
  /** Shown beside the port, and used as its accessible name. */
  label?: string;
  /** Keep the accessible name and tooltip without printing a second caption. */
  showLabel?: boolean;
  /** The host's own vocabulary, surfaced as `data-kind` for it to style. */
  kind?: string;
  /** Whether a cord already lands here. The host knows; the port doesn't. */
  connected?: boolean;
  disabled?: boolean;
  className?: string;
}

export declare const Port: React.ComponentType<PortProps>;
