import { useEffect, useMemo, useState } from 'react';
import { hex } from '../../../core/src/color.js';
import {
  isValidRoleName,
  MAX_ROLE_LEN,
  roleKey,
  type Role,
} from '../../../core/src/roles.js';
import { isBpm, isKey, type TitlePatch } from '../../../core/src/sceneTitle.js';

interface Props {
  /** Configured roles plus any tagged in the set — see mergeVocabulary. */
  vocabulary: Role[];
  palette: number[];
  /** Roles actually tagged on a scene right now, by `roleKey`. */
  inUse: ReadonlySet<string>;
  /** How many scenes the scene-name column has selected. */
  sceneCount: number;
  /**
   * What the selected scenes agree on, per field; `null` where they differ.
   * The title fields prefill from this.
   */
  common: { song: string | null; bpm: string | null; key: string | null };
  /**
   * Which title fields have been edited.
   *
   * A field that's absent here is left alone on every scene; a field present
   * and empty clears that part. The distinction can't come from the value
   * alone — blank means "these scenes disagree, don't flatten them" on arrival
   * and "delete this part" once you've deleted it — so it's tracked, in `App`,
   * and reset whenever the selection changes.
   */
  patch: TitlePatch;
  onPatch: (patch: TitlePatch) => void;
  /** Scenes the pending title edit would actually rename. */
  titleCount: number;
  /** The first selected scene's name after the pending edit. */
  titlePreview: string | null;
  onRenameScenes: () => void;
  /** Scenes whose own tempo the bpm field would change. */
  tempoCount: number;
  onSetTempo: () => void;
  /** Palette slot the selected scenes already share, or -1 when they don't. */
  sceneColorIndex: number;
  onSceneColor: (index: number) => void;
  /** The role all selected scenes share, or null when they have none. */
  currentRole: string | null;
  /** True when the selection spans more than one role. */
  mixed: boolean;
  /** Clips "Color clips" would actually write — already filtered to changes. */
  clipCount: number;
  /** Scenes "Paint scenes" would actually write. */
  paintCount: number;
  busy: boolean;
  onAssign: (role: string | null) => void;
  onColorClips: () => void;
  onPaintScenes: () => void;
  onSaveRoles: (roles: Role[]) => void;
}

/**
 * Everything that acts on the scenes picked in the scene-name column: the
 * title — `@{bpm}-{key} {SONG}` — and the role tag that leads it.
 *
 * The two commit differently, on purpose. **Assigning a role writes on click,
 * the way a swatch does**, which only looks like it breaks the Inspector's rule
 * that naming needs an explicit commit: that rule exists because a rename
 * *overwrites* a name you can no longer see, and a role tag is additive — it
 * goes on the front, the rest of the name is untouched, and it shows as a chip
 * the moment it lands. There is nothing to preview. **A title edit does
 * overwrite**, so it keeps its preview and a button.
 */
export function ScenePanel({
  vocabulary,
  palette,
  inUse,
  sceneCount,
  common,
  patch,
  onPatch,
  titleCount,
  titlePreview,
  onRenameScenes,
  tempoCount,
  onSetTempo,
  sceneColorIndex,
  onSceneColor,
  currentRole,
  mixed,
  clipCount,
  paintCount,
  busy,
  onAssign,
  onColorClips,
  onPaintScenes,
  onSaveRoles,
}: Props) {
  const [managing, setManaging] = useState(false);
  const none = sceneCount === 0;
  const currentKey = currentRole === null ? null : roleKey(currentRole);

  const shown = (f: keyof TitlePatch) => patch[f] ?? common[f] ?? '';
  const badBpm = shown('bpm').trim() !== '' && !isBpm(shown('bpm'));
  const badKey = shown('key').trim() !== '' && !isKey(shown('key'));

  const field = (
    key: keyof TitlePatch,
    label: string,
    placeholder: string,
    bad = false,
  ) => (
    <label className={`field${bad ? ' bad' : ''}`}>
      <span>{label}</span>
      <input
        type="text"
        value={shown(key)}
        placeholder={common[key] === null && sceneCount > 1 ? 'mixed' : placeholder}
        disabled={none || busy}
        spellCheck={false}
        onChange={(e) => onPatch({ ...patch, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <>
      <div className="lbl">
        Scene{' '}
        {none ? (
          <span className="dim">— click a scene name</span>
        ) : (
          `${sceneCount} selected`
        )}
      </div>

      {field('song', 'song', 'Nightfall')}
      <div className="field-row">
        {field('bpm', 'bpm', '128', badBpm)}
        {field('key', 'key', 'Bm', badKey)}
      </div>
      <div className="hint">
        {badBpm || badKey ? (
          <span className="bad">
            {badBpm ? 'bpm is 2–3 digits' : ''}
            {badBpm && badKey ? ' · ' : ''}
            {badKey ? 'key is like Bm, F#m, Eb' : ''}
          </span>
        ) : none ? (
          'Shift-click a second scene name to take a whole song.'
        ) : (
          'A field you leave alone stays as it is on each scene. Clear one to remove that part.'
        )}
      </div>
      {titlePreview !== null && (
        <div className="hint">
          Preview <span className="preview">{titlePreview || '(empty)'}</span>
        </div>
      )}
      {/* Not `primary`, unlike the role color below it: this one overwrites
          names, and the loud button in the rail should be the reversible,
          instantly-legible action rather than the destructive one. */}
      <button
        type="button"
        disabled={titleCount === 0 || busy || badBpm || badKey}
        onClick={onRenameScenes}
      >
        Rename {titleCount} scene{titleCount === 1 ? '' : 's'}
      </button>

      {/* Separate from the rename on purpose. Everything else in this panel
          changes what a scene is *called*; this changes what the set *does* —
          Live uses a scene's own tempo the moment that scene fires. Folding it
          into Rename would make a naming pass quietly alter playback. */}
      <button
        type="button"
        disabled={tempoCount === 0 || busy || badBpm}
        title={
          shown('bpm').trim() === ''
            ? 'Clears the scene tempo, so these scenes follow the song again'
            : `Sets Scene.tempo — firing these scenes will change the song tempo`
        }
        onClick={onSetTempo}
      >
        {shown('bpm').trim() === '' ? 'Clear tempo on' : 'Set tempo on'} {tempoCount}{' '}
        scene{tempoCount === 1 ? '' : 's'}
      </button>

      <div className="lbl">Scene color</div>
      {palette.length === 0 ? (
        <div className="hint">No palette yet — the next snapshot derives it.</div>
      ) : (
        <>
          <div className="swatches">
            {palette.map((rgb, i) => (
              <button
                key={i}
                type="button"
                className={`sw${sceneColorIndex === i ? ' on' : ''}`}
                style={{ background: hex(rgb) }}
                title={`index ${i} — paint ${sceneCount} scene${sceneCount === 1 ? '' : 's'}`}
                disabled={none || busy}
                onClick={() => onSceneColor(i)}
              />
            ))}
          </div>
          <div className="hint">
            {none
              ? 'One color for a whole song makes it a band you can see in Live.'
              : 'Paints the scene rows themselves. Writes on click.'}
          </div>
        </>
      )}

      <div className="rule" />

      <div className="lbl">Role</div>

      {vocabulary.length === 0 ? (
        <div className="hint">
          No roles yet — <b>Manage roles</b> to add intro, verse, chorus…
        </div>
      ) : (
        <div className="chips">
          {vocabulary.map((r) => {
            const on = !mixed && currentKey === roleKey(r.name);
            const swatch = r.colorIndex >= 0 ? palette[r.colorIndex] : undefined;
            return (
              <button
                key={roleKey(r.name)}
                type="button"
                className={`chip${on ? ' on' : ''}`}
                disabled={none || busy}
                title={
                  swatch === undefined
                    ? `${r.name} — no color yet`
                    : `${r.name} — clips color to index ${r.colorIndex}`
                }
                onClick={() => onAssign(on ? null : r.name)}
              >
                <span
                  className={`dot${swatch === undefined ? ' empty' : ''}`}
                  style={swatch === undefined ? undefined : { background: hex(swatch) }}
                />
                {r.name}
              </button>
            );
          })}
          <button
            type="button"
            className={`chip clear${!mixed && currentRole === null && !none ? ' on' : ''}`}
            disabled={none || busy || (currentRole === null && !mixed)}
            title="Take the role tag off these scenes"
            onClick={() => onAssign(null)}
          >
            none
          </button>
        </div>
      )}

      <div className="hint">
        {none
          ? 'Roles are stored in the scene name as [role], so they travel with the set.'
          : mixed
            ? 'These scenes have different roles — pick one to set them all.'
            : 'Clicking a role writes it into the scene name straight away.'}
      </div>

      <button
        type="button"
        className="primary"
        disabled={clipCount === 0 || busy}
        title="Color every clip in the selected scenes with its own scene's role color"
        onClick={onColorClips}
      >
        Color {clipCount} clip{clipCount === 1 ? '' : 's'}
      </button>
      <button
        type="button"
        disabled={paintCount === 0 || busy}
        title="Paint the scene rows themselves with their role color"
        onClick={onPaintScenes}
      >
        Paint {paintCount} scene{paintCount === 1 ? '' : 's'}
      </button>
      <button type="button" disabled={busy} onClick={() => setManaging(true)}>
        Manage roles
      </button>

      {managing && (
        <RolesManager
          vocabulary={vocabulary}
          palette={palette}
          inUse={inUse}
          busy={busy}
          onSave={(next) => {
            onSaveRoles(next);
            setManaging(false);
          }}
          onClose={() => setManaging(false)}
        />
      )}
    </>
  );
}

interface ManagerProps {
  vocabulary: Role[];
  palette: number[];
  inUse: ReadonlySet<string>;
  busy: boolean;
  onSave: (roles: Role[]) => void;
  onClose: () => void;
}

/**
 * The vocabulary editor.
 *
 * Edits a draft and commits on Save, rather than writing per keystroke: every
 * save is a round trip to the bridge and a file write, and a half-typed role
 * name is not something to persist.
 */
function RolesManager({
  vocabulary,
  palette,
  inUse,
  busy,
  onSave,
  onClose,
}: ManagerProps) {
  const [draft, setDraft] = useState<Role[]>(() => vocabulary.map((r) => ({ ...r })));
  /** Row whose color is being picked, or null when the palette is closed. */
  const [picking, setPicking] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // or Esc also stops every clip in Live
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const problems = useMemo(() => {
    const bad = new Set<number>();
    const seen = new Map<string, number>();
    draft.forEach((r, i) => {
      if (!isValidRoleName(r.name)) {
        bad.add(i);
        return;
      }
      const k = roleKey(r.name);
      const first = seen.get(k);
      if (first === undefined) seen.set(k, i);
      else bad.add(i); // a duplicate splits one role's color in two
    });
    return bad;
  }, [draft]);

  const edit = (i: number, patch: Partial<Role>) =>
    setDraft((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="modal-back" onClick={onClose}>
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
              <div className="hint">No palette yet — take a snapshot first.</div>
            ) : (
              <div className="swatches wide">
                {palette.map((rgb, ci) => (
                  <button
                    key={ci}
                    type="button"
                    className={`sw${draft[picking]?.colorIndex === ci ? ' on' : ''}`}
                    style={{ background: hex(rgb) }}
                    title={`index ${ci}`}
                    onClick={() => {
                      edit(picking, { colorIndex: ci });
                      setPicking(null);
                    }}
                  />
                ))}
              </div>
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
