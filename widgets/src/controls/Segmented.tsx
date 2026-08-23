import type { KeyboardEvent } from 'react';
import type { Param } from '../param/param.ts';
import './controls.css';

/**
 * `live.tab`: an enum with every member on screen at once.
 *
 * This is the one place a Param is genuinely optional — the control needs the
 * members and the index, and an enum Param is just where those usually come
 * from. `itemsOf` adapts one; anything else can pass a list.
 */
export interface SegmentedProps {
  items: readonly string[];
  index: number;
  onChange(next: number): void;
  disabled?: boolean;
  label?: string;
  name?: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  title?: string;
}

/** The members of an enum Param, for handing straight to `items`. */
export function itemsOf(param: Param): readonly string[] {
  return param.items ?? [];
}

export function Segmented({
  items,
  index,
  onChange,
  disabled = false,
  label,
  name,
  orientation = 'horizontal',
  className,
  title,
}: SegmentedProps) {
  const move = (e: KeyboardEvent<HTMLDivElement>, by: number) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(Math.max(0, Math.min(items.length - 1, index + by)));
  };

  return (
    <div className={`wdg wdg-segmented${className ? ` ${className}` : ''}`}>
      {name && <span className="wdg-caption">{name}</span>}
      <div
        className={`wdg-segmented-body wdg-body wdg-segmented-${orientation}`}
        role="radiogroup"
        aria-label={label ?? name}
        aria-disabled={disabled || undefined}
        title={title}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(e, 1);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(e, -1);
        }}
      >
        {items.map((item, at) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={at === index}
            tabIndex={at === index ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(at)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
