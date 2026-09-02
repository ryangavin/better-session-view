/**
 * What the beat finding saw on the way to its answer.
 *
 * `tempo.ts` and `follow.ts` each take an optional trace and, when handed
 * one, write their intermediates into it: the curves they correlated, the
 * periods they weighed, the phases they swept, the beat each frame was
 * matched to. The app never passes one. The harness under `tools/` does, and
 * draws it, so a wrong tempo can be traced to the decision that made it
 * rather than inferred from the grid.
 *
 * Plain numbers and arrays throughout, so a trace serialises as JSON as is.
 */

/** A candidate period the fit weighed, and how it fared. */
export interface CandidateTrace {
  /** Seconds between pulses, off the autocorrelation. */
  period: number;
  bpm: number;
  /** Autocorrelation at this period against the strongest, 0 to 1. */
  score: number;
  /** Why it went no further, or nothing if it was scored. */
  rejected?: 'range' | 'unrefined';
  /** The line fitted through the hits under it, where it was. */
  line?: { first: number; period: number };
  /** How much it looked like the beat at that line, weighted by its score. */
  beatness?: number;
  /** The phase sweep that placed its first beat: a score per step from `from`. */
  sweep?: { from: number; step: number; scores: number[] };
}

export interface TempoTrace {
  /** Seconds per frame of the pulse. */
  frame: number;
  /** The onset strength the autocorrelation ran over, one value per frame. */
  pulse?: number[];
  /** The autocorrelation, one value per lag from `lo` frames up. */
  acf?: { lo: number; values: number[] };
  /** Every period weighed, strongest first. */
  candidates?: CandidateTrace[];
  /** What was chosen, and why. */
  chosen?: {
    candidate: number;
    line: { first: number; period: number };
    /** The fitted tempo before it was tested against a whole number. */
    fitted: number;
    bpm: number;
    agreement: number;
    /** Kick weight on each of the four beats of the bar, from the first beat in the file. */
    votes: number[];
    /** Which of the four won. */
    downbeat: number;
    offset: number;
  };
  /** Why there was no fit, when there was none. */
  refused?: string;
}

/** One stretch of the song the follower read a period off. */
export interface StretchTrace {
  /** Seconds, at the centre of the stretch. */
  at: number;
  /** Onset strength summed over the stretch. */
  total: number;
  /** The tempo the stretch stated, or nothing if it did not state one clearly. */
  read: number | null;
  /** Dropped as a fill: several times busier than the song usually is. */
  fill: boolean;
}

/** One beat the follower found. */
export interface BeatTrace {
  /** Frame of the strength the beat was found on. */
  frame: number;
  /** Seconds, from the frame. */
  at: number;
  /** The transient it was anchored to, as an index into the heard transients, or nothing. */
  hit: number | null;
  /** The sample it ended up on: the anchor, or the interpolation between anchors. */
  sample: number;
}

export interface FollowTrace {
  /** Seconds per frame of the strength. */
  frame: number;
  /** The onset strength the beats were found in, one value per frame. */
  strength?: number[];
  /** The stretches the local period was read from. */
  stretches?: StretchTrace[];
  /** The local tempo the beats were held to, one value per frame, in BPM. */
  tempo?: number[];
  /** The beats, in order. */
  beats?: BeatTrace[];
  /** Kick level on each of the four beats of the bar, from the first beat found. */
  votes?: number[];
  downbeat?: number;
  refused?: string;
}

export interface Trace {
  tempo?: TempoTrace;
  follow?: FollowTrace;
}
