import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Popup, type Dismissal } from '../chrome/Popup.tsx';
import './controls.css';

/**
 * A compact enum: one member on screen, with the rest in a menu of our own.
 *
 * It was a native `<select>` for as long as the closed state was the part that
 * mattered — `appearance: none` and a drawn triangle make that half look like
 * every other field. The menu is the half a stylesheet cannot reach: it opens
 * as a system popup, in the system's colours, at the system's row height, over
 * a canvas it knows nothing about. On a page of forty nodes it was the one
 * surface that wasn't ours, and the only control whose open state nobody here
 * had ever chosen.
 *
 * So the menu is drawn here. Where it floats, how it flips and how it goes
 * away are [`Popup`](../chrome/Popup.tsx)'s — the top layer through `popover`,
 * and the three events a menu has always answered. What is left here is the
 * part that is a *select*: the rows, the highlight and the keyboard.
 *
 * Focus never leaves the trigger; the active row is named through
 * `aria-activedescendant`, which is ARIA's select-only combobox. That is the
 * pattern with no focus to restore — worth having where a host may unmount the
 * node the menu was opened from.
 *
 * Every key it handles is stopped as well as defaulted, for the reason
 * [the gesture](../gesture/useParamGesture.ts) stops its own: a focused control
 * owns its keystroke, and the surface underneath is usually listening for the
 * arrows to move something.
 */
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

/** How long a type-ahead keeps collecting before the next key starts a new word. */
const TYPING_WINDOW = 700;

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
  const at = Math.max(0, Math.min(items.length - 1, index));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(at);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const highlighted = useRef<HTMLDivElement | null>(null);
  const typed = useRef({ text: '', at: 0 });
  const id = useId();
  const optionId = (which: number) => `${id}-option-${which}`;

  const close = useCallback((restore = true) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }, []);

  const commit = useCallback(
    (next: number) => {
      close();
      // Only on a change, which is what the native element promised a host.
      if (next !== at && next >= 0 && next < items.length) onChange(next);
    },
    [at, close, items.length, onChange],
  );

  // On the open as well as on the move: a menu whose chosen member is fortieth
  // has to arrive already scrolled to it.
  useLayoutEffect(() => {
    highlighted.current?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // Only escape has somewhere obvious to put focus back: a pointer elsewhere
  // has already chosen where it is going.
  const dismiss = useCallback((how: Dismissal) => close(how === 'escape'), [close]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || items.length === 0) return;
    const last = items.length - 1;
    const from = open ? active : at;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    // Closed, a key that moves picks straight away — the way a focused field
    // in a rack does. Open, it moves the highlight and waits to be taken.
    const go = (to: number) => {
      stop();
      const next = Math.max(0, Math.min(last, to));
      if (open) setActive(next);
      else commit(next);
    };

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        return go(from + 1);
      case 'ArrowUp':
      case 'ArrowLeft':
        return go(from - 1);
      case 'Home':
        return go(0);
      case 'End':
        return go(last);
      case 'Enter':
      case ' ':
        stop();
        if (open) commit(active);
        else {
          setActive(at);
          setOpen(true);
        }
        return;
      case 'Tab':
        // Closes, but never swallowed: leaving is the host's to do.
        if (open) setOpen(false);
        return;
      default:
        break;
    }

    if (e.key.length !== 1 || e.altKey || e.ctrlKey || e.metaKey) return;
    const now = Date.now();
    const text = (now - typed.current.at > TYPING_WINDOW ? '' : typed.current.text) + e.key.toLowerCase();
    typed.current = { text, at: now };
    // One letter walks the members that start with it; a word searches for the
    // word. Which of the two you meant is read off the buffer rather than off
    // the clock: a buffer that is one letter over and over is a walk however
    // fast it arrived, and `ss` is never a word anybody was typing. Timing
    // alone got this wrong in exactly the case it most needed to be right —
    // press a letter three times quickly and the second press would search for
    // `ss`, match nothing, and leave the walk dead on its first step.
    const repeat = text.length > 1 && [...text].every((letter) => letter === text[0]);
    const needle = repeat ? (text[0] ?? '') : text;
    const start = needle.length === 1 ? from + 1 : 0;
    const order = items.map((_, i) => (start + i) % items.length);
    const found = order.find((i) => items[i]?.toLowerCase().startsWith(needle));
    if (found === undefined) return;
    stop();
    if (open) setActive(found);
    else commit(found);
  };

  const onOptionDown = (e: PointerEvent<HTMLDivElement>) => {
    // Focus stays on the trigger, and the canvas underneath does not take this
    // for the start of a drag on the node.
    e.preventDefault();
    e.stopPropagation();
  };

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
      <button
        ref={trigger}
        type="button"
        className="wdg-select-body wdg-body"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={label ?? name}
        disabled={disabled}
        title={title}
        onClick={() => {
          if (disabled) return;
          if (open) close();
          else {
            setActive(at);
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
      >
        <span className="wdg-select-label">{items[at] ?? ''}</span>
      </button>
      {open && (
        <Popup
          anchor={trigger}
          onDismiss={dismiss}
          id={`${id}-menu`}
          className="wdg-select-menu"
          role="listbox"
          label={label ?? name}
        >
          {items.map((item, which) => (
            <div
              key={`${item}-${which}`}
              ref={which === active ? highlighted : undefined}
              id={optionId(which)}
              className="wdg-select-option"
              role="option"
              aria-selected={which === at}
              {...(which === active ? { 'data-active': '' } : {})}
              {...(which === at ? { 'data-chosen': '' } : {})}
              onPointerDown={onOptionDown}
              onPointerEnter={() => setActive(which)}
              onClick={() => commit(which)}
            >
              <span className="wdg-select-label">{item}</span>
            </div>
          ))}
        </Popup>
      )}
    </div>
  );
}
