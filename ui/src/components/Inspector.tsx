import { hex } from '../../../core/src/color.js';
import { TOKENS, unknownTokens } from '../../../core/src/pattern.js';

interface Props {
  palette: number[];
  /** Last color written, for the swatch highlight only. */
  chosenIndex: number | null;
  onColor: (index: number) => void;
  pattern: string;
  onPattern: (s: string) => void;
  selectedCount: number;
  /** Clips the pattern would actually change — excludes ones already named that. */
  renameCount: number;
  preview: string | null;
  busy: boolean;
  progress: { done: number; total: number } | null;
  undoDepth: number;
  onRename: () => void;
  onUndo: () => void;
  onClear: () => void;
  onExtractPalette: () => void;
}

export function Inspector({
  palette,
  chosenIndex,
  onColor,
  pattern,
  onPattern,
  selectedCount,
  renameCount,
  preview,
  busy,
  progress,
  undoDepth,
  onRename,
  onUndo,
  onClear,
  onExtractPalette,
}: Props) {
  const bad = unknownTokens(pattern);
  const none = selectedCount === 0;

  return (
    <aside>
      {/* Color first: it's the one that writes on click, and the common case. */}
      <div className="lbl">
        Color {none ? <span className="dim">— select clips</span> : `${selectedCount} clips`}
      </div>
      {palette.length === 0 ? (
        <div className="hint">No palette yet — the next snapshot derives it.</div>
      ) : (
        <>
          <div className="swatches">
            {palette.map((rgb, i) => (
              <button
                key={i}
                type="button"
                className={`sw${chosenIndex === i ? ' on' : ''}`}
                style={{ background: hex(rgb) }}
                title={`index ${i} — ${hex(rgb)}${none ? '' : ` — apply to ${selectedCount} clips`}`}
                disabled={none || busy}
                onClick={() => onColor(i)}
              />
            ))}
          </div>
          <div className="hint">
            {none
              ? 'Click a scene name to select its clips.'
              : 'Clicking a swatch writes it straight away.'}
          </div>
        </>
      )}

      <div className="lbl">Rename selected</div>
      <input
        type="text"
        value={pattern}
        placeholder="{track} {scene}"
        onChange={(e) => onPattern(e.target.value)}
        spellCheck={false}
      />
      <div className="hint">
        {bad.length > 0 ? (
          <span className="bad">
            unknown token{bad.length > 1 ? 's' : ''}: {bad.join(', ')}
          </span>
        ) : (
          <>Tokens: {TOKENS.map((t) => `{${t}}`).join(' ')}</>
        )}
      </div>
      {preview !== null && (
        <div className="hint">
          Preview <span className="preview">{preview || '(empty)'}</span>
        </div>
      )}
      <button
        type="button"
        className="primary"
        onClick={onRename}
        disabled={renameCount === 0 || busy}
      >
        {progress ? `${progress.done} / ${progress.total}` : `Rename ${renameCount}`}
      </button>

      <div className="spacer" />

      <button type="button" onClick={onUndo} disabled={undoDepth === 0 || busy}>
        Undo last write
      </button>
      <button type="button" onClick={onClear} disabled={none}>
        Clear selection
      </button>
      <button
        type="button"
        onClick={onExtractPalette}
        disabled={busy}
        title="Normally automatic on the first snapshot. Appends and removes one scratch track."
      >
        Re-derive palette
      </button>
    </aside>
  );
}
