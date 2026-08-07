import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hex } from '../../../core/src/color.js';
import { useAnchoredPosition, type Anchor } from '../hooks/useAnchoredPosition.js';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js';
import { useDismissOnScroll } from '../hooks/useDismissOnScroll.js';
import { SwatchGrid } from './SwatchGrid.js';
import './ColorSelect.css';

interface Props {
  palette: number[];
  /** The palette slot shown in the closed control, or null/-1 when unknown. */
  current: number | null;
  onPick: (index: number) => void;
  /** Optional "No color" choice for draft values that have not been written yet. */
  onClear?: () => void;
  disabled?: boolean;
  /** Visible label, accessible name and the small heading over the open palette. */
  label: string;
  /** Another field supplies the visible label, as in the song-name row. */
  showLabel?: boolean;
  titleFor?: (index: number, rgb: number) => string;
}

interface PopoverProps extends Props {
  anchor: Anchor;
  onClose: () => void;
}

/** The floating half of ColorSelect, split out so its dismissal hooks only exist while open. */
function ColorPopover({
  palette,
  current,
  onPick,
  onClear,
  label,
  titleFor,
  anchor,
  onClose,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPosition(anchor, ref);

  useCloseOnEscape(onClose);
  useDismissOnScroll(onClose);

  return createPortal(
    <div className="viewport-overlay color-select-back" onClick={onClose}>
      <div
        ref={ref}
        className="color-select-popover"
        style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="color-select-heading">{label}</div>
        <SwatchGrid
          palette={palette}
          current={current}
          titleFor={titleFor}
          onPick={(index) => {
            onClose();
            onPick(index);
          }}
        />
        {onClear && (
          <button
            type="button"
            className="color-select-none"
            onClick={() => {
              onClose();
              onClear();
            }}
          >
            No color
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A compact, single-select color control.
 *
 * The full palette only appears while choosing. A swatch commits immediately
 * and closes the popover, preserving the write-on-click behavior of the old
 * always-open grid without making the rail carry all seventy colors at once.
 */
export function ColorSelect({
  palette,
  current,
  onPick,
  onClear,
  disabled,
  label,
  showLabel = true,
  titleFor,
}: Props) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const rgb = current !== null && current >= 0 ? palette[current] : undefined;

  const trigger = (
    <button
      type="button"
      className={`color-select${rgb === undefined ? ' empty' : ''}`}
      style={rgb === undefined ? undefined : { background: hex(rgb) }}
      disabled={disabled || palette.length === 0}
      aria-label={`Choose ${label.toLowerCase()}`}
      aria-haspopup="dialog"
      aria-expanded={anchor !== null}
      title={
        palette.length === 0
          ? 'Built-in palette unavailable'
          : rgb === undefined
            ? `Choose ${label.toLowerCase()}`
            : `Change ${label.toLowerCase()} — index ${current}`
      }
      onClick={(e) => {
        if (anchor !== null) {
          setAnchor(null);
          return;
        }
        const r = e.currentTarget.getBoundingClientRect();
        setAnchor({ left: r.left, top: r.top, bottom: r.bottom });
      }}
    />
  );

  return (
    <>
      {showLabel ? (
        <div className="color-select-row">
          <span className="lbl">{label}</span>
          {trigger}
        </div>
      ) : (
        trigger
      )}

      {anchor !== null && (
        <ColorPopover
          palette={palette}
          current={current}
          onPick={onPick}
          onClear={onClear}
          label={label}
          titleFor={titleFor}
          anchor={anchor}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}
