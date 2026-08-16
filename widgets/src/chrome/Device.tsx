import type { KeyboardEvent, ReactNode } from 'react';
import './chrome.css';

/**
 * The shell Live draws around every faceplate, and the first thing in a chain
 * that isn't a control.
 *
 * None of this is a `live.*` object — the M4L palette is the set for building a
 * device, and has nothing for the device itself. It comes off the LOM instead:
 * `Device.name`, `Device.is_active`, and `Device.View.is_collapsed` are the
 * whole of what a shell shows, which is why this takes three states and not a
 * device object. Presets are the exception and stay a callback, because
 * swapping one means opening a browser this module knows nothing about.
 *
 * Folded, it becomes a strip with its name on end — the reason a long chain
 * stays readable, and the one part of Live's chrome that has no analogue in a
 * control.
 */
export interface DeviceProps {
  /** `Device.name`. Clipped rather than wrapped, like every other reading. */
  name: string;
  /** `Device.is_active`. A deactivated device dims; its controls still work. */
  on?: boolean;
  onToggle?(next: boolean): void;
  /** `Device.View.is_collapsed`. The triangle only appears if it can move. */
  folded?: boolean;
  onFold?(next: boolean): void;
  /** Which device the chain is pointing at. The chain owns this, not the device. */
  selected?: boolean;
  onSelect?(): void;
  /** The hot-swap button, shown only when the host has somewhere to send it. */
  onHotSwap?(): void;
  /** The faceplate. */
  children?: ReactNode;
  className?: string;
  title?: string;
}

export function Device({
  name,
  on = true,
  onToggle,
  folded = false,
  onFold,
  selected = false,
  onSelect,
  onHotSwap,
  children,
  className,
  title,
}: DeviceProps) {
  const select = onSelect
    ? {
        tabIndex: 0,
        onPointerDown: () => onSelect(),
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          onSelect();
        },
      }
    : {};

  return (
    <div
      className={`wdg wdg-device${className ? ` ${className}` : ''}`}
      {...(on ? { 'data-on': '' } : {})}
      {...(folded ? { 'data-folded': '' } : {})}
      {...(selected ? { 'data-selected': '' } : {})}
      title={title}
    >
      <div className="wdg-device-head" {...select}>
        {onFold && (
          <button
            type="button"
            className="wdg-device-fold"
            aria-expanded={!folded}
            aria-label={`Fold ${name}`}
            onClick={() => onFold(!folded)}
          >
            <svg viewBox="0 0 8 8" aria-hidden="true">
              <path d="M1.5 2.75H6.5L4 6.25Z" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="wdg-device-power"
          {...(on ? { 'data-on': '' } : {})}
          aria-pressed={on}
          aria-label={`${name} active`}
          onClick={() => onToggle?.(!on)}
        />
        <span className="wdg-device-name">{name}</span>
        {onHotSwap && (
          <button
            type="button"
            className="wdg-device-swap"
            aria-label={`Swap ${name} preset`}
            onClick={onHotSwap}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1.5 3.5H7.5M5.75 1.75 7.5 3.5 5.75 5.25" />
              <path d="M8.5 6.5H2.5M4.25 4.75 2.5 6.5 4.25 8.25" />
            </svg>
          </button>
        )}
      </div>
      {!folded && <div className="wdg-device-body">{children}</div>}
    </div>
  );
}
