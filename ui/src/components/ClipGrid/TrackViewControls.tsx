import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COLUMN_WIDTHS, type ColumnWidth } from '../../lib/columnWidth.js';
import { useAnchoredPosition, type Anchor } from '../../hooks/useAnchoredPosition.js';
import { useDismissOnScroll } from '../../hooks/useDismissOnScroll.js';
import { useMenuKeyboard } from '../../hooks/useMenuKeyboard.js';
import { IconMeter, IconSends } from '../Icon.js';
import './TrackViewControls.css';

/* Two forms, because the trigger and the menu have different room. The trigger
   is whatever is left of a 108px column after two square buttons — about 66px,
   which `16 tracks` does not fit. The menu is free to be as wide as its
   longest item, so that is where the unit gets said in full. */
const triggerText = (width: ColumnWidth): string => {
  if (width === 'm') return 'Narrow';
  if (width === 'l') return 'Wide';
  if (width === 'auto') return 'Auto';
  return `${width} trk`;
};

const optionText = (width: ColumnWidth): string => {
  if (width === 'm') return 'Narrow';
  if (width === 'l') return 'Wide';
  if (width === 'auto') return 'Auto';
  return `${width} tracks`;
};

const widthLabel = (width: ColumnWidth): string => {
  if (width === 'm') return 'Narrow track columns';
  if (width === 'l') return 'Wide track columns';
  if (width === 'auto') return 'Auto-fit all track columns';
  if (width === '8') return 'Fit 8 track columns';
  if (width === '16') return 'Fit 16 track columns';
  return `${width} track columns`;
};

const widthTitle = (width: ColumnWidth): string | undefined => {
  if (width === 'auto') return 'Fit all visible track columns to the grid width';
  if (width === '8') return 'Preview one 8-track clip-launcher bank';
  if (width === '16') return 'Preview two 8-track clip-launcher banks';
  return undefined;
};

/**
 * The column-width picker's menu.
 *
 * A `<select>` would be less code, and its popup is drawn by the OS — in Safari
 * that is a full-width sheet in the app's own footer, which is the one place a
 * control this small should not open something that large. So it's the same
 * anchored menu the role chip opens, down to the hooks: positioned against the
 * viewport (and flipped above the trigger, which is what always happens down
 * here), dismissed by a scroll that would move the trigger out from under it,
 * and driven by ↑↓/Enter/Esc.
 *
 * Portalled to the body rather than rendered in place. Its cell is a sticky one
 * with a `z-index`, which makes it a stacking context — a fixed child of it
 * would be trapped in the grid's paint order rather than floating over it.
 */
function WidthMenu({
  anchor,
  value,
  onPick,
  onClose,
}: {
  anchor: Anchor;
  value: ColumnWidth;
  onPick: (width: ColumnWidth) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPosition(anchor, ref);
  useDismissOnScroll(onClose);
  const [cursor, setCursor] = useMenuKeyboard({
    itemCount: COLUMN_WIDTHS.length,
    initialCursor: COLUMN_WIDTHS.indexOf(value),
    onEnter: (c) => {
      if (c >= 0) onPick(COLUMN_WIDTHS[c]!);
    },
    onClose,
  });

  return createPortal(
    /* A full-screen backdrop rather than a document click listener, for the
       reason the role menu has one: it catches the click that dismisses the
       menu before the grid underneath can act on it, so closing this can't
       also select a scene or fire a clip. */
    <div className="viewport-overlay" onClick={onClose} onContextMenu={onClose}>
      <div
        ref={ref}
        className="tvc-menu"
        role="menu"
        aria-label="Track column display mode"
        style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {COLUMN_WIDTHS.map((w, i) => (
          <button
            key={w}
            type="button"
            role="menuitemradio"
            aria-checked={w === value}
            className={
              `tvc-option${w === value ? ' on' : ''}` + `${cursor === i ? ' cursor' : ''}`
            }
            title={widthTitle(w) ?? widthLabel(w)}
            onMouseEnter={() => setCursor(i)}
            onClick={() => onPick(w)}
          >
            {optionText(w)}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

interface Props {
  columnWidth: ColumnWidth;
  onColumnWidth: (w: ColumnWidth) => void;
  /** Both watches cost Live something, so neither arms before the LOM is up. */
  lomReady: boolean;
  showMeters: boolean;
  onToggleMeters: () => void;
  showSends: boolean;
  onToggleSends: () => void;
}

/**
 * How the track columns are drawn: how wide they are, and which of the two
 * footer rows below this one are showing.
 *
 * It sits in the stop row's metadata cell rather than in the header bar,
 * because everything it controls is down here. The column that holds it is the
 * app's own — no Live output — so the cell was empty, and a control for the
 * footer belongs beside the footer rather than a screen away from it.
 *
 * **Its own elements and its own stylesheet, not the shared `Control` set.**
 * Those are built for a 22px toolbar with rounded groups and a filled surface,
 * and this is a 20px strip that has to read as part of the stop row it sits in
 * — square, edge to edge, transparent, with the same `--caption` ink the stop
 * buttons beside it use. Every rule that got it there was an override at a
 * specificity picked to beat `Control.css`, which is a stylesheet you have to
 * read two files to understand. This one says what it is.
 *
 * The icon buttons carry an `aria-label` as well as a `title`, for the reason
 * every icon button in the header does: an icon-only control with no
 * accessible name exists for sighted mouse users and nobody else.
 */
export function TrackViewControls({
  columnWidth,
  onColumnWidth,
  lomReady,
  showMeters,
  onToggleMeters,
  showSends,
  onToggleSends,
}: Props) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const pick = useCallback(
    (w: ColumnWidth) => {
      onColumnWidth(w);
      setAnchor(null);
    },
    [onColumnWidth],
  );

  return (
    <div className="track-view-controls" role="group" aria-label="Track view">
      <button
        type="button"
        className="tvc-width"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        aria-label="Track column display mode"
        title={widthTitle(columnWidth) ?? widthLabel(columnWidth)}
        onClick={(e) => {
          if (anchor !== null) {
            setAnchor(null);
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ left: r.left, top: r.top, bottom: r.bottom });
        }}
      >
        <span className="tvc-width-value">{triggerText(columnWidth)}</span>
        <span className="tvc-caret" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="tvc-toggle"
        aria-pressed={showMeters}
        aria-label="Mixer"
        title={`${showMeters ? 'Hide' : 'Show'} track mixer and output meters`}
        disabled={!lomReady && !showMeters}
        onClick={onToggleMeters}
      >
        <IconMeter />
      </button>
      <button
        type="button"
        className="tvc-toggle"
        aria-pressed={showSends}
        aria-label="Sends"
        title={`${showSends ? 'Hide' : 'Show'} track sends`}
        disabled={!lomReady && !showSends}
        onClick={onToggleSends}
      >
        <IconSends />
      </button>
      {anchor !== null && (
        <WidthMenu anchor={anchor} value={columnWidth} onPick={pick} onClose={close} />
      )}
    </div>
  );
}
