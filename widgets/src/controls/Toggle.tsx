import { ButtonFace } from './ButtonFace.tsx';
import type { CSSProperties, ReactNode } from 'react';
import { hintAttribute } from './hint.ts';
import type { WidgetLayout } from './Widget.tsx';
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
  /**
   * In px. The label is the caller's and can be any length, so unlike the
   * controls that read a `Param` this one can't reserve its own space — a
   * switch that says On and Off changes width as it's pressed unless the box
   * is settled in advance. Wide enough for four characters by default.
   */
  width?: number;
  /**
   * `inside` puts the switch on a line with everything else on it: the name at
   * the left of the field and the state at the right, exactly where a
   * [`Slider`](./Slider.tsx) row puts its caption and its reading.
   *
   * Stacked, a switch is a caption over a lit pill, which is right in a panel
   * of them and wrong on a row — it makes that one row taller than its
   * neighbours and centres a control the rest of them start at the left. Lit,
   * it also stops filling: on a line of quiet rows a whole bar going amber says
   * far more than a switch being on is worth, so the state moves into the
   * reading and the reading is what lights.
   */
  layout?: Extract<WidgetLayout, 'stacked' | 'inside'>;
  className?: string;
  title?: string;
  /**
   * A sentence for the window's hint strip, on the root as `data-hint`.
   *
   * Left out, the strip falls back to `title`. See [`hint.ts`](./hint.ts).
   */
  hint?: string;
  /** The colour it lights in. See `WidgetProps.ink`. */
  ink?: string;
  children?: ReactNode;
}

export function Toggle({
  on,
  onChange,
  disabled = false,
  label,
  name,
  momentary = false,
  width,
  layout = 'stacked',
  className,
  title,
  hint,
  ink,
  children,
}: ToggleProps) {
  const inside = layout === 'inside';
  const face = (
    <ButtonFace
      type="button"
      lit={on}
      aria-pressed={momentary ? undefined : on}
      aria-label={label ?? name}
      disabled={disabled}
      title={title}
      onPointerDown={momentary ? () => onChange(true) : undefined}
      onPointerUp={momentary ? () => onChange(false) : undefined}
      onPointerLeave={momentary && on ? () => onChange(false) : undefined}
      onClick={momentary ? undefined : () => onChange(!on)}
    >
      {inside ? null : children}
    </ButtonFace>
  );

  return (
    <div
      className={
        `wdg${inside ? ' wdg-widget' : ''} wdg-toggle${className ? ` ${className}` : ''}`
      }
      {...hintAttribute(hint)}
      {...(inside ? { 'data-layout': 'inside' } : {})}
      {...(inside && on ? { 'data-on': '' } : {})}
      {...(inside && disabled ? { 'data-disabled': '' } : {})}
      style={
        {
          ...(width === undefined ? {} : { '--wdg-toggle-width': `${width}px` }),
          ...(ink === undefined ? {} : { '--wdg-fill': ink }),
        } as CSSProperties
      }
    >
      {name && <span className="wdg-caption">{name}</span>}
      {face}
      {inside && children !== undefined && <span className="wdg-readout">{children}</span>}
    </div>
  );
}
