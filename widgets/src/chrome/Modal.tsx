import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import './chrome.css';

/**
 * The one thing you are doing, over everything you were doing.
 *
 * A device asks for a value; a modal asks a *question* — write this, delete
 * that, are you sure — and it is the editor's vocabulary rather than the
 * device's, which is the same boundary `Button` sits on. Every app in the suite
 * had hand-rolled the same fixed scrim, the same escape key and the same
 * `z-index` guess, and each one got a different corner of it right.
 *
 * ## It is a `<dialog>`
 *
 * Not a positioned `<div>`, and the difference is most of what a hand-rolled
 * modal gets wrong. The element brings the top layer — so it is above every
 * stacking context on the page without a token to bid against — plus the focus
 * trap, the return of focus to whatever opened it, the escape key, `aria-modal`
 * and inertness for everything behind. All of that is the browser's, and none
 * of it is worth reimplementing in React.
 *
 * The scrim is `::backdrop` for the same reason: it cannot be clicked past,
 * cannot be scrolled past, and does not exist in the layout.
 *
 * ## Open by being mounted
 *
 * There is no `open` prop. A modal that is closed renders nothing anyone can
 * see, so a caller holding one mounted-but-shut is holding state the DOM was
 * already keeping. Mount it when the question is being asked, unmount it when
 * it has been answered — `{asking && <Modal …/>}` — and `onClose` is the one
 * way it asks to go away, whether that came from escape, the scrim or a button
 * in `actions`.
 *
 * ## The × is always there, and `actions` is not
 *
 * Escape and the scrim close it, and neither is visible. A sheet whose only
 * ways out are two invisible ones is one a person can be stuck in, so the ×
 * is part of the title bar rather than something a caller opts into.
 *
 * That leaves `actions` for what a modal is *for* — Delete, Export, Replace —
 * rather than for a Cancel that says the same thing as the ×. A modal with one
 * action can put it wherever the sheet reads best and pass no `actions` at all,
 * and the row simply does not render.
 */
export interface ModalProps {
  /** Printed along the top, and the dialog's accessible name. */
  title: string;
  /** Escape, the scrim, or an action asking to be let out. */
  onClose(): void;
  /** In px. Wide enough for a paragraph and a short list by default. */
  width?: number;
  /** The buttons along the bottom. The one that does the thing goes first. */
  actions?: ReactNode;
  /** For assistive technology, where the printed title is not the whole story. */
  label?: string;
  children?: ReactNode;
  className?: string;
}

export function Modal({
  title,
  onClose,
  width,
  actions,
  label,
  children,
  className,
}: ModalProps) {
  const box = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = box.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={box}
      className={`wdg wdg-modal${className ? ` ${className}` : ''}`}
      aria-label={label ?? title}
      style={(width === undefined ? {} : { '--wdg-modal-width': `${width}px` }) as CSSProperties}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === box.current) onClose();
      }}
    >
      <div className="wdg-modal-box">
        <div className="wdg-modal-head">
          <p className="wdg-modal-title">{title}</p>
          <button
            type="button"
            className="wdg-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
              <path d="M1 1l7 7M8 1l-7 7" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </button>
        </div>
        <div className="wdg-modal-body">{children}</div>
        {actions && <div className="wdg-modal-actions">{actions}</div>}
      </div>
    </dialog>
  );
}
