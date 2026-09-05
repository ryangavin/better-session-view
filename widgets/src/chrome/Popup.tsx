import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import './popup.css';

/**
 * A floating panel hung off a control, in the browser's top layer.
 *
 * It is the half of a menu a stylesheet cannot reach. A panel opened from a
 * node on a canvas has to escape a `transform`, an `overflow: hidden` and every
 * stacking context between it and the page; opened from inside a
 * [`Modal`](Modal.tsx) it has to paint above a `<dialog>`, which no `z-index`
 * can do. `popover` promotes it out of all of that, for the same reason `Modal`
 * is a `<dialog>` — the browser owns that layer, so nothing here has to bid for
 * one. It stays a DOM child of the control while it floats, so the caller's
 * tokens still reach it and the tab order still runs trigger → panel.
 *
 * **`manual` rather than `auto`.** Light dismiss would close on the pointerdown
 * heading for the trigger, and the click behind it would open the panel again —
 * the toggle that reads as a menu refusing to open. Dismissal is ours instead,
 * and it is the three events a menu has always answered: a pointer elsewhere, a
 * wheel elsewhere, escape. Which one it was reaches the caller, because only
 * escape has somewhere obvious to put focus back.
 *
 * Anything the panel has to be — how wide, what border, whether the rows
 * scroll — is the caller's `className`. What it is *told* is where it may go:
 * `--wdg-popup-anchor` is the trigger's width, for a menu that wants to be at
 * least as wide as its field, and `--wdg-popup-room` is the height left on the
 * side it landed on.
 */
export type Dismissal = 'pointer' | 'wheel' | 'escape' | 'stale';

/**
 * A box the panel hangs from, in viewport coordinates, measured when it opened.
 *
 * The second-best anchor, and sometimes the only one there is: a chip in a
 * scrolling grid may be unmounted by the time the panel it opened is drawn, so
 * there is no element left to measure. What can be measured is followed; a
 * remembered box cannot be, so anything that would move it out from under the
 * panel dismisses instead of chasing it.
 */
export interface PopupBox {
  left: number;
  top: number;
  bottom: number;
  /** Only for a panel that wants to be at least as wide as what it hangs from. */
  width?: number;
}

export type PopupAnchor = RefObject<HTMLElement | null> | PopupBox;

/** Whether this anchor can be asked again where it is. */
const isLive = (anchor: PopupAnchor): anchor is RefObject<HTMLElement | null> =>
  'current' in anchor;

export interface PopupProps {
  /**
   * What it hangs from: a live control, re-measured on every placement, or a
   * [box](#PopupBox) that was measured once when the panel opened.
   */
  anchor: PopupAnchor;
  /** Mounted is open, so this is the one way it asks to go away. */
  onDismiss(how: Dismissal): void;
  /**
   * A shield the caller has put under the panel, which counts as part of it.
   *
   * For a panel over something that acts on a press — a grid that fires a clip
   * on click — where the shield is what catches that press. Dismissal there
   * belongs to the shield, on the click, rather than to this on the pointerdown:
   * closing first would unmount the shield and let the click through to the very
   * thing it was put there to cover.
   */
  within?: RefObject<HTMLElement | null>;
  role?: string;
  /** The panel's accessible name. */
  label?: string;
  id?: string;
  className?: string;
  children?: ReactNode;
}

/** Room left between the panel and the edge of the window. */
const MARGIN = 4;

/** The shortest panel worth flipping for, so a cramped edge doesn't win. */
const LEAST_ROOM = 64;

export function Popup({ anchor, onDismiss, within, role, label, id, className, children }: PopupProps) {
  const box = useRef<HTMLDivElement>(null);

  /**
   * Under the trigger, or over it when that is where the room is. Both are
   * measured every time rather than remembered: the trigger may be on a canvas
   * that has panned, zoomed or scrolled since this last opened.
   */
  const place = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const from = isLive(anchor) ? anchor.current : anchor;
    if (!from) return;
    const at = 'getBoundingClientRect' in from ? from.getBoundingClientRect() : from;
    el.style.setProperty('--wdg-popup-anchor', `${at.width ?? 0}px`);
    const under = window.innerHeight - at.bottom - MARGIN;
    const over = at.top - MARGIN;
    const above = under < Math.min(el.scrollHeight, over);
    el.style.setProperty('--wdg-popup-room', `${Math.max(LEAST_ROOM, above ? over : under)}px`);
    const size = el.getBoundingClientRect();
    el.style.left = `${Math.max(MARGIN, Math.min(at.left, window.innerWidth - size.width - MARGIN))}px`;
    el.style.top = `${above ? Math.max(MARGIN, at.top - size.height) : at.bottom}px`;
  }, [anchor]);

  useLayoutEffect(() => {
    // A popover has no size until it is shown, so there is nothing to measure
    // before this — show, then place.
    try {
      box.current?.showPopover?.();
    } catch {
      // Already open, or a DOM with no top layer. Neither is worth a throw.
    }
    place();
  }, [place]);

  useEffect(() => {
    const el = box.current;
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (box.current?.contains(target) === true ||
        within?.current?.contains(target) === true ||
        (isLive(anchor) && anchor.current?.contains(target) === true));
    const elsewhere = (how: Dismissal) => (e: Event) => {
      if (!inside(e.target)) onDismiss(how);
    };
    const pointer = elsewhere('pointer');
    const wheel = elsewhere('wheel');
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Stopped as well as defaulted: the host under an open panel is usually
      // listening for escape to mean something of its own.
      e.preventDefault();
      e.stopPropagation();
      onDismiss('escape');
    };
    // Native, and on the panel itself. The canvas under it zooms on a wheel
    // through a listener of its own, which a React handler cannot stop.
    const keep = (e: WheelEvent) => e.stopPropagation();
    el?.addEventListener('wheel', keep);
    document.addEventListener('pointerdown', pointer, true);
    window.addEventListener('wheel', wheel, true);
    window.addEventListener('keydown', escape, true);
    // A live anchor is followed; a remembered box is given up on, because the
    // thing it was a box of has moved and this would be pointing at the wrong
    // row. Capture, because a scroll inside an inner box does not bubble.
    const shifted = isLive(anchor) ? place : () => onDismiss('stale');
    window.addEventListener('resize', shifted);
    document.addEventListener('scroll', shifted, true);
    return () => {
      el?.removeEventListener('wheel', keep);
      document.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('wheel', wheel, true);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', shifted);
      document.removeEventListener('scroll', shifted, true);
    };
  }, [anchor, onDismiss, place, within]);

  return (
    <div
      ref={box}
      id={id}
      className={`wdg-popup${className ? ` ${className}` : ''}`}
      popover="manual"
      role={role}
      aria-label={label}
    >
      {children}
    </div>
  );
}
