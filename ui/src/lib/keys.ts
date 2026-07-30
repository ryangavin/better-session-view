// The modifier that means "make Live do something".
//
// One rule for the whole app: unmodified input is organization — selecting,
// collapsing, moving the active cell — and never makes a sound. Add the
// modifier and Live responds. That's what keeps a grid full of clips safe to
// click around in while you're labelling it.
//
// ⌘ on macOS, Ctrl elsewhere, and never both: Ctrl-click on macOS is the
// system context-menu gesture, so accepting it there would fire a clip every
// time someone reached for a right-click.

const IS_MAC = /Mac|iP(hone|ad|od)/.test(
  navigator.userAgent + ' ' + ((navigator as { platform?: string }).platform ?? ''),
);

/** Label for the modifier, for hints and tooltips. */
export const LAUNCH_KEY = IS_MAC ? '⌘' : 'Ctrl';

interface Modifiers {
  metaKey: boolean;
  ctrlKey: boolean;
}

export function isLaunchModified(e: Modifiers): boolean {
  return IS_MAC ? e.metaKey : e.ctrlKey;
}

/**
 * Add to the selection rather than replacing it. ⌥ rather than the usual ⌘,
 * because ⌘ is spoken for above — launching is the scarcer, more valuable
 * gesture on this grid.
 */
export function isAddModified(e: { altKey: boolean }): boolean {
  return e.altKey;
}

/**
 * True when a keystroke belongs to whatever the user is typing into, so global
 * shortcuts leave it alone. Space and the arrow keys are both a shortcut here
 * and ordinary text editing there.
 */
export function isTypingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}
