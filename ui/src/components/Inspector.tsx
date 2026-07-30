import { hex } from '../../../core/src/color.js';
import { TOKENS, unknownTokens } from '../../../core/src/pattern.js';

interface Props {
  palette: number[];
  chosenIndex: number | null;
  onChooseIndex: (i: number | null) => void;
  pattern: string;
  onPattern: (s: string) => void;
  selectedCount: number;
  preview: string | null;
  busy: boolean;
  progress: { done: number; total: number } | null;
  onApply: () => void;
  onClear: () => void;
  onExtractPalette: () => void;
}

export function Inspector({
  palette,
  chosenIndex,
  onChooseIndex,
  pattern,
  onPattern,
  selectedCount,
  preview,
  busy,
  progress,
  onApply,
  onClear,
  onExtractPalette,
}: Props) {
  const bad = unknownTokens(pattern);
  const canApply = selectedCount > 0 && (chosenIndex !== null || pattern.trim() !== '');

  return (
    <aside>
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
          <span className="bad">unknown token{bad.length > 1 ? 's' : ''}: {bad.join(', ')}</span>
        ) : (
          <>Tokens: {TOKENS.map((t) => `{${t}}`).join(' ')}</>
        )}
      </div>
      {preview !== null && (
        <div className="hint">
          Preview <span className="preview">{preview || '(empty)'}</span>
        </div>
      )}

      <div className="lbl">
        Color selected{' '}
        {palette.length > 0 && <span className="dim">({palette.length})</span>}
      </div>
      {palette.length === 0 ? (
        <div className="hint">No palette yet — the next snapshot derives it.</div>
      ) : (
        <div className="swatches">
          {palette.map((rgb, i) => (
            <button
              key={i}
              type="button"
              className={`sw${chosenIndex === i ? ' on' : ''}`}
              style={{ background: hex(rgb) }}
              title={`index ${i} — ${hex(rgb)}`}
              onClick={() => onChooseIndex(chosenIndex === i ? null : i)}
            />
          ))}
        </div>
      )}
      {chosenIndex !== null && (
        <div className="hint">
          Writing <span className="preview">color_index {chosenIndex}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onExtractPalette}
        disabled={busy}
        title="Normally automatic on the first snapshot. Appends and removes one scratch track."
      >
        Re-derive palette
      </button>
      <button type="button" className="primary" onClick={onApply} disabled={!canApply || busy}>
        {progress ? `${progress.done} / ${progress.total}` : `Apply to ${selectedCount}`}
      </button>
      <button type="button" onClick={onClear} disabled={selectedCount === 0}>
        Clear selection
      </button>
    </aside>
  );
}
