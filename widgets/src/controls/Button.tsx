import { ButtonFace } from './ButtonFace.tsx';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { hintAttribute } from './hint.ts';
import './controls.css';

/**
 * A thing you press that is not a parameter.
 *
 * Every other control in here reports a *value* — a knob, a switch, an enum —
 * and the host writes it somewhere. A button reports that it happened, and
 * nothing is left behind. That sounds like a small distinction and it is the
 * reason this could not be `Toggle` with `momentary`: a momentary toggle is a
 * parameter that springs back, so it has an on state, an `aria-pressed`, and a
 * caller that has to hold a boolean it does not want.
 *
 * M4L has no such object, which is why the catalogue never listed one — the
 * `live.*` palette is the set for *building a device*, and a device is made of
 * parameters. Delete, close, add and cut are the vocabulary of an *editor*,
 * which is what a graph canvas is, and every one of them had been hand-rolled
 * at the call site before this existed.
 *
 * ## Tone, not variant
 *
 * Three, and they are about how loudly the button asks to be noticed rather
 * than about what it does:
 *
 * | tone | for |
 * |---|---|
 * | `normal` | an ordinary action — the bordered box every other control shares |
 * | `quiet` | furniture: the × beside a port, the delete on a node's title bar. No box until you are on it, because a canvas covered in boxes reads as a form |
 * | `danger` | one that destroys something. Ordinary until hover, then it says so |
 *
 * Deliberately not a `primary` tone. Which action on a screen is the important
 * one is the screen's business, and a library that decided it would be wrong
 * roughly half the time.
 */
export interface ButtonProps {
  /**
   * It happened. No value, because a press is not a value; the event is
   * there for the modifiers held while it did, which are part of the press.
   */
  onPress(event: MouseEvent<HTMLButtonElement>): void;
  disabled?: boolean;
  /** For assistive technology. Defaults to the caption, then to the children. */
  label?: string;
  /** Printed caption above, for a button that sits in a `Row` beside controls. */
  name?: string;
  tone?: 'normal' | 'quiet' | 'danger';
  /**
   * In px. The children are the caller's and can be any length, so like
   * `Toggle` this cannot reserve its own space from a `Param`.
   */
  width?: number;
  className?: string;
  title?: string;
  /**
   * A sentence for the window's hint strip, on the root as `data-hint`.
   *
   * Left out, the strip falls back to `title`. See [`hint.ts`](./hint.ts).
   */
  hint?: string;
  children?: ReactNode;
}

export function Button({
  onPress,
  disabled = false,
  label,
  name,
  tone = 'normal',
  width,
  className,
  title,
  hint,
  children,
}: ButtonProps) {
  return (
    <div
      className={`wdg wdg-button${className ? ` ${className}` : ''}`}
      {...hintAttribute(hint)}
      style={
        (width === undefined ? {} : { '--wdg-button-width': `${width}px` }) as CSSProperties
      }
    >
      {name && <span className="wdg-caption">{name}</span>}
      <ButtonFace
        type="button"
        tone={tone}
        aria-label={label ?? name}
        disabled={disabled}
        title={title}
        onClick={onPress}
      >
        {children}
      </ButtonFace>
    </div>
  );
}
