/**
 * What the preload put on the window, declared for the renderer.
 *
 * These shapes are `mix/electron/`'s, restated rather than imported: the
 * renderer is a separate compilation with no `node:` types in it, and reaching
 * into `electron/` from here would drag them in. Two files that must agree, and
 * `npm run typecheck` covers both.
 */
import type { TranscribedNote } from './tab.ts';
import type { Every } from './pinned.ts';
import type { Beats } from './warp.ts';
import type { Fit } from './tempo.ts';
import type { Follow } from './follow.ts';
import type { AudioDevice } from './audioDevices.ts';
import type { LinkAudioAPI } from './linkAudioTypes.ts';
import type { PitchEvidence } from './pitchMap.ts';

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
  quality: number;
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
  keyAnalysis?: import('./key.ts').KeyAnalysis | null;
  keyDetection?: import('./keyDetection.ts').KeyDetection | null;
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
  key?: string | null;
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
  /**
   * A fit ran over this track and found nothing steady.
   *
   * Kept apart from the grid because a failure is not a decision: the grid
   * stays null so the next open measures again, and this is what lets the
   * header say `no fit` in the meantime instead of drawing 120 as a fact.
   */
  fitFailed?: boolean;
  /** Which algorithm laid this grid, or absent where a hand did. */
  algorithm?: string;
  /** The slices somebody made, or null (or absent) while they are the window's to read off the stems. */
  slices?: { bar: number; name: string }[] | null;
  produced: string;
}

/** What an export is asked for: the ruling, the track, which stems, and where they are cut. */
export interface ExportAsk {
  trackId: string;
  title: string;
  /** `stems/<id>/<model>`, relative to the library root. */
  stems: string;
  sources: string[];
  /** The sections to cut each stem into, in order, or nothing for one file per stem. */
  slices?: { bar: number; name: string }[];
  /** The tempo the record was measured at. */
  bpm: number;
  /** Seconds from the top of the record to 1.1.1. */
  offset: number;
  /** The tempo to lay it at. */
  to: number;
  /** How densely the map is pinned to the grid: per section, every so many bars from 1.1.1, or per beat. Per beat if unsaid. */
  every?: Every;
  /** The sections, in bars from 1.1.1, pinned whether or not the stems are cut there. The slices, if unsaid. */
  cuts?: number[];
  /** Where the beats actually fall, so a record that moves is followed rather than averaged. */
  beats?: Beats;
}

/** How far along an export is — `mix/electron/export.ts`'s shape. */
export interface ExportProgress {
  /** 0 to 1 across every stem asked for. */
  done: number;
  /** *laying drums*, *writing drums*. */
  stage: string;
}

export interface Written {
  where: string;
  files: string[];
  bars: number;
  seconds: number;
  speed: number;
  /** How many sections each stem was cut into. One means it was not cut. */
  parts: number;
  /** How densely the record was pinned, when it was laid from a map. */
  every?: Every;
  /** How far the worst line landed from the grid, in seconds, when there was a map: the lines the dialog's sentence reads. */
  worst?: number;
  /** The tempo each section was laid at, in order, when the stems were cut with a map. */
  tempos?: number[];
}

/**
 * What the library rail says about a track's grid without opening it —
 * `mix/electron/analysis.ts`'s shape. `warp.ts`'s `tempoText` reads it.
 */
export interface GridNote {
  bpm: number | null;
  slowest: number | null;
  fastest: number | null;
  /** A grid a hand made or corrected, rather than one a fit measured. */
  byHand: boolean;
  /** A fit ran and found nothing steady. */
  failed: boolean;
  /** The algorithm that laid it, or null for a hand-made grid or an older file. */
  algorithm: string | null;
}

/** One separation's drawing, interleaved min and max per column, per source. */
export interface KeptPeaks {
  stems: string;
  key: string;
  columns: number;
  sources: Record<string, Float32Array>;
}

/** Every source a deck plays, walked against time rather than against the grid. */
export interface KeptScans {
  stems: string;
  key: string;
  rate: number;
  sources: Record<string, { bins: number; values: Float32Array }>;
}

interface Bridge {
  audioDevices(): Promise<AudioDevice[]>;
  keyExperiments: import('./keyExperiments.ts').KeyExperimentAPI;
  keyVersion(): Promise<number>;
  analyzeKey(id: string): Promise<Library>;
  bassMidi: import('./bassMidi.ts').BassMidiAPI;
  linkAudio: LinkAudioAPI;
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
    write(
      trackId: string,
      grid: Grid | null,
      fit: Reading | null,
      slices: { bar: number; name: string }[] | null,
      fitFailed?: boolean,
      algorithm?: string | null,
    ): Promise<void>;
    notes(trackIds: string[]): Promise<Record<string, GridNote>>;
    peaks(trackId: string, stems: string): Promise<KeptPeaks | null>;
    keepPeaks(
      trackId: string,
      stems: string,
      columns: number,
      sources: Record<string, Float32Array>,
    ): Promise<void>;
    scans(trackId: string, stems: string): Promise<KeptScans | null>;
    onScansChanged(hear: (change: { root: string; trackId: string }) => void): () => void;
    keepScans(
      trackId: string,
      stems: string,
      rate: number,
      sources: Record<string, { bins: number; values: Float32Array }>,
    ): Promise<void>;
  };
  destination: {
    read(): Promise<string>;
    choose(): Promise<string>;
  };
  export: {
    stems(ask: ExportAsk): Promise<Written>;
    onProgress(hear: (progress: ExportProgress) => void): () => void;
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
    pitchMap(trackId: string): Promise<PitchEvidence | null>;
    busy(): Promise<string | null>;
    run(ask: {
      trackId: string;
      tuning: readonly TuningString[];
      bars: { rate: number; length: number; first: number; samples: readonly number[] } | null;
      transpose: number;
      requirePitchMap?: boolean;
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

/** What a row's second fact is saying, so the rail can draw the bad ones differently. */
export type GridState = 'measured' | 'byHand' | 'failed' | 'unread' | 'none';

/** One row's second fact: what to write, what kind of thing it is, and why. */
export interface Fact {
  says: string;
  state: GridState;
  why: string;
}

/**
 * The fact a library row carries beside the artist: the track's key, and where
 * its grid stands.
 *
 * The grid rather than the file's type, because the type is the one thing about
 * a track nobody is ever looking for. What a person scanning this rail wants to
 * know is which of forty imports still needs its beats found — so a track with
 * a grid says the tempo, and a track without says *which kind of without*. A
 * fit that ran and found nothing needs a hand on it; a track nobody has opened
 * only needs opening; and a track with no stems has nothing to have found yet,
 * so it falls back to the type as it always did.
 */
export const gridFact = (track: Track, note: GridNote | undefined, tempo: string, known: boolean): Fact => {
  const type = track.file.slice(track.file.lastIndexOf('.') + 1);
  const said = (says: string, state: GridState, why: string): Fact => ({
    says: [track.key, says].filter(Boolean).join(' · '),
    state,
    why,
  });
  // Before the notes have been read — and where the process that holds them
  // cannot answer — the row says the one thing it knows for itself. Claiming
  // `no grid` about a track whose grid nobody has looked up yet would be the
  // rail inventing the very fact it exists to report.
  if (!known) return said(type, 'none', 'Reading what has been found about this track');
  if (tempo) {
    // The rail has room for a tempo and not for a sentence, so which algorithm
    // found it goes in the tooltip — where it answers the question the rail
    // provokes, which is why two tracks read differently.
    const by = note?.algorithm && note.algorithm !== 'hand' ? ` Laid by ${note.algorithm}.` : '';
    return note?.byHand
      ? said(tempo, 'byHand', `The tempo of the grid, which was set or corrected by hand.${by}`)
      : said(tempo, 'measured', `The tempo the beats run at, read off their spacing.${by}`);
  }
  if (track.sources.length === 0) return said(type, 'none', 'Separate this track to find its beats');
  if (note?.failed) {
    return said('no fit', 'failed', 'Nothing steady enough to fit a tempo to. Open it and correct the grid by hand');
  }
  return said('no grid', 'unread', 'Its beats have not been found yet. Open it to measure them');
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
