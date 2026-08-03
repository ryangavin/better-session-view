import type { ReactNode } from 'react';

interface Props {
  /** Close and deselect — see `closeRail` in App. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * The rail's chrome. It's closable because it's a workspace, not chrome: shut
 * it and the grid gets its 264px back. Clicking a clip, a scene or a song opens
 * it again, so there's no state to get stranded in — and closing drops the
 * selection, so there's none left behind either. See `closeRail` in App.
 */
export function Rail({ onClose, children }: Props) {
  return (
    <aside>
      <div className="rail-head">
        <span className="lbl">Edit</span>
        <button
          type="button"
          className="icon"
          title="Close and deselect — clicking a clip, a scene or a song reopens it"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </aside>
  );
}
