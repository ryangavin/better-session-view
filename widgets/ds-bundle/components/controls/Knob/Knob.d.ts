import * as React from 'react';

/**
 * Knob — from bsv-widgets@0.1.0.
 */
export interface KnobProps {
  param: Param;
  value: number;
  onChange: (next: number) => void;
  onRelease?: () => void;
  /** Authoritative text — Live's own `str_for_value`, where there is a Live. */
  display?: string;
  /** Where the filled arc grows from. `live.dial` calls this the needle mode; the default reads it off the range, since a con */
  origin?: "min" | "center";
  showValue?: boolean;
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

export declare const Knob: React.ComponentType<KnobProps>;
