/**
 * What the window is holding, kept across a reload.
 *
 * The one thing a person doing this work does constantly is refresh — after a
 * separation, after a rebuild, after changing a model — and losing the open
 * track, the transport and the whole mix every time turns a two-second reload
 * into a minute of clicking. So the window remembers.
 *
 * `localStorage`, keyed on the app's own origin, which is real because
 * `desktop/src/serve.ts` gives the app a scheme rather than `file://` — an
 * opaque origin that promises nothing. That is what makes this work at all.
 *
 * **The library is not in here, and neither are the stems.** Those live on disk
 * and are read back every time: a second copy of the truth held in a browser
 * store is the copy that goes stale. What is here is only what the *window*
 * knows and the disk does not — which track is open, where the head is, and how
 * the faders are set.
 *
 * The mix and the slices are stored per track and are therefore **on this
 * machine, not in the library**. Carrying the folder to another laptop carries
 * the audio and the stems, not the balance. That is a real limitation rather
 * than an oversight: putting it in the manifest is where it goes when it should
 * travel, and that is a decision about the manifest rather than about this.
 */

import type { Marker } from './warp.ts';

const KEY = 'mixflow.window.v1';

/** Everything remembered about one track. */
export interface Remembered {
  levels?: Record<string, { volume: number; muted: boolean; soloed: boolean }>;
  slices?: { bar: number; name: string }[];
  /** Seconds. Where the head was, so a reload lands back in the same eight bars. */
  at?: number;
  bpm?: number;
  bpmAuto?: boolean;
  /** Seconds to the downbeat of bar 1. The other half of a grid. */
  offset?: number;
  /**
   * Where the audio is pinned to the grid, once something has pinned it — a
   * fit, or a hand. Absent, the grid is the straight line `bpm` and `offset`
   * make, and the track is still owed a fit.
   */
  markers?: readonly Marker[];
}

export interface Session {
  selected?: string | null;
  model?: string;
  query?: string;
  snap?: string;
  loop?: boolean;
  /** Whether the stems play stretched to the header tempo, or as they were recorded. */
  warp?: boolean;
  tracks?: Record<string, Remembered>;
}

/**
 * Read it, and take nothing on trust.
 *
 * Every failure is the same answer — an empty session — because this is a
 * convenience and the alternative to reading it is doing without it. A store
 * from an older build, a store somebody edited, a browser with storage disabled:
 * none of those is worth an error in front of a person, and all of them are
 * worth not crashing over.
 */
export function recall(): Session {
  try {
    const held = localStorage.getItem(KEY);
    if (!held) return {};
    const parsed = JSON.parse(held) as Session;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Write it, swallowing the failure.
 *
 * Storage can be full, or off. Neither is a reason to interrupt somebody
 * mixing, and neither costs them anything except the thing this file is for.
 */
export function remember(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private window, quota, storage disabled. The session simply is not kept.
  }
}

/** One track's slice of the session, merged in without disturbing the others. */
export const forTrack = (session: Session, id: string): Remembered => session.tracks?.[id] ?? {};

export const withTrack = (session: Session, id: string, held: Remembered): Session => ({
  ...session,
  tracks: { ...session.tracks, [id]: { ...forTrack(session, id), ...held } },
});
