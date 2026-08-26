import { useLayoutEffect, useState, type RefObject } from 'react';

/** Where a popover hangs from — the anchor's own box, in viewport coordinates. */
export interface Anchor {
  left: number;
  top: number;
  bottom: number;
}

const GAP = 4;
const EDGE = 8;

/**
 * Position a popover against the viewport.
 *
 * Placed after measuring rather than from the anchor alone: near the bottom of
 * the window the popover has to flip above the anchor, and near the right edge
 * it has to slide left. useLayoutEffect so the correction lands before the
 * browser paints.
 */
export function useAnchoredPosition<T extends HTMLElement>(
  anchor: Anchor,
  ref: RefObject<T | null>,
): { left: number; top: number } {
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + GAP });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - width - EDGE));
    const below = anchor.bottom + GAP;
    const top =
      below + height > window.innerHeight - EDGE
        ? Math.max(EDGE, anchor.top - GAP - height)
        : below;
    setPos({ left, top });
  }, [anchor, ref]);
  return pos;
}
