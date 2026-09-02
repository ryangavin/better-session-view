/**
 * What passes between the report writer (tools/mix-warp.ts), the harness
 * page (mix/harness/) and the scorer: the report of one run of the beat
 * finding on one track, and the truth it is judged against.
 */
import type { Peak } from '../src/audio.ts';
import type { Follow } from '../src/follow.ts';
import type { Fit } from '../src/tempo.ts';
import type { Trace } from '../src/trace.ts';
import type { Heard } from '../src/transients.ts';
import type { Beats } from '../src/warp.ts';

/** A tempo known about a track ahead of time, from tools/mix-warp-truth.json. */
export interface KnownTempo {
  /** A word of the title. */
  title: string;
  /** The tempo, or the tempo the song opens at. */
  bpm: number;
  /** Where the tempo changes: from this second on, this tempo. */
  sections?: { from: number; bpm: number }[];
  note?: string;
}

/** What one run of the pipeline saw on one track. */
export interface Report {
  track: { id: string; title: string; seconds: number; rate: number; stems: string[] };
  heard: Heard;
  fit: Fit | null;
  follow: Omit<Follow, 'beats'> | null;
  beats: Beats | null;
  trace: Trace;
  /** The drums stem, downsampled for the overview; the page decodes the wav itself for anything closer. */
  peaks: { drums: Peak[]; per: number };
  known: KnownTempo | null;
}

export interface IndexEntry {
  id: string;
  title: string;
  seconds: number;
  bpm: number | null;
  /** A truth file exists, or a tempo is known. */
  truth: boolean;
}

/** One correction made by hand in the page, and what kind of error it names. */
export type Edit =
  /** A beat moved: the machine had the pulse, but not the sample. */
  | { type: 'moved'; beat: number; from: number; to: number }
  /** A beat removed: nothing was struck as a beat there. */
  | { type: 'spurious'; beat: number; sample: number }
  /** A beat added: a pulse the machine walked past. */
  | { type: 'missed'; sample: number }
  /** The bar line rotated by this many beats: the pulses were right, the downbeat was not. */
  | { type: 'phase'; by: number }
  /** Every other beat dropped, or one inserted between each pair: an octave error. */
  | { type: 'octave'; factor: 0.5 | 2 };

/** Where the beats really are on a track, over a region, and how that was established. */
export interface Truth {
  track: string;
  /** Seconds. Only beats within are judged. */
  region: { from: number; to: number };
  /**
   * The true beats within the region: the sample of each, in order, and which
   * of them is a downbeat. Rate is the report's.
   */
  beats: { rate: number; samples: number[]; downbeat: number[] };
  /** How this truth came about: corrected by hand from the predicted map, or laid out from a known tempo. */
  source: 'manual' | 'known';
  /** The corrections made, in order, when by hand. */
  edits: Edit[];
  /** ISO 8601. */
  at: string;
}
