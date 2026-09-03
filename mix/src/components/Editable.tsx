import { useDraft } from './draft.ts';

/**
 * Type in something that does not look like a box until you go near it.
 *
 * For the facts that are *already on the screen for another reason* — the track
 * name on the header is there to say what is open, and being able to fix it is
 * a second job the same pixels do. Drawing it as a form field would mean the
 * bar carried an input for as long as a song was open, which is a bar that
 * looks like it is asking a question it is not.
 *
 * So the box appears on hover and the focus ring on focus, and nothing moves
 * when either happens: the border is there the whole time in the text colour of
 * the background. That is the same bargain `Button`'s quiet tone makes on a
 * canvas, for the same reason — furniture that only draws itself when you are
 * about to use it.
 *
 * **It is exactly as wide as what it says.** An input is a fixed-width box by
 * default, and two of them on a header would leave a gap after a short title
 * and clip a long one. The value is rendered a second time, hidden, in the same
 * grid cell: the text sets the width and the input fills it. Capped by the
 * space the header has, so a long title still ellipsises rather than shoving
 * the transport off the end.
 */
export function QuietField({
  value,
  onCommit,
  label,
  placeholder,
  className,
  title,
  required,
}: {
  value: string;
  onCommit(next: string): void;
  /** For assistive technology: there is no visible label beside it. */
  label: string;
  placeholder?: string;
  className?: string;
  title?: string;
  /** Cleared and left blank, it puts the old value back rather than writing one. */
  required?: boolean;
}) {
  const props = useDraft(value, onCommit, required);

  return (
    <span className={`mf-quiet${className ? ` ${className}` : ''}`}>
      <span className="mf-quiet-size" aria-hidden="true">
        {String(props.value) || placeholder || ''}
      </span>
      <input {...props} aria-label={label} placeholder={placeholder} title={title} />
    </span>
  );
}
