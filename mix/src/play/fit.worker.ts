import { FIRST_CHOICE, run } from '../algorithms.ts';
import type { Beats } from '../warp.ts';
import type { Fit } from '../tempo.ts';
import type { Follow } from '../follow.ts';

/**
 * The beat finding, off the window's thread.
 *
 * It is about two seconds of solid arithmetic on a four-minute track, and the
 * window it would run on is the one holding four decks and a running mix. The
 * algorithm is untouched — `algorithms.ts` reads only numbers, which is why
 * the harness can run it under Node — so this is a doorway and nothing else.
 *
 * The samples arrive already summed to mono, because that is the first thing
 * the shipping algorithm does with them and one channel is half as much to
 * hand over.
 */
export interface Asked { mono: Float32Array; rate: number; length: number }
export interface Found { found: (Fit | Follow) | null; beats: Beats | null }

self.onmessage = (event: MessageEvent<Asked>) => {
  const { mono, rate, length } = event.data;
  try {
    const got = run(FIRST_CHOICE, [mono], rate, {});
    const found: Found = got?.fit ? { found: got.follow ?? got.fit, beats: got.beats } : { found: null, beats: null };
    // The map is measured against the samples handed over, which are the
    // decoded ones; `length` is what the caller will index it by.
    if (found.beats && found.beats.length !== length) found.beats = { ...found.beats, length };
    (self as unknown as Worker).postMessage(found);
  } catch {
    (self as unknown as Worker).postMessage({ found: null, beats: null } satisfies Found);
  }
};
