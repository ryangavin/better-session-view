/**
 * What the preload put on the window, declared for the renderer.
 *
 * These shapes are `mix/electron/`'s, restated rather than imported: the
 * renderer is a separate compilation with no `node:` types in it, and reaching
 * into `electron/` from here would drag them in. Two files that must agree, and
 * `npm run typecheck` covers both.
 */

/**
 * Whether this build can separate, and whether it has the engine yet.
 *
 * Two booleans rather than one, because *not built yet* is not a failure — it
 * is every machine's first run, and the window says what pressing Generate will
 * do rather than showing something broken. `mix/electron/runtime.ts` has what
 * gets built and where.
 */
export interface Ready {
  ok: boolean;
  built: boolean;
  says: string;
  /** The directory the engine lives in, for the tooltip that says where. */
  where: string;
}

/** A model this build will run. The main process owns the list; this is its shape. */
export interface Model {
  id: string;
  label: string;
  engine: string;
  checkpoint: string;
  sources: string[];
  realtime: number;
  load: number;
  speed: string;
  blurb: string;
  needs: string[];
}

/** What a separation in flight looks like from here. */
export interface Progress {
  done: number;
  stage: string;
  sources: string[];
  /** Null where the model produces every source in one pass, which is most of them. */
  perStem: Record<string, number> | null;
  written: string[];
  seconds: number | null;
}

export interface Finished {
  ok: true;
  trackId: string;
  model: string;
  sources: string[];
  stems: string;
  /** Everything the run measured — the residual most of all. */
  sidecar: {
    residual: number;
    seconds: number;
    wall: number;
    samplerate: number;
    channels: number;
    device: string;
    stems: { source: string; file: string; rms: number }[];
  };
  /** The work was skipped: an identical separation was already on disk. */
  reused: boolean;
}

export interface Failed {
  ok: false;
  trackId: string;
  says: string;
  cancelled: boolean;
}

export type Outcome = Finished | Failed;

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
  /** `stems/<id>/<model>`, relative to the root, or null until one exists. */
  stems: string | null;
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
    base(): Promise<string>;
  };
  separate: {
    models(): Promise<Model[]>;
    busy(): Promise<string | null>;
    run(ask: { trackId: string; file: string; model: string }): Promise<Outcome>;
    cancel(trackId?: string): Promise<void>;
    onProgress(hear: (at: { trackId: string; progress: Progress }) => void): () => void;
    onFinished(hear: (outcome: Outcome) => void): () => void;
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

/**
 * How long a separation will take, in seconds, or null when the length is not known.
 *
 * The same two terms `mix/electron/job.ts` uses, restated here for the same
 * reason the types are: this side is a separate compilation. A fixed cost for
 * starting Python and reading the checkpoints, then a rate — because a
 * twenty-second clip is mostly the first and a ten-minute track is mostly the
 * second, and one multiplier covering both is wrong at one end.
 */
export const estimate = (model: Model | null, seconds: number | null): number | null =>
  model && seconds !== null ? Math.round(model.load + seconds / model.realtime) : null;

/** `about 2 min`, or `about 40 sec`. Rounded, because it is an estimate. */
export const roughly = (seconds: number | null): string | null => {
  if (seconds === null) return null;
  if (seconds < 90) return `about ${Math.max(10, Math.round(seconds / 10) * 10)} sec`;
  return `about ${Math.round(seconds / 60)} min`;
};
