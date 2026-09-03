/**
 * What the preload put on the window, declared for the renderer.
 *
 * These shapes are `mix/electron/`'s, restated rather than imported: the
 * renderer is a separate compilation with no `node:` types in it, and reaching
 * into `electron/` from here would drag them in. Two files that must agree, and
 * `npm run typecheck` covers both.
 */
import type { TranscribedNote } from './tab.ts';
import type { Beats } from './warp.ts';
import type { Fit } from './tempo.ts';
import type { Follow } from './follow.ts';

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

export interface TuningString { name: string; pitch: number }
export interface TranscribeProgress { done: number; stage: string; seconds: number | null }
export interface Transcribed {
  ok: true;
  trackId: string;
  model: string;
  where: string;
  midi: string;
  tab: string;
  sidecar: {
    transpose: number;
    notes: TranscribedNote[];
    noteCount: number;
    pitchedCount: number;
    mutedCount: number;
    voicedFraction: number;
    seconds: number;
  };
  tuning: readonly TuningString[];
  reused: boolean;
}
export type TranscribeOutcome = Transcribed | Failed;

/** One track in the library. Every path is relative to the library root. */
export interface Track {
  id: string;
  file: string;
  title: string;
  artist: string | null;
  album: string | null;
  /** `art/<id>.jpg`, relative to the root, or null. Served over the app's own scheme. */
  art: string | null;
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

/** The fields a person may correct. Nothing about the disk is in here. */
export interface Edits {
  title?: string;
  artist?: string | null;
  album?: string | null;
  art?: string | null;
}

/**
 * One thing the catalogue thinks a track might be.
 *
 * `artwork` is the catalogue's own URL and is never stored: choosing a match
 * asks the main process to fetch it into the library folder, and what lands in
 * the manifest is `art/<id>.jpg`.
 */
export interface Match {
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  artwork: string | null;
  /** The cover as a `data:` URI, carried back by the main process. */
  thumb: string | null;
}

/**
 * The grid as kept beside a track — `mix/electron/analysis.ts`'s shape.
 *
 * An even ruling from `bpm` and `offset` when `beats` is null, otherwise the
 * map. `bpmAuto` says whether the tempo was measured or typed, which is what
 * the header shows beside it.
 */
export interface Grid {
  bpm: number;
  bpmAuto: boolean;
  offset: number;
  beats: Beats | null;
}

/** The last fit's reading, without the map — the map is the grid's. */
export type Reading = Fit | Omit<Follow, 'beats'>;

export interface Analysis {
  openflow: 'mix-analysis';
  version: number;
  track: string;
  grid: Grid | null;
  fit: Reading | null;
  produced: string;
}

/** One separation's drawing, interleaved min and max per column, per source. */
export interface KeptPeaks {
  stems: string;
  key: string;
  columns: number;
  sources: Record<string, Float32Array>;
}

interface Bridge {
  demucs(): Promise<Ready>;
  library: {
    read(): Promise<Library>;
    choose(): Promise<Library>;
    add(): Promise<Imported>;
    drop(files: File[]): Promise<Imported>;
    youtube(url: string): Promise<Imported>;
    reveal(): Promise<void>;
    base(): Promise<string>;
    edit(id: string, edits: Edits): Promise<Library>;
    matches(text: string): Promise<Match[]>;
    artwork(id: string, url: string): Promise<Library>;
  };
  analysis: {
    read(trackId: string): Promise<Analysis | null>;
    write(trackId: string, grid: Grid | null, fit: Reading | null): Promise<void>;
    peaks(trackId: string, stems: string): Promise<KeptPeaks | null>;
    keepPeaks(
      trackId: string,
      stems: string,
      columns: number,
      sources: Record<string, Float32Array>,
    ): Promise<void>;
  };
  destination: {
    read(): Promise<string>;
    choose(): Promise<string>;
  };
  separate: {
    models(): Promise<Model[]>;
    busy(): Promise<string | null>;
    run(ask: { trackId: string; file: string; model: string }): Promise<Outcome>;
    cancel(trackId?: string): Promise<void>;
    onProgress(hear: (at: { trackId: string; progress: Progress }) => void): () => void;
    onFinished(hear: (outcome: Outcome) => void): () => void;
  };
  transcribe: {
    busy(): Promise<string | null>;
    run(ask: {
      trackId: string;
      tuning: readonly TuningString[];
      bars: { rate: number; length: number; first: number; samples: readonly number[] } | null;
      transpose: number;
    }): Promise<TranscribeOutcome>;
    cancel(trackId?: string): Promise<void>;
    reveal(trackId: string): Promise<void>;
    onProgress(hear: (at: { trackId: string; progress: TranscribeProgress }) => void): () => void;
    onFinished(hear: (outcome: TranscribeOutcome) => void): () => void;
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
