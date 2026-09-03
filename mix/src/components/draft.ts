import { useEffect, useState, type InputHTMLAttributes } from 'react';

/**
 * A correction, rather than data entry.
 *
 * Everything editable in this app is already filled in — an import reads the
 * filename and then asks a catalogue — so every field is a person disagreeing
 * with a guess. That shapes the whole interaction: nothing is required, there
 * is no Save, and leaving the box is what writes it. A Save button on a field
 * whose wrong value breaks nothing is a button that exists to be forgotten.
 *
 * The draft is local and re-seeded whenever the value changes underneath it,
 * which happens when a catalogue match is taken while the field is on screen.
 * Without that, choosing a match would fill the manifest and leave the box
 * showing what it showed before.
 *
 * Escape puts it back rather than committing, because otherwise the only way
 * out of a half-typed correction is to remember what was there.
 *
 * `required` is for the facts that cannot be nothing. A track has to be called
 * something — an empty title is a library row you cannot find again — so
 * clearing that box and leaving puts the name back instead of writing the
 * blank. An artist can genuinely be unknown, so it cannot.
 */
export function useDraft(
  value: string,
  onCommit: (next: string) => void,
  required = false,
): InputHTMLAttributes<HTMLInputElement> {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return {
    value: draft,
    spellCheck: false,
    onChange: (event) => setDraft(event.currentTarget.value),
    onBlur: () => {
      if (required && draft.trim() === '') {
        setDraft(value);
        return;
      }
      if (draft !== value) onCommit(draft);
    },
    onKeyDown: (event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {
        setDraft(value);
        event.currentTarget.blur();
      }
    },
  };
}
