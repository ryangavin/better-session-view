import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BridgeClient, type ConnectionState } from '../lib/client.js';
import { inverseOps } from '../../../core/src/ops.js';
import {
  countUnrevertableColors,
  inverseSceneOps,
  sceneFields,
} from '../../../core/src/roles.js';
import type { SceneMovePlan } from '../../../core/src/sceneMove.js';
import { errText, reportSnapshotTiming } from '../lib/snapshotTiming.js';
import { useLog, type LogLine } from './useLog.js';
import { usePalette } from './usePalette.js';
import { useRolesConfig } from './useRolesConfig.js';

/**
 * The part of a plan that goes on the wire. `SceneMovePlan` also carries counts
 * and final positions, which are for the UI to talk about and nothing the bridge
 * needs to be told.
 */
type MovePlanFor = Pick<SceneMovePlan, 'create' | 'steps' | 'remove'>;

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
  /** The configured role vocabulary, from the bridge's roles.json. */
  roles: BSV.Role[];
  play: PlayState;
  progress: { done: number; total: number } | null;
  log: LogLine[];
  busy: boolean;
  /** True only while the UI is re-reading the set, not during other writes. */
  syncing: boolean;
  /** 1 when the last write can be reversed, 0 otherwise. */
  undoDepth: number;
  refresh: () => Promise<void>;
  extractPalette: () => Promise<void>;
  apply: (ops: BSV.ApplyOp[], label?: string) => Promise<void>;
  /** Scene-addressed writes — role tags and scene colors. */
  applyScenes: (sceneOps: BSV.SceneOp[], label?: string) => Promise<void>;
  /**
   * Reorder scenes. **The one write with no undo of ours** — it creates and
   * deletes scenes, and a snapshot can't rebuild a deleted one. Clears the undo
   * entry rather than arming it.
   */
  moveScenes: (plan: MovePlanFor, label: string) => Promise<void>;
  saveRoles: (roles: BSV.Role[]) => Promise<void>;
  undo: () => Promise<void>;
  /** Fire something. No await: the answer you want is `play` changing. */
  launch: (target: BSV.LaunchTarget) => void;
  stop: (target: BSV.StopTarget) => void;
}

/**
 * The React face of the bridge. The separable pieces live in their own hooks —
 * useLog, useRolesConfig, usePalette — and this composes them with the parts
 * that are one cohesive unit: the connection, the snapshot walk, and the
 * apply/undo/moveScenes write path, which all share `guard`, the snapshot ref
 * and the undo entry.
 */
export function useBridge(): BridgeState {
  const client = useMemo(() => new BridgeClient(), []);
  const { log, say } = useLog();

  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [lomReady, setLomReady] = useState(false);
  const [snapshot, setSnapshot] = useState<BSV.Snapshot | null>(null);
  const [play, setPlay] = useState<PlayState>(NOT_PLAYING);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const guard: Guard = useCallback(
    async (label, fn) => {
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        say(`${label}: ${errText(e)}`, 'error');
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [say],
  );

  const { roles, loadRoles, saveRoles } = useRolesConfig(client, guard, say);
  const { palette, derivePaletteOnce, extractPalette } = usePalette(client, guard, say);

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
          if (!event.lomReady) setPlay(NOT_PLAYING);
          break;
        case 'playState':
          setPlay({ isPlaying: event.isPlaying, tracks: event.tracks });
          break;
        case 'progress':
          setProgress({ done: event.done, total: event.total });
          break;
        case 'changed':
          say(`Live set changed (${event.kind})`);
          break;
        // The vocabulary just moved house — what's on screen may belong to a
        // different set. Silent: this fires at boot for every client, and
        // "loaded the roles for the set you already had open" is not news.
        case 'setInfo':
          loadRoles();
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
  }, [client, say, loadRoles]);

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

  const launch = useCallback(
    (target: BSV.LaunchTarget) => client.send({ type: 'launch', target }),
    [client],
  );

  const stop = useCallback(
    (target: BSV.StopTarget) => client.send({ type: 'stop', target }),
    [client],
  );

  const refresh = useCallback(
    () =>
      guard('snapshot', async () => {
        await whileSyncing(async () => {
          // Strictly before the walk — see derivePaletteOnce.
          await derivePaletteOnce();
          const e = await client.request({ type: 'snapshot' });
          const wire = client.lastWireTiming;
          const commitStart = performance.now();
          setSnapshot(e.data);
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
    [client, derivePaletteOnce, guard, say, whileSyncing],
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
  const snapshotRef = useRef<BSV.Snapshot | null>(null);
  snapshotRef.current = snapshot;
  const [undoDepth, setUndoDepth] = useState(0);
  const undoRef = useRef<{ batch: Batch; label: string } | null>(null);

  const size = (b: Batch) => b.ops.length + b.sceneOps.length;

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
        await whileSyncing(async () => {
          const s = await client.request({ type: 'snapshot' });
          setSnapshot(s.data);
        });
      }),
    [client, guard, say, whileSyncing],
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

        await whileSyncing(async () => {
          const s = await client.request({ type: 'snapshot' });
          setSnapshot(s.data);
        });
      }),
    [client, guard, say, whileSyncing],
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
    play,
    progress,
    log,
    busy,
    syncing,
    undoDepth,
    refresh,
    extractPalette,
    apply,
    applyScenes,
    moveScenes,
    saveRoles,
    undo,
    launch,
    stop,
  };
}
