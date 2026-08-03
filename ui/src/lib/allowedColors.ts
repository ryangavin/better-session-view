// Which of Live's colors a rule is allowed to hand out.
//
// Live 12.4.3 reports 70, and a set list that uses eight of them deliberately
// reads better than one that uses all seventy: several of Live's colors are hard
// to tell apart at the size a scene row draws them, and a band you can't
// distinguish from the band above it isn't doing the job the color exists for.
//
// **`null` means "all of them", and that isn't the same as a list of every
// index.** A stored list is a choice, and a choice made against a 70-color
// palette shouldn't silently exclude colors 70+ if a later Live ships more. Not
// having chosen stays not having chosen.
//
// Machine-wide, like the palette cache and the column width: it's a preference
// about how you like to look at a set, not a fact about this set. The role
// vocabulary is the opposite and lives beside the .als for exactly that reason.

const KEY = 'bsv.allowedColors';

/** The chosen slots, or `null` for "whatever the palette holds". */
export function loadAllowedColors(): number[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // An empty list is kept as an empty list, not read as "all". The picker can
    // get you there — it's how you start from nothing and choose the few you
    // want — and coming back to a set of colors you didn't choose would be a
    // stranger answer than coming back to none.
    return parsed.filter((v): v is number => Number.isInteger(v) && (v as number) >= 0);
  } catch {
    return null;
  }
}

export function saveAllowedColors(colors: number[] | null): void {
  try {
    if (colors === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(colors));
  } catch {
    // Storage can be unavailable (private windows, embedded webviews). A choice
    // that doesn't persist is not worth failing a render over.
  }
}

/**
 * The slots a rule may use, resolved against the palette we actually have.
 *
 * Ascending, so `rainbow` walks Live's own picker order — its grid is row-major
 * and roughly a hue sweep, which is what makes the rule look like a rainbow
 * rather than like a shuffle.
 */
export function resolveAllowed(stored: number[] | null, paletteSize: number): number[] {
  if (stored === null) return Array.from({ length: paletteSize }, (_, i) => i);
  return [...new Set(stored)].filter((i) => i < paletteSize).sort((a, b) => a - b);
}
