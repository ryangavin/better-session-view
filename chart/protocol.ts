// The wire between the chart server and a phone.
//
// One direction only, and that is the design rather than a simplification. A
// phone reading the chart has nothing to say back — it cannot fire a clip,
// rename a scene or move anything — so the transport is Server-Sent Events and
// the payload type below is the whole vocabulary. Read-only by construction
// beats read-only by convention: there is no request type here to add one to.
//
// Everything is worked out server-side. Nothing on the phone parses a scene
// name, compiles a pattern or knows that the mapping lives in the names, for
// the same reason `BSV.SetModel` exists — one reading of the set, not one per
// device in the room.

/** Where the chart server listens. Bridge 17800, visuals 17900, this 18000. */
export const CHART_PORT = 18000;

/** The SSE stream. Every other path is the app. */
export const EVENTS_PATH = '/events';

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
