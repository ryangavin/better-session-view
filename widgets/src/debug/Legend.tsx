import type { CSSProperties } from 'react';
import './debug.css';

/**
 * What the marks on a drawing mean.
 *
 * A line, a taller one, a dashed one, a swatch, a dot, or a piece of text in
 * the ink it is drawn in. The ink is a colour string — usually a `var(--…)` —
 * so the legend follows the palette the way the drawing does.
 */
export interface LegendItem {
  kind: 'line' | 'tall' | 'dashed' | 'swatch' | 'dot' | 'text';
  ink: string;
  label: string;
  /** For `text`: what is printed in the ink. */
  text?: string;
  title?: string;
}

export interface LegendProps {
  items: readonly LegendItem[];
  className?: string;
}

export function Legend({ items, className }: LegendProps) {
  return (
    <span className={`wdg wdg-legend${className ? ` ${className}` : ''}`}>
      {items.map((item, i) => (
        <span key={i} className="wdg-legend-item" title={item.title}>
          <i className={`wdg-legend-mark wdg-legend-${item.kind}`} style={{ '--wdg-legend-ink': item.ink } as CSSProperties}>
            {item.kind === 'text' ? item.text : null}
          </i>
          {item.label}
        </span>
      ))}
    </span>
  );
}
