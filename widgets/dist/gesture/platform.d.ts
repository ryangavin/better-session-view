/**
 * The fine-adjustment modifier, which is Live's: ⌘ on macOS, Ctrl elsewhere.
 *
 * The app has its own copy of this test in `set/src/lib/keys.ts`, where it means
 * "make Live do something". The duplication is deliberate — this module can't
 * import from `set/`, and a widget library that needed a host to tell it which
 * key means fine would be a widget library with a host.
 */
/** Label for the modifier, for hints and tooltips. */
export declare const FINE_KEY: string;
export declare function isFine(e: {
    metaKey: boolean;
    ctrlKey: boolean;
}): boolean;
