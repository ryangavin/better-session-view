import type { ReactNode } from 'react';
import './controls.css';

/**
 * `live.toggle`, and `live.button` when it doesn't stay down.
 *
 * A switch takes a boolean rather than a Param. Live models a device's on/off
 * as a 0–1 `DeviceParameter`, but nothing about drawing a switch needs a range,
 * a taper or a unit — pushing it through the param model would buy a conversion
 * at every call site and no behavior at all.
 *
 * Lit is `data-on`, not `aria-pressed`. A momentary is a button rather than a
 * switch and has no pressed state to report, but it still lights while it's
 * held, so the two states part ways: one is what it means, the other is what
 * it looks like.
 */
export interface ToggleProps {
  on: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
  label?: string;
  name?: string;
  /** Springs back instead of staying down, like `live.button`. */
  momentary?: boolean;
  className?: string;
  title?: string;
  children?: ReactNode;
}

export function Toggle({
  on,
  onChange,
  disabled = false,
  label,
  name,
  momentary = false,
  className,
  title,
  children,
}: ToggleProps) {
  return (
    <div className={`wdg wdg-toggle${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="wdg-toggle-body"
        {...(on ? { 'data-on': '' } : {})}
        aria-pressed={momentary ? undefined : on}
        aria-label={label ?? name}
        disabled={disabled}
        title={title}
        onPointerDown={momentary ? () => onChange(true) : undefined}
        onPointerUp={momentary ? () => onChange(false) : undefined}
        onPointerLeave={momentary && on ? () => onChange(false) : undefined}
        onClick={momentary ? undefined : () => onChange(!on)}
      >
        {children}
      </button>
      {name && <span className="wdg-caption">{name}</span>}
    </div>
  );
}
