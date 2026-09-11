import * as React from 'react';

/**
 * Slider — from bsv-widgets@0.1.0.
 * @replaces input[type=range]
 */
export interface SliderProps {
  param: Param;
  value: number;
  onChange: (next: number) => void;
  onRelease?: () => void;
  /** How far something else may carry this control, signed, drawn as a span. With `onDepth`, holding shift drags this rather  */
  depth?: number;
  onDepth?: (next: number) => void;
  /** Where the thing driving this control has it right now, 0 to 1. Drawn as a bright pip inside the span, so the row answers */
  live?: number;
  display?: string;
  /** Which way the track runs, and so which way the drag goes. Not to be confused with `layout`, which is where the caption a */
  orientation?: "horizontal" | "vertical";
  /** Where the fill grows from. Defaults to the middle when zero is the middle. */
  origin?: "min" | "center";
  showValue?: boolean;
  /** Length along the axis, in px. The other dimension is fixed. */
  length?: number;
  travel?: number;
  /** The printed caption. Controls that read a `Param` default to its short name. */
  name?: string;
  /** For assistive technology. Defaults to the caption. The frame doesn't render it — it belongs on whatever element the cont */
  label?: string;
  layout?: "stacked" | "inline" | "inside";
  disabled?: boolean;
  className?: string;
  title?: string;
}

export declare const Slider: React.ComponentType<SliderProps>;
