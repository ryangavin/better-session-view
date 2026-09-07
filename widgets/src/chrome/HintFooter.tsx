import { useEffect, useState } from 'react';
import { hintFor } from '../controls/hint.ts';
import './hint.css';

/**
 * A strip along the bottom of a window that says what you are pointing at.
 *
 * Mount it and it works: it listens to its own document rather than taking a
 * subtree, so nothing above it has to be rewired and nothing below it has to
 * be told this exists. What it shows comes from
 * [`hint.ts`](../controls/hint.ts) — a `hint` prop on any control, or the `title` the
 * control already had.
 *
 * ## Nothing else re-renders
 *
 * The hovered hint lives in this component's own state and is passed to
 * nobody. That is the whole design constraint: a pointer crossing a mixer
 * fires several times a second, and a value at that rate anywhere a memoized
 * row can see it re-renders the grid — see
 * [`set/docs/performance.md`](../../../set/docs/performance.md). One listener
 * on the document, one `useState` in one leaf, and the rest of the tree never
 * learns that a pointer moved.
 *
 * ## The pointer outranks the focus ring
 *
 * Both are kept, because tabbing through a window is the other way people
 * learn one and a strip that only answered the mouse would leave the keyboard
 * out. When they disagree the pointer wins — it is the deliberate act, and
 * focus is usually left behind wherever the last click put it.
 *
 * It is not an ARIA live region. A screen reader already reads a control's
 * name and its title on arrival, and announcing the same words a second time
 * for every element the pointer grazes would be noise rather than access.
 */
export interface HintFooterProps {
  /**
   * What it says when nothing under the pointer explains itself.
   *
   * Worth filling in. A strip that is blank at rest reads as an empty band
   * somebody forgot to remove, and the one line it can say is what tells a
   * newcomer the band is a thing to use.
   */
  resting?: string;
  className?: string;
}

export function HintFooter({ resting = '', className }: HintFooterProps) {
  const [pointed, setPointed] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    const over = (event: Event) => setPointed(hintFor(event.target));
    // Only when the pointer has left the window entirely. Moving between
    // elements already fires `pointerover` on the new one, which answers
    // `null` over anything unhinted and clears the strip that way.
    const out = (event: PointerEvent) => {
      if (!event.relatedTarget) setPointed(null);
    };
    const focus = (event: Event) => setFocused(hintFor(event.target));
    const blur = () => setFocused(null);

    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out as EventListener);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out as EventListener);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', blur);
    };
  }, []);

  const says = pointed ?? focused ?? resting;
  return (
    <footer
      className={`wdg-hint${className ? ` ${className}` : ''}`}
      {...(pointed ?? focused ? {} : { 'data-resting': '' })}
    >
      <span className="wdg-hint-text">{says}</span>
    </footer>
  );
}
