import type { CSSProperties, ReactNode, Ref } from 'react';
import type { Param } from '../param/param.ts';
import { useReserved } from './reserve.ts';
import './controls.css';

/**
 * The frame every control sits in, and the reason the panel needs no policing.
 *
 * A control on a faceplate is three regions — a caption, the control itself, a
 * reading — and until now each one built that column for itself. The convention
 * held because it was written down, which is the kind of thing that holds until
 * the sixth widget. `Widget` renders the regions, so no control names them and
 * none can put one in the wrong place: the alignment [`Row`](../chrome/Row.tsx)
 * depends on becomes structural rather than remembered.
 *
 * What a control still owns is its body — its own element, its own props, its
 * own geometry. This is a frame, not a base class.
 */

/** Caption above the control, beside it, or laid over a horizontal track. */
export type WidgetLayout = 'stacked' | 'inline' | 'inside';

/**
 * The custom properties a control sets on its own instance.
 *
 * Typed rather than cast: React's `CSSProperties` has no room for a custom
 * property, so every control that needed one used to end in `as CSSProperties`.
 * That cast now happens once, here.
 */
export type WidgetVars = Record<`--wdg-${string}`, string | number>;

/**
 * What every control takes, whatever it is. A control's own props extend this
 * and declare only what makes it that control.
 */
export interface WidgetProps {
  /** The printed caption. Controls that read a `Param` default to its short name. */
  name?: string;
  /**
   * For assistive technology. Defaults to the caption.
   *
   * The frame doesn't render it — it belongs on whatever element the control
   * makes interactive, which is the control's to decide.
   */
  label?: string;
  layout?: WidgetLayout;
  disabled?: boolean;
  className?: string;
  title?: string;
  /**
   * The colour the control fills in — its arc, its rail, its needle. Any CSS
   * colour, and usually a `var()`: a mixer's strip inked in its own stem's
   * colour, a rack's macro in the macro's. Left out, the fill is the accent
   * every control shares, which the catalogue's one-meaning-one-colour rule
   * wants until something on screen is *about* the colour.
   */
  ink?: string;
}

export interface WidgetSlots extends WidgetProps {
  /** Which control this is: the root gets `wdg-knob`, `wdg-slider`, and so on. */
  kind: string;
  /** Reserves room for this parameter's longest reading. */
  param?: Param;
  /**
   * The reading under the control. Left out, the region isn't drawn — which is
   * the value box and the switch, whose reading sits inside the control because
   * the control *is* the reading.
   */
  readout?: ReactNode;
  vars?: WidgetVars;
  /**
   * The root element, for a control that writes to it between renders.
   *
   * A row's wake and the warmth in its reading are drawn on a clock rather
   * than in a render — see [`wake.ts`](./wake.ts) — and both are custom
   * properties on this element, which the reading and the control's own body
   * both sit under. A control that re-rendered to move a mark two pixels
   * would be the render path a canvas of nodes exists to avoid.
   */
  ref?: Ref<HTMLDivElement>;
  /** The control itself: one element, carrying its own gesture and geometry. */
  children: ReactNode;
}

export function Widget({
  kind,
  param,
  name,
  readout,
  layout = 'stacked',
  disabled = false,
  vars,
  ref,
  className,
  title,
  ink,
  children,
}: WidgetSlots) {
  const reserved = useReserved(param);
  const inked = ink === undefined ? {} : { '--wdg-fill': ink, '--wdg-marker': ink };

  return (
    <div
      ref={ref}
      className={`wdg wdg-widget wdg-${kind}${className ? ` ${className}` : ''}`}
      data-layout={layout}
      {...(disabled ? { 'data-disabled': '' } : {})}
      style={{ ...reserved, ...inked, ...vars } as CSSProperties}
    >
      {name && <span className="wdg-caption">{name}</span>}
      <div className="wdg-body" title={title}>
        {children}
      </div>
      {readout !== undefined && <span className="wdg-readout">{readout}</span>}
    </div>
  );
}
