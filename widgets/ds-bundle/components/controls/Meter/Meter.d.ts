import * as React from 'react';

/**
 * Meter — from bsv-widgets@0.1.0.
 */
export interface MeterProps {
  /** 0–1. Clamped, because a meter that overshoots its own box is a bug you see. */
  value: number;
  /** 0–1. A hold, drawn as a line across the fill. */
  peak?: number;
  orientation?: "horizontal" | "vertical";
  /** Authoritative text to show when `showValue` is on. */
  display?: string;
  /** Preserve the old meter face by default; row faces opt into the reading. */
  showValue?: boolean;
  /** In px, across the bar. */
  width?: number;
  /** In px, along it. */
  length?: number;
  /** The printed caption. Controls that read a `Param` default to its short name. */
  name?: string;
  /** For assistive technology. Defaults to the caption. The frame doesn't render it — it belongs on whatever element the cont */
  label?: string;
  layout?: "stacked" | "inline" | "inside";
  className?: string;
  title?: string;
}

export declare const Meter: React.ComponentType<MeterProps>;
