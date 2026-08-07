import { useMemo, useState } from 'react';
import './RolesManager.css';
import { hex } from '../../../core/src/color.js';
import { findRoleProblems, MAX_ROLE_LEN, roleKey, type Role } from '../../../core/src/roles.js';
import { useCloseOnEscape } from '../hooks/useCloseOnEscape.js';
import { SwatchGrid } from './SwatchGrid.js';

interface Props {
  vocabulary: Role[];
  palette: number[];
  /** Roles actually tagged on a scene right now, by `roleKey`. */
  inUse: ReadonlySet<string>;
  busy: boolean;
  onSave: (roles: Role[]) => void;
  onClose: () => void;
}

/**
 * The vocabulary editor.
 *
 * Edits a draft and commits on Save, rather than writing per keystroke: every
 * save updates the device parameter stored in the Live Set, and a half-typed
 * role name is not something to persist.
 *
 * Owned by `App` rather than by whatever opened it — the rail's Manage roles
 * button and the grid's role menu both reach it, and the rail can be shut while
 * the modal is up.
 */
export function RolesManager({ vocabulary, palette, inUse, busy, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Role[]>(() => vocabulary.map((r) => ({ ...r })));
  /** Row whose color is being picked, or null when the palette is closed. */
  const [picking, setPicking] = useState<number | null>(null);

  useCloseOnEscape(onClose);

  const problems = useMemo(() => findRoleProblems(draft), [draft]);

  const edit = (i: number, patch: Partial<Role>) =>
    setDraft((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="viewport-overlay modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Roles</div>
        <div className="hint">
          A role is stored at the front of the scene name as{' '}
          <span className="preview">[ROLE]</span>, so it travels with the set. Its color
          is what <b>Color clips</b> writes.
        </div>

        <div className="role-rows">
          {draft.map((r, i) => {
            const used = inUse.has(roleKey(r.name));
            return (
              <div key={i} className={`role-row${problems.has(i) ? ' bad' : ''}`}>
                <button
                  type="button"
                  className={`sw role-sw${r.colorIndex < 0 ? ' empty' : ''}`}
                  style={
                    r.colorIndex >= 0 && palette[r.colorIndex] !== undefined
                      ? { background: hex(palette[r.colorIndex]!) }
                      : undefined
                  }
                  title={r.colorIndex < 0 ? 'No color — click to pick' : 'Change color'}
                  onClick={() => setPicking(picking === i ? null : i)}
                />
                <input
                  type="text"
                  value={r.name}
                  maxLength={MAX_ROLE_LEN}
                  spellCheck={false}
                  placeholder="role name"
                  onChange={(e) => edit(i, { name: e.target.value })}
                />
                <span className={`used${used ? '' : ' off'}`} title="Tagged on a scene in this set">
                  {used ? 'in set' : ''}
                </span>
                <button
                  type="button"
                  className="x"
                  title={
                    used
                      ? 'Forget this role and its color. Scenes keep their tag, so it ' +
                        'will reappear here without a color.'
                      : 'Remove this role'
                  }
                  onClick={() => {
                    setPicking(null);
                    setDraft((prev) => prev.filter((_, j) => j !== i));
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {picking !== null && (
          <>
            <div className="lbl">Color for {draft[picking]?.name || 'this role'}</div>
            {palette.length === 0 ? (
              <div className="hint">Built-in palette unavailable — rebuild the app.</div>
            ) : (
              <SwatchGrid
                palette={palette}
                current={draft[picking]?.colorIndex ?? null}
                onPick={(ci) => {
                  edit(picking, { colorIndex: ci });
                  setPicking(null);
                }}
              />
            )}
          </>
        )}

        <div className="modal-actions">
          <button
            type="button"
            onClick={() => {
              setDraft((prev) => [...prev, { name: '', colorIndex: -1 }]);
              setPicking(null);
            }}
          >
            Add role
          </button>
          <div className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || problems.size > 0}
            title={
              problems.size > 0
                ? 'Fix the highlighted names first — blank, duplicate or illegal'
                : undefined
            }
            onClick={() => onSave(draft.map((r) => ({ ...r, name: r.name.trim() })))}
          >
            Save
          </button>
        </div>
        <div className="hint">
          Deleting a role only forgets its color. Scenes keep their tag, so a role
          that is still in the set comes back here uncolored.
        </div>
      </div>
    </div>
  );
}
