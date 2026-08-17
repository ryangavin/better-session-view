import type { CSSProperties } from 'react';
import './controls.css';

/** A compact enum: one member on screen, with the rest in a menu. */
export interface SelectProps {
  items: readonly string[];
  index: number;
  onChange(next: number): void;
  disabled?: boolean;
  label?: string;
  name?: string;
  /** In px. Settle caller-owned labels so changing the selection cannot resize a panel. */
  width?: number;
  className?: string;
  title?: string;
}

export function Select({
  items,
  index,
  onChange,
  disabled = false,
  label,
  name,
  width,
  className,
  title,
}: SelectProps) {
  const chars = Math.max(0, ...items.map((item) => item.length));

  return (
    <div
      className={`wdg wdg-select${className ? ` ${className}` : ''}`}
      style={
        {
          '--wdg-select-chars': chars,
          ...(width === undefined ? {} : { '--wdg-select-width': `${width}px` }),
        } as CSSProperties
      }
    >
      {name && <span className="wdg-caption">{name}</span>}
      <select
        className="wdg-select-body wdg-body"
        value={Math.max(0, Math.min(items.length - 1, index))}
        aria-label={label ?? name}
        disabled={disabled}
        title={title}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      >
        {items.map((item, at) => (
          <option key={`${item}-${at}`} value={at}>{item}</option>
        ))}
      </select>
    </div>
  );
}
