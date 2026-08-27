// Single source of truth for the wire protocol.
//
// Declared as a GLOBAL namespace rather than a module on purpose: `lom.js` is
// compiled with `module: "none"` (Max's v8 object needs message handlers as
// top-level globals, so no module wrapper is allowed) and `bridge.ts` emits to
// a flat CommonJS file outside its own rootDir. Neither can `import`.
// `protocol/index.ts` re-exports these as normal types for set/ and core/.

declare namespace OpenFlow {
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
    /**
     * Wall clock from request to publish, including every gap the walk gave
     * back to Live.
     *
     * The four phases above are **LOM work** and stay comparable to what they
     * measured when the walk was one synchronous loop. This is what the caller
     * waited. `elapsed - (tracks + scenes + slots + clips)` is therefore the
     * time Live spent free to redraw, which is the whole point of chunking and
     * the number to look at when tuning `SNAP_CHUNK`.
     */
    elapsed: number;
    /**
     * How many times the walk started over because the set restructured under
     * it. Normally 0; anything else means someone was editing while it read.
     */
    restarts: number;
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
     * re-read, the other is what the columns themselves are called. The
     * don't-overload-a-DAW-word rule in `AGENTS.md` is about Live's vocabulary,
     * but the same trap is the reason.
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
    /**
     * Total LOM work, ms — the four phases summed, and **not** how long the
     * caller waited. The walk yields between chunks so Live stays responsive;
     * `timings.elapsed` is the wall clock across those gaps.
     */
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
     *
     * **There is deliberately no rendered `tempo` string beside `bpm` here.**
     * Collapsing a song's scene tempos to `128 / 130` says two scenes disagree
     * and stops; under this convention that is the normal shape of a song that
     * speeds up, and the useful questions are what it is *entered* at and which
     * scenes change it. This field and `tempoScenes` answer both.
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
   * What one scene's own name states, over and above the song it belongs to.
   *
   * Every field is absent rather than empty when the name doesn't say, for the
   * reason `SongEntry` gives about -1: a field that can be missing and encodes
   * it as `''` is a bug waiting to look like data. A scene that states nothing
   * has no entry at all.
   *
   * **This is the mapping at scene resolution, and it is here so that it is
   * read once.** `derive()` already reads all three off the name; `SetModel`
   * used to discard them, which left every client that wanted a scene's role
   * writing a regex of its own — the bridge for Push, the grid, the visuals
   * rig, and each answer free to drift from the naming convention the moment it
   * changed. A client asking what a scene is now gets told.
   */
  interface SceneFacts {
    /** The `[role]` tag, in the case the set spells it. */
    role?: string;
    /**
     * The musical key this scene states, which its song may not.
     *
     * A song whose scenes disagree renders `SongEntry.key` as the collection
     * `Bm / D`, so a client showing where a song modulates has to read the
     * scenes — this is that reading, done once.
     */
    key?: string;
    /** The bpm label this scene states. Same story as `key`. */
    bpm?: string;
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
    /**
     * Scene index → what that scene's own name states. Absent for a scene that
     * states nothing, so this is normally far smaller than the set.
     *
     * Keyed the same way and for the same reason as `songByScene`: it crosses
     * the wire as JSON, and `JSON.stringify` writes a numeric key as a string
     * whatever the map was.
     */
    factsByScene: Record<string, SceneFacts>;
    /** Scene indexes whose names match no pattern at all. */
    unmapped: number[];
  }

  /**
   * One note in a MIDI clip, as `Clip.get_all_notes_extended` reports it.
   *
   * Three fields of the nine Live offers. The rest — velocity, probability,
   * release velocity — say how a note *sounds*, and nothing that reads these is
   * asking that; a chord is spelled by which pitches are held and for how long.
   * Muted notes are dropped in `lom.ts` rather than carried with a flag, since
   * a note that does not sound is not part of the harmony.
   */
  interface ClipNote {
    /** MIDI note number, 0–127, 60 is C3. */
    pitch: number;
    /** Beats from the start of the clip. */
    start: number;
    /** Length in beats. */
    duration: number;
  }

  /**
   * One clip's notes, and what the track plays them through.
   *
   * `instrument` rides along rather than being a second request, and that is
   * the coarse-grained rule rather than a shortcut: `lom.ts` is already at that
   * track to read the clip, and a reader that has to ask "is this drums?"
   * separately would send one message per playing track every time a scene
   * fired. It is the raw `Device.class_name` — `DrumGroupDevice`, `Operator`,
   * `PluginDevice` — because deciding what a class *means* belongs in `core/`
   * where it can be tested, not on the wire.
   */
  interface ClipNotes {
    t: number;
    s: number;
    /** `Device.class_name` of the track's first instrument; `''` when it has none. */
    instrument: string;
    /** Empty for an audio clip, which has no notes to read at all. */
    notes: ClipNote[];
    /**
     * Why the notes could not be read. **Absent on success**, and absent for an
     * audio clip, which has no notes rather than unreadable ones.
     *
     * Exists because the alternative is indistinguishable from silence. An
     * empty note list is the right failure — it draws no chart rather than a
     * wrong one — but "this clip has no chords in it" and "this read did not
     * work" look identical to every reader, and only one of them is a bug. The
     * Max window says the same thing; this is the half a client can act on.
     */
    problem?: string;
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

  /**
   * One control on a device, as Live's `DeviceParameter` describes it.
   *
   * **Everything here except `value`, `display` and `state` is fixed for as
   * long as the device exists**, which is what makes a parameter subscription
   * affordable. The fixed half is read once when a device opens and travels
   * with `ChainDevice.parameters`; the three that move arrive afterwards as
   * `ChainValueChange`, and only for the parameters that actually moved.
   *
   * Close cousin of `MixerParameterState`, which is the same LOM class read for
   * the mixer strip. They should converge; they haven't yet because unifying
   * them means touching a shipped path for no behaviour.
   */
  interface DeviceParameterState {
    /** `DeviceParameter.name` — the short name, as in the automation chooser. */
    name: string;
    value: number;
    min: number;
    max: number;
    /**
     * `DeviceParameter.default_value`, and **absent when `quantized`** — Live
     * only exposes a default for continuous parameters, so a quantized control
     * has nothing to reset to and must not draw a reset affordance.
     */
    defaultValue?: number;
    /**
     * `DeviceParameter.is_quantized` — 1 for booleans and enums, 0 for
     * int/float. **Not a reliable guide to how a control should feel:** Live's
     * own docs name `MidiPitch.Pitch` as a parameter that looks stepped to the
     * user and answers 0. What it does decide is which of `defaultValue` and
     * `items` exists.
     */
    quantized: boolean;
    /** `DeviceParameter.value_items`. Present only when `quantized`. */
    items?: string[];
    /** Live's own spelling of the current value, via `str_for_value`. */
    display: string;
    /**
     * `DeviceParameter.state` — 0 active, 1 changeable but inaudible, 2 cannot
     * be changed.
     *
     * This rather than `is_enabled`, which answers a coarser version of the
     * same question and **has no observer at all**. Read on the structural
     * re-read rather than watched, so a parameter that becomes macro-controlled
     * greys out on the next chain change rather than immediately — one observer
     * per parameter is the budget this tier is already spending, and doubling
     * it for a property that moves once an hour isn't the trade.
     */
    state: number;
  }

  /**
   * One device in a track's chain, as much of it as a shell can draw.
   *
   * Deliberately not the whole device. `widgets/` draws a device shell from a
   * name, an on state and a fold state, and that is exactly what this carries —
   * no parameters, no faceplate. Parameters are a far larger read (one
   * `DeviceParameter` per control, per device) and land here as a field when
   * they land, not as a redesign of this.
   *
   * **Not `DeviceState`.** That one is this Max device's own stored
   * configuration and has nothing to do with Live's devices.
   */
  interface ChainDevice {
    /** `Device.name` — what the user called it, which needn't be its class. */
    name: string;
    /** `Device.class_name`, e.g. `Eq8`, `AudioEffectGroupDevice`. */
    className: string;
    /** `Device.is_active` — Live's device activator. */
    on: boolean;
    /** `Device.View.is_collapsed`. */
    folded: boolean;
    /**
     * A rack's chains, each a device run of its own. Absent on every device
     * that isn't a rack, which is most of them.
     */
    chains?: RackChain[];
    /**
     * Every control on the device, **present only while it is open** — that is,
     * while its index is in the subscription's `open` list.
     *
     * Absent is therefore "nobody has this device expanded", not "this device
     * has no controls". A folded device drops this and the ~40 observers behind
     * it, which is the entire economy of the parameter tier.
     */
    parameters?: DeviceParameterState[];
  }

  /**
   * One chain inside a rack — a device run with a name of its own.
   *
   * **`devices` is absent unless that chain is itself subscribed to.** A rack
   * reports what it takes to draw its chain list and stops there; what is
   * inside a chain arrives as a `WatchedChain` of its own, addressed by the
   * `path` that names it. Following every chain of every rack instead is the
   * cost the whole subscription model exists to avoid.
   *
   * Absent and empty therefore mean different things, as they do throughout
   * this protocol: absent is "nobody is looking in here", `[]` is "this chain
   * is genuinely bare". A client that drew the empty case for the first would
   * show every unopened rack as containing nothing.
   */
  interface RackChain {
    name: string;
    devices?: ChainDevice[];
  }

  /**
   * One device run a client is looking at, and which of its devices are open.
   *
   * **The first watch in this protocol with a target.** Every other one is a
   * boolean per kind, refcounted across clients in one set each, because arming
   * `watchPlay` costs the same whoever asked. This one's cost is entirely a
   * function of *what* is being watched — a run of shells is a couple of
   * observers per device, and one open EQ Eight is forty more — so the bridge
   * unions what every client declared and the LOM side follows the union. See
   * `core/src/chainWatch.ts`, where that arithmetic lives and is tested.
   *
   * A device has no id on the wire, so a run is addressed the way a clip is: by
   * where it sits. `path` is empty for a track's own device list and indexes
   * into racks from there.
   */
  interface ChainWatch {
    t: number;
    /**
     * `[]` for the track's own run; otherwise **pairs** of device index and
     * chain index — `[2, 0]` is the first chain of the rack at index 2, and a
     * rack inside that chain adds two more. An odd length names half an
     * address and is refused rather than truncated.
     */
    path: number[];
    /**
     * Indexes in that run whose parameters are wanted; everything else is drawn
     * as a shell. A list rather than a flag because the panel shows one run with
     * several devices open in it, and folding one shut must drop its parameters
     * without dropping the run.
     */
    open: number[];
  }

  /** One watched device run, as the shell tier draws it. */
  interface WatchedChain {
    t: number;
    path: number[];
    /**
     * **Null means the run no longer resolves** — a deleted rack, or a track
     * that has gone. Distinct from `[]`, which means the run is there and holds
     * no devices. Collapsing the two is how a rack that was deleted goes on
     * being drawn.
     */
    devices: ChainDevice[] | null;
  }

  /**
   * One parameter that moved, addressed all the way down.
   *
   * Sent per *change* rather than as a whole-device frame, because the observer
   * fires per parameter and a knob drag would otherwise re-send forty values to
   * report one. Batched per tick, so a drag costs one message a frame however
   * many parameters it crosses.
   */
  interface ChainValueChange {
    t: number;
    /** The run, as in `ChainWatch.path`. */
    path: number[];
    /** Index of the device within that run. */
    i: number;
    /** Index of the parameter within that device's `parameters`. */
    p: number;
    value: number;
    display: string;
  }

  /**
   * Every run anyone is watching, pushed as one unit.
   *
   * Broadcast rather than addressed, like `mixerState`: the bridge watches the
   * union, so what arrives is everything being watched and not merely what this
   * client asked for. A client picks its own runs back out by `(t, path)`.
   */
  interface ChainState {
    chains: WatchedChain[];
  }

  /**
   * One device, addressed the way a run is.
   *
   * The same `(t, path)` a `ChainWatch` carries, plus which device in that run
   * — so a write names exactly what the client is already looking at, and the
   * bridge needs no id it would have to invent and keep.
   */
  interface DeviceTarget {
    t: number;
    /** Pairs, exactly as in `ChainWatch.path`. `[]` is the track's own run. */
    path: number[];
    /** Index of the device within that run. */
    i: number;
  }

  /**
   * One device write. Related fields travel together, as everywhere else here.
   *
   * `folded` is the field with a second life: it is a view state on Live's
   * side, and on this side it is what decides whether the device's parameters
   * are read and observed at all. Unfolding a device in the app is therefore
   * the same gesture as subscribing to its controls, which is why there is no
   * separate way to ask for them.
   */
  interface DevicePatch {
    /** `Device.is_active` — the activator in the title bar. */
    on?: boolean;
    /** `Device.View.is_collapsed`. */
    folded?: boolean;
    /**
     * One control, by its index in `ChainDevice.parameters`.
     *
     * Singular because a gesture moves one control, the same bargain
     * `MixerPatch.send` makes. A face that wants two writes sends two.
     */
    param?: { p: number; value: number };
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
    /** Complete rendered scene name, including an optional `@bpm-key` prefix. */
    name: string;
    /** Scene RGB. Omitted leaves Live's new scenes uncolored. */
    color?: number;
    /**
     * Scene.tempo, on **every** created scene. Omitted leaves them following
     * the Live Set tempo, and the app always omits it: one tempo across all
     * eight scenes is the every-scene convention that made mixing into a song
     * impossible. A new song states its bpm in its name, and projecting that
     * onto the song's first scene is a separate write — `songTempoOps`.
     */
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

  // `launch`, `stop`, `selectScene`, `setFold`, `setTransport`, `setMixer`, `setDevice`,
  // and the watches
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
     * Nothing in `set/` sends this — `tools/diag.ts` does.
     */
    | { id?: number; type: 'diag'; what: string; arg?: number }
    /**
     * Replace the set's naming defaults and role definitions as one form.
     *
     * `writeSceneTempo` is optional so an older UI can still save the rest of
     * the form; omitted leaves whatever the device already stored rather than
     * turning a playback-affecting setting off behind the user's back.
     */
    | {
        id?: number;
        type: 'saveSetConfig';
        defaultArtist: string;
        roles: Role[];
        writeSceneTempo?: boolean;
      }
    | { id?: number; type: 'saveAllowedColors'; colors: number[] | null }
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
    /**
     * Select an exact track, so Live's own device view follows the one whose
     * chain we're showing. The same bargain `selectScene` makes.
     */
    | { id?: number; type: 'selectTrack'; t: number }
    | { id?: number; type: 'launch'; target: LaunchTarget }
    | { id?: number; type: 'stop'; target: StopTarget }
    /** Write any related subset of Live's control-bar settings in one operation. */
    | { id?: number; type: 'setTransport'; patch: TransportPatch }
    /** Write one track or Master mixer strip; observed state is the acknowledgement. */
    | { id?: number; type: 'setMixer'; target: MixerTarget; patch: MixerPatch }
    /**
     * Write one device: its activator, its fold state, or one of its controls.
     *
     * **Acknowledged by the watch, not by a reply.** Every field here is
     * already observed by whoever is subscribed to the run — `is_active` and
     * `is_collapsed` by the shell tier, `value` by the parameter tier — so the
     * answer to "did that land" is the next `chainState` or `chainValues`,
     * which is a better answer than confirming a `set()` was called. It is also
     * the only answer that is right when *another* client made the change.
     *
     * A write to a device nobody is watching is legal and simply goes unheard.
     * That isn't a hole: a client that isn't watching a run has no way to name
     * a device in it, because the address is a position it hasn't been told.
     */
    | { id?: number; type: 'setDevice'; target: DeviceTarget; patch: DevicePatch }
    /**
     * Everything this client is looking at, declared whole.
     *
     * **Not an on/off pair, and deliberately.** Every other watch here is
     * `{ on: boolean }` because there is one thing to be watching; this one has
     * a target, so "off" would have to name which target — and a client that
     * dropped a message would leak a subscription nobody can find to release.
     * Sending the complete current view instead makes an empty array the way to
     * stop, a dropped socket exactly equivalent to sending one, and a client
     * physically unable to release a subscription another client is holding.
     *
     * The bridge unions these across clients; a client never sees, and must
     * never assume, that what it asked for is all that is being watched.
     */
    | { id?: number; type: 'watchChains'; subs: ChainWatch[] }
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
     * Follow the scene launch buttons, one `Scene.is_triggered` per scene.
     *
     * The only way to know a scene was *launched* rather than merely arrived
     * at. Clip follow actions walk the whole grid to the next row without
     * anybody pressing anything, and that is indistinguishable from a launch in
     * `playState` — so a client that needs the gesture, rather than the
     * movement, asks for this instead of inferring it.
     *
     * Costs one observer per scene, so it is its own watch rather than a rider
     * on `watchPlay`: a client that only draws the grid should not pay for it.
     * Re-send on a structural change, as with `watchPlay` and a track count.
     */
    | { id?: number; type: 'watchScenes'; on: boolean }
    /**
     * Read the notes of some clips. A **read**, like `devices`, not a watch.
     *
     * Every clip asked for in one message, because the caller wants the harmony
     * of a whole scene and one-message-per-clip is precisely the chatty shape
     * the coarse-grained rule exists to prevent. A slot holding no clip, or an
     * audio clip, comes back with an empty note list rather than being absent —
     * "this clip has no notes" and "you did not ask about this clip" must not
     * look the same to a reader deciding whether the harmony is knowable.
     */
    | { id?: number; type: 'clipNotes'; clips: Array<{ t: number; s: number }> }
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
    | { type: 'clipNotes'; id?: number; clips: ClipNotes[] }
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
    /**
     * The watched device runs changed, or were just subscribed to. Broadcast —
     * see `ChainState` for why it carries the union rather than one client's
     * share of it.
     */
    | { type: 'chainState'; state: ChainState }
    /**
     * Parameters that moved since the last frame. Broadcast, and addressed by
     * `(t, path, i, p)` so a client can ignore runs it isn't drawing.
     *
     * Separate from `chainState` deliberately: shells and descriptors change
     * rarely, values change at gesture rate, and folding them into one message
     * would re-send a chain's whole structure on every knob turn. Same split as
     * `mixerState` against `meterLevels`, for the same reason.
     */
    | { type: 'chainValues'; changes: ChainValueChange[] }
    | {
        type: 'songPosition';
        /** First three fields of Live's bars.beats.sixteenths.ticks value. */
        bar: number;
        beat: number;
        sixteenth: number;
      }
    | { type: 'transportState'; state: TransportState }
    /**
     * Somebody pressed a scene launch button, and the scene has just started.
     *
     * The **landing**, not the press: `Scene.is_triggered` falls when the clips
     * actually begin, on whatever launch quantisation the set uses, so this
     * arrives on a downbeat Live chose rather than on the beat a hand moved.
     * A client wanting the press would need a different event; nothing does.
     *
     * Requires `watchScenes`. Never sent for a follow action, which is the
     * entire point — see the request.
     */
    | { type: 'sceneLaunched'; s: number }
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
    | { type: 'pong'; id?: number }
    | { type: 'error'; id?: number; message: string };

  type EventType = Event['type'];
  type EventOf<K extends EventType> = Extract<Event, { type: K }>;
}
