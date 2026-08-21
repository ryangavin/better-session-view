// The wire between the chart server and a phone.
//
// **Almost one direction.** Everything the phone is shown arrives over
// Server-Sent Events, which cannot carry anything back; the single thing it can
// send is a tempo nudge, and that is a `POST` of `{ by: 1 }` or `{ by: -1 }` —
// a *relative* step and nothing else. There is deliberately no way to state a
// tempo, because a phone that could would be a phone that could jump a running
// set to 200 from a stale reading. See `docs/following.md` on what opening this
// to the wifi does and does not expose.
//
// Everything is worked out server-side. Nothing on the phone parses a scene
// name, compiles a pattern or knows that the mapping lives in the names, for
// the same reason `BSV.SetModel` exists — one reading of the set, not one per
// device in the room.

/** Where the chart server listens. Bridge 17800, visuals 17900, this 18000. */
export const CHART_PORT = 18000;

/** The SSE stream. Every other path is the app. */
export const EVENTS_PATH = '/events';

/** The one thing a phone can send. `POST` `{ by: 1 }` or `{ by: -1 }`. */
export const TEMPO_PATH = '/tempo';

/**
 * The two SSE event names, because the two payloads move at different rates.
 *
 * A chart changes when somebody fires something. Loop positions change
 * continuously, and Live reports them at 20 Hz. Putting both in one message
 * would push the whole song list several times a second to say a playhead
 * moved, which is the traffic split this exists to avoid — the same split
 * `visuals` makes between its show and its anchor.
 */
export const CHART_EVENT = 'chart';
export const LOOPS_EVENT = 'loops';
export const PROGRESSION_EVENT = 'progression';

/** The most a single nudge may move the tempo, in BPM. */
export const NUDGE = 1;

/**
 * The `pathLength` a loop wheel's circle declares, so its dash array is the
 * phase itself and no circumference arithmetic has to track the radius.
 */
export const LOOPS_PATH_LENGTH = 1;

/** One playing clip, as something to watch go round. */
export interface LoopTrack {
  /** Track index, in the same space as `BSV.Snapshot.tracks`. */
  t: number;
  name: string;
  /** The track's colour as Live renders it. */
  color: number;
  /**
   * Live's `playing_position` **at the moment this frame was built**, in the
   * unit `inSeconds` names. It is an anchor, not a reading to print: the phone
   * advances it itself between frames — see `docs/following.md`.
   */
  position: number;
  loopStart: number;
  loopEnd: number;
  looping: boolean;
  recording: boolean;
  /** True for unwarped audio, whose times Live gives in seconds, not beats. */
  inSeconds: boolean;
  signatureNumerator: number;
  signatureDenominator: number;
}

/** One stretch of the loop that spells one chord, as the phone draws it. */
export interface ProgressionCell {
  /** Beats from the reference clip's start, inclusive. */
  from: number;
  /** Beats from the reference clip's start, exclusive. */
  to: number;
  /** `Am7`, `F`, `G/B` — or null where the notes spelled nothing. */
  symbol: string | null;
}

/**
 * The chord progression of what is playing.
 *
 * **The only thing the chart infers rather than reads.** Every other fact comes
 * out of the set — scene names state the song, the key, the role — but a set
 * states its progressions nowhere, so this is worked out from the MIDI of the
 * clips that are sounding. It can therefore be wrong in a way nothing else here
 * can, and a cell it could not spell is null rather than its best guess.
 *
 * Sent on its own event, because it changes when the clips change and not when
 * the playhead moves.
 */
export interface ChartProgression {
  /**
   * The track whose loop the cell times are measured against — the longest
   * harmony loop playing, since that is the period the progression has.
   *
   * The phone already knows where that track's playhead is, from the loops
   * frame, so this is how it lights the current cell without being told.
   */
  t: number;
  /** The reference clip's loop, in beats from its own start. */
  from: number;
  to: number;
  cells: ProgressionCell[];
}

/**
 * Every track with something playing in it, as one coherent frame.
 *
 * Sent far more slowly than Live reports it, because the phone does not need
 * to be *told* where a playhead is. A loop advances at a rate the tempo states,
 * so a position and the moment it was read are enough to draw every frame in
 * between — this arrives a couple of times a second to correct the drift and to
 * say when the clips themselves changed.
 */
export interface ChartLoops {
  /** The tempo the positions advance at. Beats per minute. */
  tempo: number;
  /**
   * Whether the positions are advancing at all.
   *
   * Here rather than read off the chart, so a frame carries everything needed
   * to extrapolate from it and nothing has to be correlated across two streams
   * arriving at different rates. **A stopped set is the case that makes this
   * necessary**: Live freezes each clip where it stands and goes on reporting
   * it, so a reader advancing the position anyway would spin every wheel on a
   * silent stage — the one state where being obviously wrong is guaranteed to
   * be noticed.
   */
  rolling: boolean;
  /** Absent from the frame rather than present and silent. */
  tracks: LoopTrack[];
}

/**
 * One scene of the song, as something to follow rather than something to fire.
 *
 * A section is a *scene*, and `s` is its index in the set — which is what makes
 * two sections carrying the same role distinguishable without inventing
 * "VERSE 1" and "VERSE 2" that nothing in the set says.
 */
export interface ChartSection {
  /** Scene index, in the same space as `BSV.Snapshot.scenes`. */
  s: number;
  /** The `[ROLE]` tag in the scene's name, uppercased, or null when it has none. */
  role: string | null;
  /** What to print: the role, the song title behind it, or the scene's position. */
  label: string;
  /**
   * This section's own key, and **only when nothing above it states one**.
   *
   * Null is therefore "the heading already said", not "unknown". A song whose
   * scenes agree prints its key once at the top; one that modulates cannot
   * print a single key at all, so every section prints its own and the row that
   * changes is visible against the rows that did not.
   */
  key: string | null;
  /** This section's own bpm, on the same terms as `key`. */
  bpm: string | null;
  /** The scene's colour as Live renders it, or null when the scene has none. */
  color: number | null;
  playing: boolean;
  /** Fired and waiting for the launch quantum. */
  queued: boolean;
}

/** The song being played, with every fact already rendered. */
export interface ChartSong {
  name: string;
  /**
   * The musical key, and `''` when the song does not have one to state — either
   * the set never said, or its scenes say more than one.
   *
   * **Deliberately narrower than `BSV.SongEntry.key`**, which renders a
   * disagreement as the collection `Bm / D`. That is the right answer in the
   * grid, where a clash is something to go and fix. Here it is not: this is a
   * reading surface, and a song that modulates has not gone wrong — so the
   * heading says nothing and every section states its own key instead.
   */
  key: string;
  /** The bpm, and `''` when the song's scenes state more than one — see `key`. */
  bpm: string;
  artist: string;
  tag: string;
  color: number | null;
  /** Its scenes in order. A reprise is simply further down the same list. */
  sections: ChartSection[];
}

/** Everything one phone is shown, in the terms it draws. */
export interface Chart {
  /** Whether the chart server can see the bridge. False is "nobody is home". */
  connected: boolean;
  /**
   * Whether the bridge has answered with a set.
   *
   * Distinct from `connected` because a device that is reachable and unhelpful
   * is the ordinary case, not an edge one: the bridge refuses every request
   * until the LOM is ready, so a rig powered on before Live is connected and
   * knows nothing.
   */
  ready: boolean;
  /** Live's transport. */
  rolling: boolean;
  /** The tempo Live is actually running at, which the label may disagree with. */
  tempo: number;
  /** The song the set is in, or null when the playing scene maps to none. */
  song: ChartSong | null;
  /** The scene playing, whether or not it belongs to a song. */
  now: ChartSection | null;
  /** The scene fired and waiting. */
  next: ChartSection | null;
}
