/**
 * What the preload put on the window, declared for the renderer.
 *
 * These shapes are `mix/electron/`'s, restated rather than imported: the
 * renderer is a separate compilation with no `node:` types in it, and reaching
 * into `electron/` from here would drag them in. Two files that must agree, and
 * `npm run typecheck` covers both.
 */

export interface Ready {
  ok: boolean;
  says: string;
  workspace: string;
}

/** One track in the library. Every path is relative to the library root. */
export interface Track {
  id: string;
  file: string;
  title: string;
  artist: string | null;
  /** Null until something detects it, and drawn as unknown rather than as zero. */
  bpm: number | null;
  key: string | null;
  seconds: number | null;
  added: string;
  model: string | null;
  sources: string[];
}

export interface Library {
  root: string | null;
  tracks: Track[];
  problem?: string;
}

export interface Imported extends Library {
  added: number;
  refused: string[];
}

interface Bridge {
  demucs(): Promise<Ready>;
  library: {
    read(): Promise<Library>;
    choose(): Promise<Library>;
    add(files?: string[]): Promise<Imported>;
    reveal(): Promise<void>;
  };
}

/**
 * Absent in a browser, which is where the renderer runs during a `vite` session
 * with no app around it. Every caller has to answer for that rather than assume
 * the window it got is the one that ships.
 */
export const openflow = (): Bridge | null =>
  (globalThis as { openflow?: Bridge }).openflow ?? null;

/** `3:07`, or a dash. A duration nobody has measured is not zero. */
export const duration = (seconds: number | null): string => {
  if (seconds === null) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
};

/**
 * The two facts a library row sorts by, or the file's own type when neither has
 * been worked out yet — which is every track on the day it is imported.
 */
export const facts = (track: Track): string => {
  if (track.bpm === null && track.key === null) {
    return track.file.slice(track.file.lastIndexOf('.') + 1);
  }
  return [track.key, track.bpm].filter((f) => f !== null).join(' · ');
};

/** The tempo to work in. Undetected means 120 and a grid bar that says so. */
export const workingBpm = (track: Track | null): number => track?.bpm ?? 120;
