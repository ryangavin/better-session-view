import { Widget, type WidgetProps } from './Widget.tsx';
import './controls.css';

/**
 * `live.meter~`: a level, read-only.
 *
 * The catalogue said this belonged here "when the second caller appears", and
 * it has. The first was a mixer strip; the second is a signal a look is being
 * driven by, which is the case that makes it a *widget* rather than a bar the
 * mixer draws. A hand-driven signal can be a slider — you set it, you can see
 * where you set it — but a *generated* one cannot: an envelope pulsing on the
 * beat has no handle to look at, and without a display you are guessing at what
 * the picture is reacting to.
 *
 * **It is not a disabled slider.** A slider that cannot be moved still says
 * "you could have moved this"; a meter never invited you. So there is no
 * gesture, no anchor, no write rate — and `role="meter"`, which is the one ARIA
 * role that means exactly this.
 *
 * `peak` is drawn as a line rather than a second fill, because the two numbers
 * answer different questions — where it is now, and how far it has been — and a
 * second translucent fill reads as one louder value rather than two facts.
 */
export interface MeterProps extends Omit<WidgetProps, 'disabled'> {
  /** 0–1. Clamped, because a meter that overshoots its own box is a bug you see. */
  value: number;
  /** 0–1. A hold, drawn as a line across the fill. */
  peak?: number;
  orientation?: 'horizontal' | 'vertical';
  /** Authoritative text to show when `showValue` is on. */
  display?: string;
  /** Preserve the old meter face by default; row faces opt into the reading. */
  showValue?: boolean;
  /** In px, across the bar. */
  width?: number;
  /** In px, along it. */
  length?: number;
}

const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function Meter({
  value,
  peak,
  orientation = 'horizontal',
  name,
  label,
  layout,
  display,
  showValue = false,
  width,
  length,
  className,
  title,
  ink,
}: MeterProps) {
  const level = clamp(value);
  const held = peak === undefined ? undefined : clamp(peak);
  return (
    <Widget
      kind="meter"
      name={name}
      readout={showValue ? (display ?? String(Math.round(level * 100))) : undefined}
      layout={layout}
      className={className}
      title={title}
      ink={ink}
      vars={{
        ...(width === undefined ? {} : { '--wdg-meter-width': `${width}px` }),
        ...(length === undefined ? {} : { '--wdg-meter-length': `${length}px` }),
        '--wdg-meter-fill': level,
        ...(held === undefined ? {} : { '--wdg-meter-peak': held }),
      }}
    >
      <div
        className={`wdg-meter-body wdg-body wdg-meter-${orientation}`}
        role="meter"
        aria-valuenow={Math.round(level * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? name}
      >
        <i className="wdg-meter-level" />
        {held !== undefined && <i className="wdg-meter-hold" />}
      </div>
    </Widget>
  );
}
