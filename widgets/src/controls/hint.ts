/**
 * What the thing under the pointer is, in a sentence.
 *
 * Ableton has a strip across the bottom of the window that explains whatever
 * you are pointing at, and it is how most people learn Live without opening a
 * manual. This is the lookup behind ours.
 *
 * ## Why it reads the DOM instead of React
 *
 * A hint changes on every pointer move. Carried in context or in a prop it
 * would be a value with a fresh identity several times a second, reaching
 * every memoized row that subscribes to it — the failure
 * [`set/docs/performance.md`](../../../set/docs/performance.md) is written
 * about. So the hint never enters the render path at all: a control writes it
 * to a plain attribute once, and one delegated listener reads it back off the
 * element the pointer happens to be over.
 *
 * ## Why `title` is the fallback
 *
 * Opting in has to cost nothing, and the apps here are already full of
 * carefully written `title` attributes. Treating a title as a hint means most
 * of a window explains itself the day the footer is mounted, with no edits at
 * all; `hint` is then for the places where the strip wants different or longer
 * words than a tooltip can carry.
 */

/** The attribute a control's `hint` prop lands on. */
export const HINT_ATTRIBUTE = 'data-hint';

/**
 * The hint for whatever the pointer or the focus ring is on, or `null`.
 *
 * **The nearest `data-hint` wins, and only if there is none does the nearest
 * `title`.** Not "the nearest element carrying either", which sounds equivalent
 * and is not: a control writes its hint on its root and its title on the body
 * inside it, so the closer of the two is always the title and an explicit hint
 * could never win.
 *
 * The cost of that rule is that a hinted container beats a merely-titled child
 * inside it. That is the right way round — a hint is deliberate and a title is
 * incidental — and the escape from it is to give the child a hint of its own.
 *
 * A blank value counts as absent, so `hint=""` falls through to the title
 * rather than blanking the strip.
 */
export function hintFor(from: EventTarget | null): string | null {
  if (!from || typeof (from as Element).closest !== 'function') return null;
  const at = from as Element;
  const hinted = at.closest(`[${HINT_ATTRIBUTE}]`)?.getAttribute(HINT_ATTRIBUTE)?.trim();
  if (hinted) return hinted;
  const titled = at.closest('[title]')?.getAttribute('title')?.trim();
  return titled ? titled : null;
}

/**
 * The attribute a control spreads onto its root.
 *
 * Absent rather than empty when there is no hint, so an unhinted control is
 * transparent to `closest()` and whatever encloses it can answer instead.
 */
export function hintAttribute(hint: string | undefined): Record<string, string> {
  return hint === undefined ? {} : { [HINT_ATTRIBUTE]: hint };
}
