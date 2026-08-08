import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BridgeClient, type ConnectionState } from '../lib/client.js';
import { applyOps, inverseOps } from '../../../core/src/ops.js';
import {
  applySceneOps,
  countUnrevertableColors,
  inverseSceneOps,
  sceneFields,
} from '../../../core/src/roles.js';
import type { SceneMovePlan } from '../../../core/src/sceneMove.js';
import { MIN_INTERVAL_MS, shouldWalk, STALE_MS } from '../../../core/src/backstop.js';
import { canApplyDelta, mergeRows, mergeTrackDelta } from '../../../core/src/snapshotDelta.js';
import { applyClipMove, type ClipMovePlan } from '../../../core/src/clipMove.js';
import { LIVE_PALETTE } from '../../../core/src/livePalette.js';
import { errText, reportSnapshotTiming } from '../lib/snapshotTiming.js';
import { useLog, type LogLine } from './useLog.js';
import { useDeviceState } from './useDeviceState.js';

/**
 * The part of a plan that goes on the wire. `SceneMovePlan` also carries counts
 * and final positions, which are for the UI to talk about and nothing the bridge
 * needs to be told.
 */
type MovePlanFor = Pick<SceneMovePlan, 'create' | 'steps' | 'remove'>;

/** The same split for a clip drag: the counts stay behind for the UI. */
type ClipMovePlanFor = Pick<ClipMovePlan, 'steps' | 'remove'>;

/**
 * The shared busy/error wrapper — every write path runs inside one of these,
 * so failures land in the log rather than as unhandled rejections.
 */
export type Guard = (label: string, fn: () => Promise<void>) => Promise<void>;

/**
 * What Live is playing. `tracks` is empty until the first `playState` arrives,
 * so `playingIn`/`firedIn` answer "nothing" rather than throwing while the
 * observers are still being installed.
 */
export interface PlayState {
  isPlaying: boolean;
  tracks: BSV.TrackPlayState[];
}

const NOT_PLAYING: PlayState = { isPlaying: false, tracks: [] };

export interface SongPosition {
  bar: number;
  beat: number;
  sixteenth: number;
}

export type MeterListener = (frame: BSV.MeterFrame) => void;

/** One write, of either kind or both. Empty arrays rather than optionals so
 *  every count in here is `ops.length + sceneOps.length` with no branching. */
interface Batch {
  ops: BSV.ApplyOp[];
  sceneOps: BSV.SceneOp[];
}

export interface BridgeState {
  connection: ConnectionState;
  lomReady: boolean;
  snapshot: BSV.Snapshot | null;
  palette: number[];
  /** Set-owned configuration restored from the device's Stored Only parameter. */
  roles: BSV.Role[];
  allowedColors: number[] | null;
  play: PlayState;
  /** Live's observed control-bar settings. Null until the watch reports. */
  transport: BSV.TransportState | null;
  /** Live's arrangement position, or null until its observer has reported. */
  songPosition: SongPosition | null;
  progress: { done: number; total: number } | null;
  log: LogLine[];
  busy: boolean;
  /** True only while the UI is re-reading the set, not during other writes. */
  syncing: boolean;
  /** 1 when the last write can be reversed, 0 otherwise. */
  undoDepth: number;
  refresh: () => Promise<void>;
  apply: (ops: BSV.ApplyOp[], label?: string) => Promise<void>;
  /** Scene-addressed writes — role tags and scene colors. */
  applyScenes: (sceneOps: BSV.SceneOp[], label?: string) => Promise<void>;
  /** Insert and configure blank scenes. Additive, but structural: indexes shift. */
  addScenes: (addition: BSV.SceneAddition, label?: string) => Promise<void>;
  /**
   * Reorder scenes. **The one write with no undo of ours** — it creates and
   * deletes scenes, and a snapshot can't rebuild a deleted one. Clears the undo
   * entry rather than arming it.
   */
  moveScenes: (plan: MovePlanFor, label: string) => Promise<void>;
  /**
   * Move clips around the grid. **Also has no undo of ours** — it overwrites
   * whatever was at the target, and a snapshot can't rebuild an overwritten
   * clip any more than it can a deleted scene. Clears the undo entry.
   */
  moveClips: (plan: ClipMovePlanFor, label: string) => Promise<void>;
  saveRoles: (roles: BSV.Role[]) => Promise<void>;
  setAllowedColors: (colors: number[] | null) => void;
  undo: () => Promise<void>;
  /** Fire something. No await: the answer you want is `play` changing. */
  launch: (target: BSV.LaunchTarget) => void;
  stop: (target: BSV.StopTarget) => void;
  /** Write a related subset of Live's control-bar state in one operation. */
  setTransport: (patch: BSV.TransportPatch) => void;
  /**
   * Fold or unfold a group track in Live. No await, and no reply — the grid
   * has already moved its own columns. See `setFold` in the protocol.
   */
  setFold: (t: number, folded: boolean) => void;
  /**
   * Listen to the high-frequency meter stream without putting it in the
   * composition root's state and re-rendering the entire grid every frame.
   */
  subscribeMeters: (listener: MeterListener) => () => void;
}

/**
 * The React face of the bridge. The separable pieces live in their own hooks —
 * useLog and useDeviceState — and this composes them with the parts
 * that are one cohesive unit: the connection, the snapshot walk, and the
 * apply/undo/moveScenes write path, which all share `guard`, the snapshot ref
 * and the undo entry.
 *
 * **Called once, from `BridgeProvider`, and nowhere else.** It opens a socket
 * and installs observers in Live, so a second caller is a second connection;
 * and the component that calls it is the component a hot update reconnects.
 * Read it through `useBridgeSession()` instead — see BridgeProvider for what
 * calling it from `App` used to cost.
 */
export function useBridge(watchMeters = false): BridgeState {
  const client = useMemo(() => new BridgeClient(), []);
  const { log, say } = useLog();

  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [lomReady, setLomReady] = useState(false);
  const [snapshot, setSnapshot] = useState<BSV.Snapshot | null>(null);
  const [play, setPlay] = useState<PlayState>(NOT_PLAYING);
  const [transport, setTransportState] = useState<BSV.TransportState | null>(null);
  const [songPosition, setSongPosition] = useState<SongPosition | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Both of these are refs rather than dependencies so the socket subscription
  // can be established once. Making it depend on either identity would tear the
  // listener down and rebuild it — and with it every meter subscription — each
  // time a snapshot arrived, which is exactly when it must not.
  const snapshotRef = useRef<BSV.Snapshot | null>(null);
  const resyncRef = useRef<(() => Promise<void>) | null>(null);
  /**
   * Read by the backstop, which must not walk the set on top of a write.
   *
   * Set **synchronously inside `guard`**, not assigned from `busy` during
   * render. Rendering happens a tick later than the call, so a render-assigned
   * ref still reads false for anything that fires in the same tick as the write
   * that set it — which is the whole class of bug this guard exists to prevent.
   */
  const busyRef = useRef(false);
  /**
   * When a walk last succeeded, and when one was last attempted. Both feed
   * `shouldWalk`; see `core/src/backstop.ts` for why only a snapshot may stamp
   * the first of them and a delta may not.
   */
  const lastSnapshotAtRef = useRef<number | null>(null);
  const lastAttemptAtRef = useRef<number | null>(null);
  /** The walk in flight, if there is one. Null between walks. */
  const walkRef = useRef<Promise<void> | null>(null);

  const guard: Guard = useCallback(
    async (label, fn) => {
      busyRef.current = true;
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        say(`${label}: ${errText(e)}`, 'error');
      } finally {
        busyRef.current = false;
        setBusy(false);
        setProgress(null);
      }
    },
    [say],
  );

  const palette = useMemo<number[]>(() => Array.from(LIVE_PALETTE), []);
  const {
    roles,
    allowedColors,
    adoptDeviceState,
    saveRoles,
    setAllowedColors,
  } = useDeviceState(client, guard, say);

  /**
   * A snapshot is the read half shared by manual refreshes and post-write
   * reconciliation. Keep it distinct from `busy`: writes already have local
   * feedback, while this is the operation that needs to cover stale content.
   */
  const whileSyncing = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setSyncing(true);
    setProgress({ done: 0, total: 100 });
    try {
      return await fn();
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  }, []);

  useEffect(() => {
    const off = client.subscribe((event) => {
      switch (event.type) {
        case 'status':
          setConnection(client.state);
          setLomReady(event.lomReady);
          // A dropped socket says nothing about what Live is doing, but we stop
          // hearing about it — so show nothing rather than a frozen last frame.
          if (!event.lomReady) {
            setPlay(NOT_PLAYING);
            setSongPosition(null);
            setTransportState(null);
          }
          break;
        case 'playState':
          setPlay({ isPlaying: event.isPlaying, tracks: event.tracks });
          break;
        // The output meters subscribe to this stream directly. Putting 30 Hz
        // frames in this hook's state would re-render App and the whole grid.
        case 'meterLevels':
          break;
        case 'songPosition':
          setSongPosition({
            bar: event.bar,
            beat: event.beat,
            sixteenth: event.sixteenth,
          });
          break;
        case 'transportState':
          setTransportState(event.state);
          break;
        case 'progress':
          setProgress({ done: event.done, total: event.total });
          break;
        // Structural: a track or scene was added, removed or reordered, so
        // every index means something different now. Nothing can be patched —
        // re-walk. `moved` and the write kinds are our own doing and already
        // reconciled locally, so re-walking for those would be a second full
        // read of a set we just wrote.
        case 'changed':
          say(`Live set changed (${event.kind})`);
          if (event.kind === 'structure') void resyncRef.current?.();
          break;
        // A partial re-read from Live. `prevRev` is the guard: a delta rewrites
        // only its own scope, so applying one to any state but the exact one it
        // was computed against would splice two different revisions of the set
        // together. A mismatch means a message was missed, and the answer to
        // that is a full walk, not a retry.
        case 'delta': {
          const held = snapshotRef.current;
          if (!held) break;
          if (!canApplyDelta(held.rev, event.data.prevRev)) {
            say('missed an update from Live — re-reading the set', 'info');
            void resyncRef.current?.();
            break;
          }
          const d = event.data;
          const clips = mergeTrackDelta(held.clips, d.clipScope, d.clips);
          // Rows upsert by index; clips replace by scope. The two merges differ
          // because a clip can vanish from a track and a scene cannot — see
          // `mergeRows` in core/ for the argument, which is worth reading before
          // "simplifying" them into one.
          setSnapshot({
            ...held,
            rev: d.rev,
            clips,
            clipCount: clips.length,
            scenes: mergeRows(held.scenes, d.sceneRows ?? []),
            tracks: mergeRows(held.tracks, d.trackRows ?? []),
            tempo: d.tempo ?? held.tempo,
          });
          break;
        }
        case 'deviceState':
          adoptDeviceState(event.state);
          break;
        case 'reload':
          location.reload();
          break;
        case 'error':
          say(event.message || 'bridge reported an error with no message', 'error');
          break;
      }
    });
    client.connect();
    return () => {
      off();
      client.close();
    };
  }, [adoptDeviceState, client, say]);

  // Play-state observers are installed per track, so a set that gained or lost
  // one leaves them stale — re-arm on every snapshot rather than only once.
  // Keyed on trackCount and not the snapshot object because `apply` re-snapshots
  // and would otherwise tear down 80 observers after every rename.
  const trackCount = snapshot?.trackCount;
  useEffect(() => {
    if (!lomReady || trackCount === undefined) return;
    client.send({ type: 'watchPlay', on: true });
    return () => client.send({ type: 'watchPlay', on: false });
  }, [client, lomReady, trackCount]);

  // Meters are more expensive and only useful while their footer is visible.
  // Like play state, their observer list is track-addressed and must be rebuilt
  // when a snapshot discovers a different track count.
  useEffect(() => {
    if (!lomReady || trackCount === undefined || !watchMeters) return;
    client.send({ type: 'watchMeters', on: true });
    return () => client.send({ type: 'watchMeters', on: false });
  }, [client, lomReady, trackCount, watchMeters]);

  // Follow what the user does in Live. Two things, and they cover different
  // failures: `observe` reports structural changes (a track or scene added,
  // removed or reordered), and `watchSelection` re-reads the tracks the Session
  // cursor touches, which is how a clip dragged in Live reaches the grid.
  //
  // Not keyed on trackCount, unlike the play and meter watchers. Those install
  // an observer per track and go stale when the count changes; these watch
  // `live_set` and `live_set view`, which are the same two objects however many
  // tracks there are.
  useEffect(() => {
    if (!lomReady) return;
    client.send({ type: 'observe', on: true });
    client.send({ type: 'watchSelection', on: true });
    client.send({ type: 'watchTransport', on: true });
    return () => {
      client.send({ type: 'watchTransport', on: false });
      client.send({ type: 'watchSelection', on: false });
      client.send({ type: 'observe', on: false });
    };
  }, [client, lomReady]);

  // The backstop, for what no observer can report: properties Live exposes with
  // no `observe` at all — `Clip.length`, `Track.fold_state` — plus another M4L
  // device or a remote script. Nothing announces those, so the only way to find
  // out is to look.
  //
  // **Coming back to the window is the moment to ask, not the reason.** This
  // walked on every focus, which spent ~950ms of Live's main thread per alt-tab
  // to answer a question that is almost always "nothing changed". `shouldWalk`
  // asks the question that actually matches the job — how old is what I hold —
  // and it lives in core/ with tests rather than as two constants in a hook.
  useEffect(() => {
    if (!lomReady) return;
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      // Never walk on top of a write. It reconciles or re-reads on its own, and
      // a snapshot taken mid-`apply` would read a half-written set.
      if (busyRef.current) return;
      const stale = shouldWalk({
        now: Date.now(),
        lastSnapshotAt: lastSnapshotAtRef.current,
        lastAttemptAt: lastAttemptAtRef.current,
        staleMs: STALE_MS,
        minIntervalMs: MIN_INTERVAL_MS,
      });
      if (!stale) return;
      void resyncRef.current?.();
    };
    // Both, because they catch different things — `visibilitychange` covers a
    // minimised or hidden tab, `focus` covers switching windows on the same
    // desktop. They also both fire on one alt-tab, which used to mean two
    // walks; now the first stamps `lastAttemptAt` and the second is refused.
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [lomReady]);

  const subscribeMeters = useCallback(
    (listener: MeterListener) =>
      client.subscribe((event) => {
        if (event.type === 'meterLevels') listener(event.frame);
        // A frozen level looks live. Clear it as soon as the source disappears.
        if (event.type === 'status' && !event.lomReady) {
          listener({ master: 0, tracks: [] });
        }
      }),
    [client],
  );

  const launch = useCallback(
    (target: BSV.LaunchTarget) => client.send({ type: 'launch', target }),
    [client],
  );

  const stop = useCallback(
    (target: BSV.StopTarget) => client.send({ type: 'stop', target }),
    [client],
  );

  const setTransport = useCallback(
    (patch: BSV.TransportPatch) => client.send({ type: 'setTransport', patch }),
    [client],
  );

  const setFold = useCallback(
    (t: number, folded: boolean) => client.send({ type: 'setFold', t, folded }),
    [client],
  );

  const refresh = useCallback(
    () =>
      guard('snapshot', async () => {
        lastAttemptAtRef.current = Date.now();
        await whileSyncing(async () => {
          const e = await client.request({ type: 'snapshot' });
          const wire = client.lastWireTiming;
          const commitStart = performance.now();
          setSnapshot(e.data);
          lastSnapshotAtRef.current = Date.now();
          // Queued after React's commit, so it captures render cost too.
          requestAnimationFrame(() => {
            reportSnapshotTiming(e, wire, performance.now() - commitStart);
          });
          say(
            `snapshot — ${e.data.clipCount} clips · ${e.data.ms}ms lom` +
              (wire ? ` · ${Math.round(wire.totalMs)}ms end-to-end` : ''),
            'ok',
          );
        });
      }),
    [client, guard, say, whileSyncing],
  );

  /** Tried once this session — a failed walk must not become a retry loop. */
  const autoWalkedRef = useRef(false);

  /**
   * Walk the set as soon as there is something to walk.
   *
   * Pressing **Snapshot** was the first thing anyone did every time, so it was
   * a button that existed only to be pressed. It stays, for re-walking after a
   * change made in Live.
   *
   * Fires once per *session*, not once per readiness, and the ref is what makes
   * that true. `snapshot === null` alone covers the happy path, but a walk that
   * **fails** leaves it null with `lomReady` still true, so this effect would
   * re-run and try again forever — hammering the LOM with the walk that just
   * broke. One attempt, then the failure stands and the button is right there.
   */
  useEffect(() => {
    if (!lomReady || autoWalkedRef.current || snapshot !== null) return;
    autoWalkedRef.current = true;
    void refresh();
  }, [lomReady, refresh, snapshot]);

  // One level of undo, captured from the snapshot rather than from Live. LOM
  // writes don't participate in Live's own history, so ⌘Z in Live will not bring
  // a rename back — this is the only way back there is. Deliberately one level:
  // a stack would need to survive the re-snapshot after every write, and a stale
  // entry that quietly restores the wrong thing is worse than no stack.
  snapshotRef.current = snapshot;
  const [undoDepth, setUndoDepth] = useState(0);
  const undoRef = useRef<{ batch: Batch; label: string } | null>(null);

  const size = (b: Batch) => b.ops.length + b.sceneOps.length;

  // Refs, not deps, for both of these: `write` is handed down to memoized
  // components, and an identity that changes when the palette arrives would
  // re-render the grid for a value it only reads inside an await.
  const paletteRef = useRef<number[]>([]);
  paletteRef.current = palette;

  /**
   * Re-read the whole set. The honest answer to any write, and the expensive
   * one — a full walk is tens of thousands of LOM reads, so it's the fallback
   * rather than the routine.
   */
  const resync = useCallback((): Promise<void> => {
    // **Join, don't drop.** Three of the callers are fire-and-forget and would
    // be happy either way, but `write` and the move paths *await* this because
    // they need state they can trust afterwards — dropping the call would hand
    // them back a stale snapshot with no indication anything was skipped.
    if (walkRef.current) return walkRef.current;
    const run = async () => {
      lastAttemptAtRef.current = Date.now();
      try {
        await whileSyncing(async () => {
          const s = await client.request({ type: 'snapshot' });
          setSnapshot(s.data);
          lastSnapshotAtRef.current = Date.now();
        });
      } catch (e) {
        // Reported here rather than thrown. Three callers reach this as a bare
        // `void resyncRef.current?.()` — outside `guard`, outside any `catch` —
        // so a throw was an unhandled rejection and a walk that failed silently.
        // Labelled `snapshot` rather than borrowing the caller's label, because
        // "apply failed" would be a lie about which half broke.
        say(`snapshot: ${errText(e)}`, 'error');
      }
    };
    // `.finally` always defers, so the assignment below wins the race even if
    // `run()` were to settle without ever suspending.
    const p = run().finally(() => {
      walkRef.current = null;
    });
    walkRef.current = p;
    return p;
  }, [client, say, whileSyncing]);
  resyncRef.current = resync;

  /**
   * The snapshot as it reads once `batch` has landed, or `null` when we can't
   * work it out and the set has to be re-read instead.
   *
   * Every write used to be followed by a full walk, because a snapshot was the
   * only thing that ever set this state. That's a lot of Live to re-read in
   * order to learn that four scenes are now called what we just named them.
   *
   * `null` for the cases where the arithmetic would be guessing:
   *
   * - **Nothing to update yet.** No snapshot means no local copy to patch.
   * - **A color slot we have no RGB for.** A clip's color goes to Live as an
   *   index but is drawn from RGB, so an unresolvable slot would leave the grid
   *   showing the old color against the new index. The palette is derived
   *   before the first walk, so this is close to unreachable.
   *
   * The caller adds the one that matters most: Live has to have taken *every*
   * op. It answers with counts and not with which ops it skipped, so a partial
   * write can't be reproduced here and doesn't try to be.
   */
  const reconcile = useCallback((batch: Batch): BSV.Snapshot | null => {
    const s = snapshotRef.current;
    if (!s) return null;
    const rgb = paletteRef.current;
    for (const op of batch.ops) {
      if (op.colorIndex !== undefined && rgb[op.colorIndex] === undefined) return null;
    }
    return {
      ...s,
      clips: applyOps(s.clips, batch.ops, (i) => rgb[i]),
      scenes: applySceneOps(s.scenes, batch.sceneOps),
    };
  }, []);

  const write = useCallback(
    (batch: Batch, label: string, reverse: { batch: Batch; label: string } | null) =>
      guard(label, async () => {
        const sent = batch.ops.length + batch.sceneOps.length;
        if (sent === 0) {
          say(`${label} — nothing to write`, 'ok');
          return;
        }
        const e = await client.request({
          type: 'apply',
          ops: batch.ops,
          sceneOps: batch.sceneOps,
        });
        undoRef.current = reverse;
        setUndoDepth(reverse && size(reverse.batch) > 0 ? 1 : 0);
        // Report what we sent alongside what Live did with it. "0 written of 1
        // sent" is a very different bug from "0 written of 0 sent", and without
        // the sent count the two look identical.
        const short = e.applied + e.skipped < sent;
        say(
          `${label} — ${e.applied} written, ${e.skipped} skipped of ${sent} sent` +
            ` in ${e.lomMs}ms`,
          short ? 'error' : 'ok',
        );
        // Everything landed, so we already know what the set says — patch the
        // copy in hand rather than walking Live to be told what we just wrote.
        // Anything less than everything and we don't know *which* op missed, so
        // the walk is the only way to find out.
        const next = e.applied === sent ? reconcile(batch) : null;
        if (next) setSnapshot(next);
        else await resync();
      }),
    [client, guard, reconcile, resync, say],
  );

  const apply = useCallback(
    (ops: BSV.ApplyOp[], label = 'apply') => {
      const before = snapshotRef.current?.clips ?? [];
      const back = inverseOps(before, ops);
      return write({ ops, sceneOps: [] }, label, {
        batch: { ops: back, sceneOps: [] },
        label: `undo ${label}`,
      });
    },
    [write],
  );

  const applyScenes = useCallback(
    (sceneOps: BSV.SceneOp[], label = 'scenes') => {
      const before = sceneFields(snapshotRef.current?.scenes ?? []);
      const back = inverseSceneOps(before, sceneOps);
      // Live gives us no way to write "no color", so a scene that had none
      // can't be put back to having none — inverseSceneOps drops that revert
      // rather than painting slot 0 over it. Say so instead of letting the undo
      // button quietly promise more than it delivers.
      const stuck = countUnrevertableColors(before, sceneOps);
      if (stuck > 0) {
        say(
          `${label} — ${stuck} scene${stuck > 1 ? 's' : ''} had no color; Live has ` +
            `no writable "no color", so undo can't take it back off`,
          'info',
        );
      }
      return write({ ops: [], sceneOps }, label, {
        batch: { ops: [], sceneOps: back },
        label: `undo ${label}`,
      });
    },
    [say, write],
  );

  /**
   * Add scenes without touching the delete-capable reorder path.
   *
   * This still clears our undo entry: inserting above an old operation shifts
   * every scene address it captured. Live's grouped history is the only safe
   * reversal because our snapshots deliberately cannot delete scenes.
   */
  const addScenes = useCallback(
    (addition: BSV.SceneAddition, label = 'add scenes') =>
      guard(label, async () => {
        undoRef.current = null;
        setUndoDepth(0);

        const e = await client.request({ type: 'addScenes', addition });
        if (e.failed > 0 || e.configured !== e.created) {
          say(
            `${label} — ${e.created} created, ${e.configured} configured, ` +
              `${e.failed} failed. Check the new rows and the Max window.`,
            'error',
          );
        } else {
          say(
            `${label} — ${e.created} scenes inserted at ${e.from + 1}–${e.to + 1} ` +
              `in ${e.lomMs}ms`,
            'ok',
          );
        }
        say(
          e.undoStep
            ? "the addition is one step in Live's own undo history — ⌘Z in Live, not here"
            : 'Live would not group the addition for undo; our ⌘Z does not delete scenes',
          e.undoStep ? 'info' : 'error',
        );

        // The bridge broadcasts one structural change after the whole run is
        // configured. That drives the re-read for this and every other client.
      }),
    [client, guard, say],
  );

  /**
   * Reorder scenes.
   *
   * **Deliberately not routed through `write`**, and the difference is the whole
   * point. `write` captures a reverse batch and arms the undo button; there is
   * no reverse batch for this. `inverseOps` reads "before" out of the snapshot,
   * which works because a snapshot holds every clip's name and color — it holds
   * nothing that can rebuild a deleted scene's clips.
   *
   * So this **clears** the undo entry rather than replacing it. Leaving the
   * previous one armed would offer a ⌘Z that writes clip names against scene
   * indexes that no longer mean what they meant when it was captured, which is
   * a worse outcome than having no undo at all.
   *
   * The way back is Live's own history, if `begin_undo_step` took — which is
   * unverified, so the log line says which of the two happened rather than
   * assuming.
   */
  const moveScenes = useCallback(
    (plan: MovePlanFor, label: string) =>
      guard(label, async () => {
        undoRef.current = null;
        setUndoDepth(0);

        const e = await client.request({
          type: 'move',
          plan: { create: plan.create, steps: plan.steps, remove: plan.remove },
        });

        if (e.failed > 0) {
          // The originals were kept — lom.ts stops before the delete pass if any
          // copy failed. Say that plainly: the set now holds both copies, and
          // that's a mess the user has to resolve, not something to paper over.
          say(
            `${label} — ${e.failed} operation${e.failed > 1 ? 's' : ''} failed, so the ` +
              `originals were NOT deleted. The set now holds both copies; check the ` +
              `Max window and tidy up in Live.`,
            'error',
          );
        } else {
          say(
            `${label} — ${e.removed} scene${e.removed === 1 ? '' : 's'} moved, ` +
              `${e.copied} clip${e.copied === 1 ? '' : 's'} copied in ${e.lomMs}ms`,
            'ok',
          );
        }
        say(
          e.undoStep
            ? 'this move is one step in Live\'s own undo history — ⌘Z in Live, not here'
            : 'Live would not group this move for undo, so there is no way back — ' +
              'our ⌘Z cannot rebuild deleted scenes',
          e.undoStep ? 'info' : 'error',
        );

        // Creating and deleting scenes renumbers everything below them, so this
        // isn't a patch to the set we hold — it's a different set with different
        // indexes, and only a walk can describe it.
        //
        // The walk is no longer requested here. The bridge broadcasts one
        // structural change once the whole move has landed, and that drives the
        // re-read for this client and every other one — the same arrangement
        // `addScenes` uses. Asking here as well would walk twice: once now, and
        // once more when the broadcast arrived a moment later.
      }),
    [client, guard, say],
  );

  /**
   * The clip-drag counterpart to `moveScenes`, and it makes the same bargain
   * with undo for a slightly different reason. A scene move can't be reversed
   * because a snapshot can't rebuild a deleted scene's clips; a clip move can't
   * be reversed because it **overwrites**, and what was at the target is gone.
   * Moving the clips back would restore their positions and not the casualties.
   *
   * So this clears the undo entry too. Live's own history is the way back, if
   * `begin_undo_step` took — which is unverified, so the log says which.
   */
  const moveClips = useCallback(
    (plan: ClipMovePlanFor, label: string) =>
      guard(label, async () => {
        undoRef.current = null;
        setUndoDepth(0);

        const e = await client.request({
          type: 'moveClips',
          plan: { steps: plan.steps, remove: plan.remove },
        });

        if (e.failed > 0) {
          // lom.ts skips the whole delete pass if any copy failed, so the
          // originals are all still there and the set holds both copies.
          say(
            `${label} — ${e.failed} operation${e.failed > 1 ? 's' : ''} failed, so ` +
              `nothing was deleted. The originals are all still where they were; ` +
              `check the Max window and tidy up in Live.`,
            'error',
          );
        } else {
          say(
            `${label} — ${e.copied} clip${e.copied === 1 ? '' : 's'} copied, ` +
              `${e.removed} cleared in ${e.lomMs}ms`,
            'ok',
          );
        }
        say(
          e.undoStep
            ? "this move is one step in Live's own undo history — ⌘Z in Live, not here"
            : 'Live would not group this move for undo, so there is no way back — ' +
              'our ⌘Z cannot restore an overwritten clip',
          e.undoStep ? 'info' : 'error',
        );

        // Unlike a scene move this renumbers nothing — every index still means
        // what it meant, so the plan alone says where every clip ended up. A
        // failure doesn't: `lom.ts` skips the whole delete pass, and what that
        // leaves behind is a set we'd be describing from a plan it didn't run.
        const s = snapshotRef.current;
        if (e.failed === 0 && s) {
          const clips = applyClipMove(s.clips, plan);
          setSnapshot({ ...s, clips, clipCount: clips.length });
        } else {
          await resync();
        }
      }),
    [client, guard, resync, say],
  );

  const undo = useCallback(() => {
    const u = undoRef.current;
    if (!u || size(u.batch) === 0) return Promise.resolve();
    // No redo: the entry is consumed either way, so a failed undo can't be
    // replayed into a half-reverted state on a second press.
    undoRef.current = null;
    setUndoDepth(0);
    return write(u.batch, u.label, null);
  }, [write]);

  return {
    connection,
    lomReady,
    snapshot,
    palette,
    roles,
    allowedColors,
    play,
    transport,
    songPosition,
    progress,
    log,
    busy,
    syncing,
    undoDepth,
    refresh,
    apply,
    applyScenes,
    addScenes,
    moveScenes,
    moveClips,
    saveRoles,
    setAllowedColors,
    undo,
    launch,
    stop,
    setTransport,
    setFold,
    subscribeMeters,
  };
}
