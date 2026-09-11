import * as React from 'react';

/**
 * Widget — from bsv-widgets@0.1.0.
 */
export interface WidgetProps {
  /** The printed caption. Controls that read a `Param` default to its short name. */
  name?: string;
  /** For assistive technology. Defaults to the caption. The frame doesn't render it — it belongs on whatever element the cont */
  label?: string;
  layout?: "stacked" | "inline" | "inside";
  disabled?: boolean;
  className?: string;
  title?: string;
}

export declare const Widget: React.ComponentType<WidgetProps>;
