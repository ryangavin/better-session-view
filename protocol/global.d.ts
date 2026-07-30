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
  }

  interface Scene {
    i: number;
    name: string;
    color: number;
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

  // --- mutation --------------------------------------------------------

  interface ApplyOp {
    t: number;
    s: number;
    name?: string;
    colorIndex?: number;
  }

  interface ApplyResult {
    applied: number;
    skipped: number;
    total: number;
  }

  // --- client -> server ------------------------------------------------

  type Request =
    | { id?: number; type: 'snapshot' }
    | { id?: number; type: 'apply'; ops: ApplyOp[] }
    | { id?: number; type: 'palette' }
    | { id?: number; type: 'observe'; on: boolean }
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
    | { type: 'palette'; id?: number; count: number; colors: number[] }
    | { type: 'paletteUpdated' }
    | { type: 'changed'; kind: string }
    | { type: 'reload' }
    | { type: 'pong'; id?: number }
    | { type: 'error'; id?: number; message: string };

  type EventType = Event['type'];
  type EventOf<K extends EventType> = Extract<Event, { type: K }>;
}
