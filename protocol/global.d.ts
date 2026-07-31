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

  interface Snapshot {
    rev: number;
    /** Total LOM walk, ms. */
    ms: number;
    timings: SnapshotTimings;
    tempo: number;
    trackCount: number;
    sceneCount: number;
    clipCount: number;
    tracks: Track[];
    scenes: Scene[];
    clips: Clip[];
  }

  interface Palette {
    count: number;
    colors: number[];
  }

  // --- playback --------------------------------------------------------

  /** Something that can be fired. */
  type LaunchTarget =
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
   * play state costs two reads per track instead of two per slot, which at
   * full size is the difference between ~80 observers and ~68,000. Nothing
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
   * Reordering scenes — the only structural write in the protocol, and the only
   * one our own undo cannot reverse.
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

  /** A role a scene can be marked with, and the palette slot it colors with. */
  interface Role {
    name: string;
    /** Slot in Live's palette, or -1 when the role has no color yet. */
    colorIndex: number;
  }

  interface ApplyResult {
    applied: number;
    skipped: number;
    total: number;
  }

  // --- client -> server ------------------------------------------------

  // `launch`, `stop` and `watchPlay` deliberately have no terminal reply. What
  // you want back from firing a clip is not an acknowledgement, it's the play
  // state changing — which arrives as an unsolicited `playState`. A failure
  // still surfaces: the bridge broadcasts an `error` with no id.
  type Request =
    | { id?: number; type: 'snapshot' }
    /**
     * One batch, both kinds of target. Clip and scene writes travel together so
     * "tag these scenes and recolor their clips" stays one operation with one
     * progress count and one reverse batch — splitting it would give undo two
     * halves that can succeed independently.
     */
    | { id?: number; type: 'apply'; ops: ApplyOp[]; sceneOps?: SceneOp[] }
    /**
     * Reorder scenes. Deliberately **not** a variant of `apply`: `apply` writes
     * fields on things that already exist and is fully reversible from a
     * snapshot, while this creates and destroys scenes and is not. Sharing the
     * message would let a caller reach the destructive path by filling in one
     * more optional field.
     */
    | { id?: number; type: 'move'; plan: MovePlan }
    | { id?: number; type: 'palette' }
    /**
     * Replace the whole role vocabulary. Coarse-grained like everything else:
     * the list is a dozen entries, so there is no per-role message.
     */
    | { id?: number; type: 'saveRoles'; roles: Role[] }
    | { id?: number; type: 'observe'; on: boolean }
    | { id?: number; type: 'launch'; target: LaunchTarget }
    | { id?: number; type: 'stop'; target: StopTarget }
    | { id?: number; type: 'watchPlay'; on: boolean }
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
    | { type: 'palette'; id?: number; count: number; colors: number[] }
    | { type: 'paletteUpdated' }
    | { type: 'rolesSaved'; id?: number; count: number }
    | {
        type: 'playState';
        isPlaying: boolean;
        /** Indexed by track, in the same `i` space as `Snapshot.tracks`. */
        tracks: TrackPlayState[];
      }
    | { type: 'changed'; kind: string }
    | { type: 'reload' }
    | { type: 'pong'; id?: number }
    | { type: 'error'; id?: number; message: string };

  type EventType = Event['type'];
  type EventOf<K extends EventType> = Extract<Event, { type: K }>;
}
