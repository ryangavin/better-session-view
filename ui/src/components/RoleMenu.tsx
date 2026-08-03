import { useRef } from 'react';
import { hex } from '../../../core/src/color.js';
import { roleKey, type Role } from '../../../core/src/roles.js';
import { useAnchoredPosition, type Anchor } from '../hooks/useAnchoredPosition.js';
import { useDismissOnScroll } from '../hooks/useDismissOnScroll.js';
import { useMenuKeyboard } from '../hooks/useMenuKeyboard.js';

interface Props {
  /** Configured roles plus any tagged in the set — see mergeVocabulary. */
  vocabulary: Role[];
  palette: number[];
  /** The chip's own box, in viewport coordinates. */
  anchor: Anchor;
  /** How many scenes a pick would write. Said out loud rather than assumed. */
  count: number;
  /** What those scenes already share, or null for none / a mixed selection. */
  current: string | null;
  mixed: boolean;
  busy: boolean;
  onPick: (role: string | null) => void;
  onManage: () => void;
  onClose: () => void;
}

/**
 * The role picker that hangs off a scene's role chip.
 *
 * The rail can do this already, and this exists anyway: tagging is a
 * scene-at-a-time pass down the grid, and routing it through the rail means
 * selecting the row, looking away, and coming back. Here the chip you are
 * reading is the chip you press.
 *
 * It writes on click, like the rail's chips and for the same reason — a role
 * tag is additive and shows as a chip the moment it lands, so there's nothing
 * to preview.
 */
export function RoleMenu({
  vocabulary,
  palette,
  anchor,
  count,
  current,
  mixed,
  busy,
  onPick,
  onManage,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const currentKey = current === null ? null : roleKey(current);

  // Roles, then "no role" last — the same order the rail's chips are in, so the
  // two aren't a different list depending on where you tag from. The last index
  // *is* "no role"; there's no separate item to keep in step.
  const last = vocabulary.length;
  const [cursor, setCursor] = useMenuKeyboard({
    itemCount: last + 1,
    initialCursor: mixed
      ? -1
      : current === null
        ? last
        : vocabulary.findIndex((r) => roleKey(r.name) === currentKey),
    onEnter: (c) => {
      if (c === last) onPick(null);
      else if (c >= 0) onPick(vocabulary[c]!.name);
    },
    onClose,
  });

  const pos = useAnchoredPosition(anchor, ref);
  // The menu is positioned against the viewport, so anything that moves the
  // chip out from under it closes it rather than leaving it pointing at the
  // wrong row.
  useDismissOnScroll(onClose);

  return (
    <div className="menu-back" onClick={onClose} onContextMenu={onClose}>
      <div
        ref={ref}
        className="menu"
        style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="menu-h">
          Role · {count} scene{count === 1 ? '' : 's'}
        </div>

        {vocabulary.length === 0 ? (
          <div className="hint">
            No roles yet — <b>Manage roles</b> to add intro, verse, chorus…
          </div>
        ) : (
          <div className="menu-items">
            {vocabulary.map((r, i) => {
              const on = !mixed && currentKey === roleKey(r.name);
              const swatch = r.colorIndex >= 0 ? palette[r.colorIndex] : undefined;
              return (
                <button
                  key={roleKey(r.name)}
                  type="button"
                  className={`menu-item${on ? ' on' : ''}${cursor === i ? ' cursor' : ''}`}
                  disabled={busy}
                  title={
                    swatch === undefined
                      ? `${r.name} — no color yet`
                      : `${r.name} — clips color to index ${r.colorIndex}`
                  }
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => onPick(r.name)}
                >
                  <span
                    className={`dot${swatch === undefined ? ' empty' : ''}`}
                    style={swatch === undefined ? undefined : { background: hex(swatch) }}
                  />
                  <span className="menu-label">{r.name}</span>
                  {on && <span className="menu-tick">✓</span>}
                </button>
              );
            })}
            <button
              type="button"
              className={
                `menu-item clear${!mixed && current === null ? ' on' : ''}` +
                `${cursor === last ? ' cursor' : ''}`
              }
              disabled={busy}
              title="Take the role tag off"
              onMouseEnter={() => setCursor(last)}
              onClick={() => onPick(null)}
            >
              <span className="dot empty" />
              <span className="menu-label">no role</span>
            </button>
          </div>
        )}

        {mixed && <div className="hint">These scenes have different roles.</div>}

        <div className="menu-rule" />
        <button type="button" className="menu-manage" onClick={onManage}>
          Manage roles…
        </button>
      </div>
    </div>
  );
}
