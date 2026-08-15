// Single source of truth for the wire protocol.
//
// Declared as a GLOBAL namespace rather than a module on purpose: `lom.js` is
// compiled with `module: "none"` (Max's v8 object needs message handlers as
// top-level globals, so no module wrapper is allowed) and `bridge.ts` emits to
// a flat CommonJS file outside its own rootDir. Neither can `import`.
// `protocol/index.ts` re-exports these as normal types for ui/ and core/.

declare namespace BSV {
  // --- Live state ------------------------------------------------------

  interface Track {
    i: number;
    name: string;
    color: number;
    colorIndex: number;
    isMidi: boolean;
    isGroup: boolean;
    isGrouped: boolean;
    /**
     * Index of the *immediate* parent group track, or -1 when not grouped.
     *
     * Resolved from the LOM's `group_track` rather than inferred from track
     * order, so nesting is represented honestly. Live allows groups inside
     * groups; this is one link up, not the outermost ancestor.
     */
    groupIndex: number;
    /** Live's `fold_state`. Only meaningful when `isGroup`. */
    isFolded: boolean;
  }

  interface Scene {
    i: number;
    name: string;
    color: number;
    /**
     * Slot in Live's palette, or -1 when the scene has no color at all —
     * `Scene.color_index` is documented as "Can be None for no color", and an
     * uncolored scene is not the same as one on slot 0. Check this before
     * trusting `color`.
     */
    colorIndex: number;
    isEmpty: boolean;
    tempo: number;
  }

  interface Clip {
    t: number;
    s: number;
    name: string;
    /** Slot in Live's palette — this is what we write. */
    colorIndex: number;
    /** Exact RGB Live renders for that index, so the UI needs no lookup. */
    color: number;
    length: number;
    isMidi: boolean;
  }

  /**
   * Per-phase cost of a snapshot, in ms. Every phase is a linear scan, so these
   * are what tell us how the walk scales to a full-size set.
   */
  interface SnapshotTimings {
    tracks: number;
    scenes: number;
    /** Scanning every clip slot for occupancy — trackCount × sceneCount. */
    slots: number;
    /** Reading properties off the clips that exist. */
    clips: number;
    /** How many slots the scan had to look at. */
    slotsScanned: number;
  }

  /**
   * A partial re-read of the set: everything in `tracks`, and nothing else.
   *
   * Pushed rather than requested. `lom.ts` watches Live's Session cursor —
   * `selected_track` and `selected_scene`, two observers — and re-reads the
   * track the cursor moved to *and* the one it left. You have to select a clip
   * to drag it, so the previous cursor position is where a moved clip came
   * from; re-reading only the destination would learn that a clip arrived and
   * never that it left. See `bridge/README.md` under *Following Live*.
   *
   * Merge with `mergeTrackDelta` in `core/`, which replaces by scope rather
   * than upserting by `(t, s)` — the difference is whether a deleted clip
   * disappears or is drawn in two places.
   */
  interface SnapshotDelta {
    /** The set's revision after this delta. See `Snapshot.rev`. */
    rev: number;
    /**
     * The revision this was computed against. Apply only when it equals the rev
     * you hold — anything else means a message was missed, and the answer is a
     * full snapshot rather than a retry. `canApplyDelta` in `core/` is this
     * check.
     */
    prevRev: number;
    /**
     * Track indexes whose clips were re-read in full. Authoritative in both
     * directions: a track listed here with no clips in `clips` is empty, not
     * unreported.
     *
     * Named `clipScope` and not `tracks` because `trackRows` below is also
     * "tracks" and means something else entirely — one is which columns were
     * re-read, the other is what the columns themselves are called. Rule 7 in
     * `CONTRIBUTING.md` is about DAW words, but the same trap is the reason.
     */
    clipScope: number[];
    /** Every clip now in the tracks named by `clipScope`. */
    clips: Clip[];
    /**
     * Scene and track rows that were re-read, if any.
     *
     * **Upserts by `i`, with no scope array**, which is the opposite of how
     * clips merge and deliberately so. `mergeTrackDelta` cannot upsert because a
     * clip can *vanish* from a track — a clip moved out of a slot is a deletion
     * at the source, and an upsert has no entry to represent one. A scene at
     * index 5 cannot vanish that way: either it exists, or the set restructured,
     * and a restructure sends every client for a full walk regardless.
     *
     * Absent rather than empty when nothing was re-read, so a delta that is only
     * about clips stays exactly the message it was.
     */
    sceneRows?: Scene[];
    trackRows?: Track[];
    /** The set's tempo, when the re-read covered it. */
    tempo?: number;
    /** Master track RGB after a Master color change; null when unreadable. */
    masterColor?: number | null;
    /** LOM time for the re-read, ms. */
    ms: number;
  }

  interface Snapshot {
    /**
     * Monotonic counter owned by `lom.ts`, bumped once per publish — snapshots
     * and deltas share the sequence. It is what lets a client tell "this delta
     * follows what I hold" from "I missed one"; see `SnapshotDelta.prevRev`.
     *
     * Deliberately not a timestamp. Two publishes inside one millisecond would
     * be indistinguishable, and the whole point is to order them.
     */
    rev: number;
    /** Total LOM walk, ms. */
    ms: number;
    timings: SnapshotTimings;
    tempo: number;
    /** Live's Master track RGB. Master is not included in `Song.tracks`. */
    masterColor: number | null;
    trackCount: number;
    sceneCount: number;
    clipCount: number;
    tracks: Track[];
    scenes: Scene[];
    clips: Clip[];
  }

  // --- the set, as this app reads it -----------------------------------

  /**
   * One song, with every fact about it already worked out.
   *
   * The wire form of `DerivedSong` plus the rendered facts `songFacts` produces,
   * so **nothing downstream parses a name again**. A client that wants the list
   * of songs in the set reads `SetModel.songs` and is done; it does not compile
   * a pattern, walk the scenes, or know that names are where the mapping lives.
   *
   * The facts arrive as rendered strings — `128`, or `128 / 130` when the
   * scenes state two — for the reason `SongHeader` gives: they cross into a
   * memoized React row, and an array prop re-renders every header in the set.
   */
  interface SongEntry {
    /** Case-insensitive identity, from `songKey`. Not the musical key. */
    songKey: string;
    /** Display name, in the spelling the set uses. */
    name: string;
    /** Every scene carrying this song, ascending. */
    scenes: number[];
    /** Those scenes as contiguous runs. More than one is a reprise. */
    blocks: Array<{ from: number; to: number }>;
    /** `''` when the set says nothing, `a / b` when its scenes disagree. */
    bpm: string;
    /** The musical key, not `songKey`. */
    key: string;
    artist: string;
    tag: string;
    /** True when the song's scenes state more than one of that fact. */
    bpmClash: boolean;
    keyClash: boolean;
    artistClash: boolean;
    tagClash: boolean;
    /** Palette slot for the whole song, or -1 when it has none *or* clashes. */
    colorIndex: number;
    colorClash: boolean;
    /**
     * `Scene.tempo` on the song's first scene — the one scene this app writes a
     * tempo to. Null when it follows the Live Set. See `core/docs/derive.md`.
     */
    firstSceneTempo: number | null;
    /**
     * Every scene of the song carrying its own `Scene.tempo`, ascending. More
     * than one entry is a song written by the every-scene convention, and it is
     * what the clear-stray-tempos action reads.
     */
    tempoScenes: number[];
  }

  /**
   * What this app understands the set to be — the derived layer, held by the
   * bridge and shipped whole.
   *
   * **This exists so the mapping is read out of the names exactly once.** It
   * used to be computed independently in the bridge (for Push's song list) and
   * again in every browser tab, from the same scene names, by the same
   * `derive()` — two answers to one question, which is the drift this project's
   * naming scheme exists to avoid. The bridge now owns it and everyone else
   * consumes it.
   *
   * Scoped to the **scene/song layer** on purpose: everything here is a function
   * of scene names and `Scene.tempo`, which is what the bridge can keep current
   * from a `sceneRows` delta. What a *folded song holds per track* is a function
   * of the clips as well, so it stays in the browser (`blockTrackRoles`) rather
   * than making every clip edit rebuild this.
   */
  interface SetModel {
    /** The snapshot revision this was read from. See `Snapshot.rev`. */
    rev: number;
    /** Songs in order of first appearance. */
    songs: SongEntry[];
    /**
     * Scene index → `songKey`. Absent for a scene belonging to no song.
     *
     * An object rather than a Map because it crosses the wire as JSON. Keys are
     * scene indexes written as strings, which is what `JSON.stringify` does to
     * a numeric key and what every consumer has to cope with anyway.
     */
    songByScene: Record<string, string>;
    /** Scene indexes whose names match no pattern at all. */
    unmapped: number[];
  }

  interface Palette {
    count: number;
    colors: number[];
  }

  // --- playback --------------------------------------------------------

  /** Something that can be fired. */
  type LaunchTarget =
    /**
     * A clip *slot*, addressed by position — not a clip. The distinction is
     * load-bearing in two places, and both are Live's own behaviour rather than
     * ours: firing an empty slot triggers that slot's stop button, and firing a
     * **group track's** slot fires every clip the group holds in that scene.
     * Neither needs a message of its own, because in the LOM both are one
     * `ClipSlot.fire()` on the slot at `t, s`.
     */
    | { kind: 'clip'; t: number; s: number }
    | { kind: 'scene'; s: number }
    /** The song transport itself — start playing. */
    | { kind: 'song' };

  /** Something that can be stopped. */
  type StopTarget =
    /** One track's stop button: its running *and* triggered clips. */
    | { kind: 'track'; t: number }
    /** Every playing clip, leaving the song rolling. */
    | { kind: 'clips' }
    | { kind: 'song' };

  /**
   * What one track is doing right now.
   *
   * Read from Live's per-*track* properties, not per-clip: the whole grid's
   * play state costs three reads per track instead of two per slot, which at
   * full size is the difference between ~120 observers and ~68,000. Nothing
   * here is clip-addressed, and that's the point.
   */
  interface TrackPlayState {
    /** Scene index of the playing clip; -1 when none. Live's `playing_slot_index`. */
    playing: number;
    /**
     * Scene index of the fired (blinking) slot; -1 when nothing is fired and
     * **-2 when the track's stop button was fired**. That -2 is Live's own
     * encoding and is kept rather than folded into -1: a track about to stop
     * is a distinct state from a track with nothing pending, and the header
     * blinks for it.
     */
    fired: number;
    /**
     * Live's `Track.arm`. False for tracks that can't be armed at all.
     *
     * Here rather than only in `MixerTrackState` because arming changes what
     * the *grid* does: `ClipSlot.fire()` on an empty slot triggers that slot's
     * stop button on an unarmed track and starts recording on an armed one, so
     * every empty cell draws a different button depending on this. The mixer's
     * copy is observed only while its footer is open, and the grid is never
     * closed — this is the always-on watcher, so arm rides with it.
     */
    armed: boolean;
  }

  /** One track from a complete output-meter frame. */
  interface TrackMeterLevel {
    /** Track index, in the same space as `Snapshot.tracks`. */
    t: number;
    /** Current mono output peak, clamped to Live's documented 0–1 range. */
    level: number;
  }

  /** One coherent output-meter frame from Live. */
  interface MeterFrame {
    /** Master-track output peak, clamped to Live's documented 0–1 range. */
    master: number;
    /** Every ordinary track's latest level, in track order. */
    tracks: TrackMeterLevel[];
  }

  /**
   * The clip playing in one track, in the terms its status display needs.
   *
   * Clip-addressed, unlike `TrackPlayState`, and affordable for the same reason
   * that one is not: there is at most one playing clip per track, so this costs
   * per *track* even though it reads clip properties. `TrackPlayState.playing`
   * is what says which clip, and the bridge follows it.
   *
   * Every time value here shares one unit and `inSeconds` is which. Live gives
   * `playing_position`, `loop_start` and `loop_end` in beats for MIDI and
   * warped audio clips and in seconds for unwarped audio; mixing the two
   * produces a loop phase quietly wrong by the tempo.
   */
  interface PlayingClip {
    /** Track index, in the same space as `Snapshot.tracks`. */
    t: number;
    /** Live's `Clip.playing_position`. */
    position: number;
    /** For unlooped clips Live reports the start and end markers in these. */
    loopStart: number;
    loopEnd: number;
    looping: boolean;
    recording: boolean;
    /** True for unwarped audio, whose times Live gives in seconds. */
    inSeconds: boolean;
    signatureNumerator: number;
    signatureDenominator: number;
  }

  /**
   * One coherent frame of every track that has something playing in it.
   *
   * Tracks with no playing clip are absent rather than present and empty: the
   * frame is sent many times a second, and the common set has far more silent
   * tracks than sounding ones.
   */
  interface ClipStatusFrame {
    tracks: PlayingClip[];
  }

  /** One writable Live mixer parameter, in its native DeviceParameter range. */
  interface MixerParameterState {
    value: number;
    min: number;
    max: number;
    defaultValue: number;
    /** Live's own user-facing representation, e.g. `-3.8 dB` or `C`. */
    display: string;
    /** False when automation, mapping, or Live itself prevents direct edits. */
    enabled: boolean;
  }

  type MixerVolumeState = MixerParameterState;

  /** The controls beneath one ordinary track column in the mixer panel. */
  interface MixerTrackState {
    t: number;
    /** Live's Track Activator, represented as the inverse of Track.mute. */
    active: boolean;
    solo: boolean;
    armed: boolean;
    canArm: boolean;
    /** Null only when the documented MixerDevice volume path did not resolve. */
    volume: MixerParameterState | null;
    /** Null only when the documented MixerDevice panning path did not resolve. */
    pan: MixerParameterState | null;
    /** One parameter per return track, in Live's A/B/C order. */
    sends: (MixerParameterState | null)[];
  }

  /** One coherent mixer-control readback. Levels remain in MeterFrame. */
  interface MixerState {
    /** Number of return tracks, and therefore send rows shown per track. */
    sendCount: number;
    /** Master has volume but no activator, Solo, or Arm controls. */
    masterVolume: MixerParameterState | null;
    masterPan: MixerParameterState | null;
    tracks: MixerTrackState[];
  }

  type MixerTarget = { kind: 'track'; t: number } | { kind: 'master' };

  /** Any related subset of one mixer strip, written as one operation. */
  interface MixerPatch {
    active?: boolean;
    solo?: boolean;
    armed?: boolean;
    volume?: number;
    pan?: number;
    /** One track send, addressed by its zero-based return-track index. */
    send?: { index: number; value: number };
  }

  /** Live's set-wide control-bar state, observed and pushed as one unit. */
  interface TransportState {
    /** Song.tempo, 20–999 BPM. May move under Arrangement automation. */
    tempo: number;
    metronome: boolean;
    /** Song.clip_trigger_quantization, using Live's documented 0–13 enum. */
    clipTriggerQuantization: number;
    /**
     * Song.record_mode — Live's Arrangement Record button. Armed rather than
     * recording: with the song stopped it decides what the next start does,
     * and turning it on while the song rolls begins the take there and then.
     */
    recordMode: boolean;
    /** Current Scale controls from Live's control bar. */
    rootNote: number;
    scaleName: string;
    scaleMode: boolean;
  }

  /**
   * One control-bar gesture. Optional fields keep root, scale and mode able to
   * travel together without inventing one wire message per Live property.
   */
  interface TransportPatch {
    tempo?: number;
    metronome?: boolean;
    clipTriggerQuantization?: number;
    recordMode?: boolean;
    rootNote?: number;
    scaleName?: string;
    scaleMode?: boolean;
  }

  // --- mutation --------------------------------------------------------

  interface ApplyOp {
    t: number;
    s: number;
    name?: string;
    colorIndex?: number;
  }

  /**
   * A write to a scene rather than a clip slot.
   *
   * Separate from `ApplyOp` rather than a discriminated variant of it because
   * the two aren't the same write with a different address: a scene's color
   * cannot be written the way a clip's can. Keeping them apart means `lom.ts`
   * can't accidentally send one down the other's path.
   */
  interface SceneOp {
    s: number;
    name?: string;
    /**
     * Slot in Live's palette. Carried as the intent — it's what the grid shows
     * and what undo reverses — but it is *not* what gets written.
     */
    colorIndex?: number;
    /**
     * The RGB for `colorIndex`, and **the only form Live accepts here**.
     * `Scene.color_index` is documented "Can be None for no color", and Max's
     * LiveAPI can read an `Optional[int]` but not construct one to write —
     * setting it answers `unsupported property type`. This is the one place the
     * project's "colors are indexes, never raw RGB" rule has to bend, and it
     * bends only for scenes and tracks. See `bridge/README.md`.
     *
     * Always sent together with `colorIndex`; neither is meaningful alone.
     */
    color?: number;
    /**
     * The scene's own tempo, in BPM. **Below 20 disables it** — Live's own
     * bound is 20–1000, and `Scene.tempo` reads back -1 when disabled, so
     * anything under it is unambiguously "no tempo of its own".
     *
     * Writing this is not a naming change, it changes how the set *plays*:
     * `Scene.tempo` is documented "the song will use the scene's tempo as soon
     * as the scene is fired". `tempo_enabled` gates it, and the bridge sets
     * both — writing `tempo` alone on a disabled scene does nothing visible and
     * reads back -1.
     */
    tempo?: number;
  }

  /**
   * One moved scene, as `core/src/sceneMove.ts` planned it.
   *
   * Both indexes are **post-insert**: they already account for the blank scenes
   * created at the destination, because inserting them renumbers everything at
   * or after it. Don't recompute them on the far side.
   */
  interface MoveStep {
    from: number;
    to: number;
    /** Tracks holding a clip at `from`. Only these get a `duplicate_clip_to`. */
    tracks: number[];
  }

  /**
   * Reordering scenes — the delete-capable structural write in the protocol.
   * Scene addition is separate specifically so it cannot reach this remove pass.
   *
   * Coarse-grained like everything else: one message per *move*, not per scene
   * and certainly not per clip. A twelve-scene song across twenty-four tracks is
   * one message describing up to 288 clip copies.
   *
   * The whole plan is computed in `core/` and travels as data, so `lom.ts`
   * executes it without doing arithmetic of its own — the arithmetic is the part
   * that can delete the wrong scenes, and it belongs where there are tests.
   */
  interface MovePlan {
    /** Scene indexes to create blanks at, ascending. */
    create: number[];
    steps: MoveStep[];
    /**
     * Scene indexes to delete, **descending** — each deletion renumbers
     * everything below it, so the order is load-bearing rather than cosmetic.
     */
    remove: number[];
  }

  /**
   * Add a contiguous run of blank scenes and give every one the same song
   * metadata. Unlike `MovePlan`, this is additive only: there is no copy pass
   * and no delete pass for a malformed request to stumble into.
   */
  interface SceneAddition {
    /** Insertion gap, from 0 through the current scene count. */
    at: number;
    /** Fixed at eight by the quick-add workflow and validated on both bridge sides. */
    count: number;
    /** Complete rendered scene name, including an optional key prefix. */
    name: string;
    /** Scene RGB. Omitted leaves Live's new scenes uncolored. */
    color?: number;
    /** Scene.tempo. Omitted leaves the scenes following the Live Set tempo. */
    tempo?: number;
  }

  interface ScenesAddedResult {
    created: number;
    configured: number;
    failed: number;
    /** First created scene index, or the requested gap when none were created. */
    from: number;
    /** Last created scene index, or `from - 1` when none were created. */
    to: number;
    undoStep: boolean;
  }

  /**
   * One clip copied from where it is to where it's going, as
   * `core/src/clipMove.ts` ordered it.
   *
   * **The order of `steps` is load-bearing and must not be re-sorted.** A drag
   * is a rigid translation, so a clip's target is often another clip's source;
   * the planner runs the copies against the direction of travel so nothing is
   * overwritten before it has been read. Sorting these by anything on the far
   * side silently destroys clips in the overlap.
   */
  interface ClipMoveStep {
    fromT: number;
    fromS: number;
    toT: number;
    toS: number;
  }

  /**
   * Moving clips around the grid.
   *
   * A second move write, and separate from `MovePlan` for the reason that
   * one is separate from `apply`: `MovePlan` creates and deletes *scenes* and
   * renumbers the set, while this touches only slots and leaves every index
   * meaning what it meant. Sharing a message would let a caller reach the
   * scene-deleting path by filling in one more field.
   *
   * Coarse-grained like everything else: one message per *drag*, however many
   * clips it carries.
   *
   * Copy-then-delete, because Live has no move — `duplicate_clip_to` then
   * `delete_clip`. Every copy runs before any delete, so a failure partway
   * leaves clips copied and the originals still there, which is the direction
   * you can recover from by hand.
   */
  interface ClipMovePlan {
    steps: ClipMoveStep[];
    /**
     * Sources to clear once every copy is done. Only the ones nothing landed
     * on — a source that is also someone's target holds the moved clip now.
     */
    remove: Array<{ t: number; s: number }>;
  }

  /** A role a scene can be marked with, and the palette slot it colors with. */
  interface Role {
    name: string;
    /** Slot in Live's palette, or -1 when the role has no color yet. */
    colorIndex: number;
  }

  /**
   * Configuration owned by one Session Bridge device instance and stored in
   * the Live Set through a parameter-enabled Max `pattr` blob.
   *
   * `allowedColors` is optional only while migrating an older device that kept
   * it in browser localStorage. A stored `null` deliberately means all colors.
   */
  interface DeviceState {
    version: 1;
    /** Set-wide seed for naming songs. Empty means no default. */
    defaultArtist: string;
    roles: Role[];
    allowedColors?: number[] | null;
    /**
     * Whether writing a song's bpm also writes Live's own `Scene.tempo` on that
     * song's **first** scene.
     *
     * **Optional and off by default, deliberately.** The bpm belongs to the
     * scene name, where it is a label and changes nothing about playback.
     * Turning this on makes a naming pass alter how the set *plays*, because
     * Live takes a scene's tempo the moment that scene fires — so it is a
     * decision the set records rather than something a rename quietly does.
     *
     * Absent means off, which is also what an older device's stored state says.
     */
    writeSceneTempo?: boolean;
  }

  interface ApplyResult {
    applied: number;
    skipped: number;
    total: number;
  }

  // --- client -> server ------------------------------------------------

  // `launch`, `stop`, `selectScene`, `setFold`, `setTransport`, `setMixer`, and the watches
  // deliberately have no terminal reply. What you want back from firing a clip
  // is not an acknowledgement, it's the play state changing — which arrives as
  // an unsolicited `playState`. A failure still surfaces: the bridge broadcasts
  // an `error` with no id.
  //
  // `setFold` is the same bargain for a different reason: the client already
  // moved its own columns before it sent, because waiting a round trip to
  // redraw a fold you just clicked is the one thing that would make it feel
  // slow. Live is being told, not asked.
  type Request =
    /**
     * The whole set.
     *
     * **Normally free.** The bridge holds the current set and answers from it,
     * so a client joining a running bridge gets the payload without Live doing
     * any work at all — which is the difference between a tab that opens
     * instantly and one that waits out a walk of every clip slot in the set.
     *
     * `fresh` forces the walk anyway. It is what the Snapshot button and the
     * staleness backstop send, because some of what a snapshot carries has no
     * observer in the LOM (`Clip.length`, `Track.fold_state`, another device
     * entirely) and the only way to find out is to look.
     */
    | { id?: number; type: 'snapshot'; fresh?: boolean }
    /**
     * One batch, both kinds of target. Clip and scene writes travel together so
     * "tag these scenes and recolor their clips" stays one operation with one
     * progress count and one reverse batch — splitting it would give undo two
     * halves that can succeed independently.
     */
    | { id?: number; type: 'apply'; ops: ApplyOp[]; sceneOps?: SceneOp[] }
    /** Insert and configure scenes without entering the delete-capable move path. */
    | { id?: number; type: 'addScenes'; addition: SceneAddition }
    /**
     * Reorder scenes. Deliberately **not** a variant of `apply`: `apply` writes
     * fields on things that already exist and is fully reversible from a
     * snapshot, while this creates and destroys scenes and is not. Sharing the
     * message would let a caller reach the destructive path by filling in one
     * more optional field.
     */
    | { id?: number; type: 'move'; plan: MovePlan }
    /**
     * Drag clips somewhere else. Not a variant of `move`: that one is about
     * scenes and renumbers the set, this one is about slots and doesn't.
     */
    | { id?: number; type: 'moveClips'; plan: ClipMovePlan }
    /** Developer diagnostic: sweep Live and compare it with the embedded palette. */
    | { id?: number; type: 'palette' }
    /**
     * Developer diagnostics against a real set — id addressing, `ClipSlot`
     * color semantics, selection and view-navigation behavior, and what
     * observers cost.
     *
     * **Answers go to the Max window, not back over the wire**, so there is no
     * reply event and nothing in `TERMINAL`. That isn't laziness: every
     * question here is about behavior visible only with Live open, and the
     * readout has to be somewhere you can watch without leaving Live.
     *
     * Nothing in `ui/` sends this — `tools/diag.ts` does.
     */
    | { id?: number; type: 'diag'; what: string; arg?: number }
    /** Replace the set's naming defaults and role definitions as one form. */
    | { id?: number; type: 'saveSetConfig'; defaultArtist: string; roles: Role[] }
    | { id?: number; type: 'saveAllowedColors'; colors: number[] | null }
    | { id?: number; type: 'observe'; on: boolean }
    /**
     * Fold or unfold a group track — Live's `fold_state`, which is what hides
     * a group's member tracks behind it.
     *
     * A view operation, not a set edit: it changes nothing about what plays and
     * nothing a snapshot would call content. It's here rather than kept local
     * to the client so that folding the grid folds the Session view too, and
     * survives the next snapshot — which re-seeds fold state from Live and
     * would otherwise undo it.
     *
     * `t` must be a group track. Live only exposes `fold_state` when
     * `is_foldable`, so the bridge checks rather than writing blind.
     */
    | { id?: number; type: 'setFold'; t: number; folded: boolean }
    /** Select an exact Session scene so Live reveals it in its own view. */
    | { id?: number; type: 'selectScene'; s: number }
    | { id?: number; type: 'launch'; target: LaunchTarget }
    | { id?: number; type: 'stop'; target: StopTarget }
    /** Write any related subset of Live's control-bar settings in one operation. */
    | { id?: number; type: 'setTransport'; patch: TransportPatch }
    /** Write one track or Master mixer strip; observed state is the acknowledgement. */
    | { id?: number; type: 'setMixer'; target: MixerTarget; patch: MixerPatch }
    | { id?: number; type: 'watchPlay'; on: boolean }
    | { id?: number; type: 'watchMeters'; on: boolean }
    /**
     * Follow the playing clip in every track, for the per-track status display.
     * Held only while the stop row is on screen, which is where it draws.
     */
    | { id?: number; type: 'watchStatus'; on: boolean }
    | { id?: number; type: 'watchSends'; on: boolean }
    | { id?: number; type: 'watchTransport'; on: boolean }
    /**
     * Follow changes the user makes in Live, by watching the Session cursor
     * and re-reading the tracks it touches. Two observers, not one per slot —
     * the LOM has no aggregate "a clip in this track changed" signal at all.
     * Answers arrive as `delta` events.
     */
    | { id?: number; type: 'watchSelection'; on: boolean }
    | { id?: number; type: 'ping' };

  type RequestType = Request['type'];

  // --- server -> client ------------------------------------------------

  type Event =
    | { type: 'status'; lomReady: boolean }
    | {
        type: 'snapshot';
        id?: number;
        /** JSON.stringify + Dict.parse inside v8, ms. */
        dictMs: number;
        /** Max.getDict() on the Node side, ms. */
        hostMs: number;
        data: Snapshot;
        /**
         * The derived layer, always. A client never runs `derive()` itself.
         *
         * On the event rather than inside `Snapshot` because `Snapshot` is
         * built in `lom.ts`, which cannot import and so cannot compile a
         * pattern. The split is honest anyway: the snapshot is what Live holds,
         * the model is what we read it as.
         */
        model: SetModel;
        /**
         * True when this came from the bridge's held state and cost no LOM walk
         * at all — the normal answer for a client joining an already-running
         * bridge. `data.ms` and `timings` then describe the walk it was
         * *originally* read from, which is why this flag exists rather than
         * leaving a reader to conclude the LOM got faster.
         */
        cached: boolean;
      }
    | { type: 'progress'; id?: number; done: number; total: number }
    | {
        type: 'applied';
        id?: number;
        lomMs: number;
        applied: number;
        skipped: number;
        total: number;
      }
    | ({ type: 'scenesAdded'; id?: number; lomMs: number } & ScenesAddedResult)
    /**
     * A move finished. Carries what it did rather than an `ok`, because the
     * caller has no other way to find out — the scenes it names no longer exist
     * at the indexes it sent, and only a re-snapshot can say what's there now.
     */
    | {
        type: 'moved';
        id?: number;
        lomMs: number;
        /** Scenes created, clips copied, scenes deleted. */
        created: number;
        copied: number;
        removed: number;
        /**
         * Slots that raised and were skipped. **Non-zero means the set is not
         * what was planned** — some clips didn't make it across, and the
         * originals are already gone.
         */
        failed: number;
        /** Whether Live accepted `begin_undo_step` — see `bridge/LOM.md`. */
        undoStep: boolean;
      }
    /**
     * Clips finished moving. Carries counts rather than an `ok` for the same
     * reason `moved` does — and `failed` matters more here than anywhere else:
     * **non-zero means the originals were not deleted**, so the set holds both
     * copies and is not what was asked for, but nothing has been lost.
     */
    | {
        type: 'clipsMoved';
        id?: number;
        lomMs: number;
        copied: number;
        removed: number;
        failed: number;
        /** Whether Live accepted `begin_undo_step` — see `bridge/LOM.md`. */
        undoStep: boolean;
      }
    | { type: 'palette'; id?: number; count: number; colors: number[] }
    | { type: 'setConfigSaved'; id?: number; defaultArtist: string; roleCount: number }
    | { type: 'allowedColorsSaved'; id?: number; colors: number[] | null }
    /** The state restored from the device, and every later persisted revision. */
    | { type: 'deviceState'; state: DeviceState }
    | {
        type: 'playState';
        isPlaying: boolean;
        /** Indexed by track, in the same `i` space as `Snapshot.tracks`. */
        tracks: TrackPlayState[];
      }
    | {
        type: 'meterLevels';
        frame: MeterFrame;
      }
    | {
        type: 'clipStatus';
        frame: ClipStatusFrame;
      }
    | { type: 'mixerState'; state: MixerState }
    | {
        type: 'songPosition';
        /** First three fields of Live's bars.beats.sixteenths.ticks value. */
        bar: number;
        beat: number;
        sixteenth: number;
      }
    | { type: 'transportState'; state: TransportState }
    | { type: 'changed'; kind: string }
    /**
     * Someone changed the set in Live and we re-read the affected tracks.
     * Broadcast, never a reply — nothing asked for it.
     */
    /**
     * `model` rides along only when the delta changed the mapping — a scene
     * rename or a retempo. A clip-only delta leaves every song exactly as it
     * was, and re-sending the whole song list to say so is the chatty design
     * the coarse-grained rule exists to prevent.
     */
    | { type: 'delta'; data: SnapshotDelta; model?: SetModel }
    | { type: 'reload' }
    | { type: 'pong'; id?: number }
    | { type: 'error'; id?: number; message: string };

  type EventType = Event['type'];
  type EventOf<K extends EventType> = Extract<Event, { type: K }>;
}
