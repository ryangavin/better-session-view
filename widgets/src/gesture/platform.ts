/**
 * The fine-adjustment modifier, which is Live's: ⌘ on macOS, Ctrl elsewhere.
 *
 * The app has its own copy of this test in `set/src/lib/keys.ts`, where it means
 * "make Live do something". The duplication is deliberate — this module can't
 * import from `set/`, and a widget library that needed a host to tell it which
 * key means fine would be a widget library with a host.
 */

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|ad|od)/.test(
    navigator.userAgent + ' ' + ((navigator as { platform?: string }).platform ?? ''),
  );

/** Label for the modifier, for hints and tooltips. */
export const FINE_KEY = IS_MAC ? '⌘' : 'Ctrl';

export function isFine(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return IS_MAC ? e.metaKey : e.ctrlKey;
}
