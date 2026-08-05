import { hex } from '../../../core/src/color.js';
import './ScenePanel.css';
import { roleKey, type Role } from '../../../core/src/roles.js';
import { isBpm, isKey, type TitlePatch } from '../../../core/src/sceneTitle.js';
import { SwatchGrid } from './SwatchGrid.js';

interface Props {
  /** Configured roles plus any tagged in the set — see mergeVocabulary. */
  vocabulary: Role[];
  palette: number[];
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
  /**
   * Palette slot the songs in the selection already share, or -1 when they
   * don't — which includes a song that's only half painted.
   */
  songColorIndex: number;
  /** Scenes a swatch would write: every scene of every song in the selection. */
  songColorCount: number;
  /** Those songs in words — "NIGHTFALL", "3 songs" — for saying so first. */
  songColorLabel: string;
  onSongColor: (index: number) => void;
  /** The role all selected scenes share, or null when they have none. */
  currentRole: string | null;
  /** True when the selection spans more than one role. */
  mixed: boolean;
  /** Clips "Color clips" would actually write — already filtered to changes. */
  clipCount: number;
  busy: boolean;
  onAssign: (role: string | null) => void;
  onColorClips: () => void;
  /** Opens the vocabulary editor, which `App` owns — see RolesManager. */
  onManageRoles: () => void;
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
  sceneCount,
  common,
  patch,
  onPatch,
  titleCount,
  titlePreview,
  onRenameScenes,
  tempoCount,
  onSetTempo,
  songColorIndex,
  songColorCount,
  songColorLabel,
  onSongColor,
  currentRole,
  mixed,
  clipCount,
  busy,
  onAssign,
  onColorClips,
  onManageRoles,
}: Props) {
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

      <div className="lbl">Song color</div>
      {palette.length === 0 ? (
        <div className="hint">No palette yet — the next snapshot derives it.</div>
      ) : (
        <>
          <SwatchGrid
            palette={palette}
            current={songColorIndex}
            disabled={none || busy}
            titleFor={(i) =>
              none
                ? `index ${i}`
                : `index ${i} — paints all ${songColorCount} scene` +
                  `${songColorCount === 1 ? '' : 's'} of ${songColorLabel}`
            }
            onPick={onSongColor}
          />
          {/* Says the *song* scope out loud, every time. The selection is what
              you clicked; what gets painted is every scene those songs have,
              which can be a reprise sixty rows further down. */}
          <div className="hint">
            {none ? (
              'One color per song, so a set reads as bands in Live. Pick a song header.'
            ) : (
              <>
                Writes on click — all{' '}
                <b>
                  {songColorCount} scene{songColorCount === 1 ? '' : 's'}
                </b>{' '}
                of {songColorLabel}.
              </>
            )}
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
                  className={`color-dot${swatch === undefined ? ' empty' : ''}`}
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

      {/* A role colors clips and nothing else. Scene rows carry the song's
          color, and painting them per role would break the one song / one band
          rule the grid is navigated by. */}
      <button
        type="button"
        className="primary"
        disabled={clipCount === 0 || busy}
        title="Color every clip in the selected scenes with its own scene's role color"
        onClick={onColorClips}
      >
        Color {clipCount} clip{clipCount === 1 ? '' : 's'}
      </button>
      <button type="button" disabled={busy} onClick={onManageRoles}>
        Manage roles
      </button>
    </>
  );
}
