import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BridgeClient, type ConnectionState, type WireTiming } from './client.js';
import { inverseOps } from '../../../core/src/ops.js';

/** Scenes in the full-size set we're actually building for. */
const TARGET_SCENES = 848;

/**
 * Writes the phase breakdown to the browser console. Every phase of the walk is
 * a linear scan, so a projection to full-set size is a fair extrapolation — and
 * it's the number that decides whether snapshotting needs a progress bar.
 */
function reportSnapshotTiming(
  e: BSV.EventOf<'snapshot'>,
  wire: WireTiming | null,
  commitMs: number,
): void {
  const { data, dictMs, hostMs } = e;
  const t = data.timings;
  const total = wire ? wire.totalMs + commitMs : data.ms;
  const scale = data.sceneCount > 0 ? TARGET_SCENES / data.sceneCount : 1;

  const row = (ms: number, note: string) => ({
    ms: Math.round(ms * 10) / 10,
    'share': total > 0 ? `${Math.round((ms / total) * 100)}%` : '—',
    note,
  });

  console.groupCollapsed(
    `%c⏱ snapshot%c ${data.clipCount} clips · ${data.sceneCount} scenes · ` +
      `${Math.round(total)}ms end-to-end`,
    'color:#f0b23c;font-weight:600',
    'color:inherit',
  );
  console.table({
    'lom: tracks': row(t.tracks, `${data.trackCount} tracks`),
    'lom: scenes': row(t.scenes, `${data.sceneCount} scenes`),
    'lom: slot scan': row(t.slots, `${t.slotsScanned} slots probed`),
    'lom: clip reads': row(t.clips, `${data.clipCount} clips`),
    'v8 → dict': row(dictMs, 'JSON.stringify + Dict.parse'),
    'node getDict': row(hostMs, 'Max dict → JS object'),
    'wire + parse': row(
      wire ? Math.max(0, wire.totalMs - data.ms - dictMs - hostMs) : 0,
      wire ? `${(wire.bytes / 1024).toFixed(0)} kB payload` : 'unmeasured',
    ),
    'react commit': row(commitMs, `${data.sceneCount} rows`),
  });
  console.debug(
    `projection to ${TARGET_SCENES} scenes (×${scale.toFixed(1)}, linear): ` +
      `~${((total * scale) / 1000).toFixed(1)}s end-to-end`,
  );
  console.groupEnd();
}

/**
 * A non-empty description of a thrown value. `||` rather than `??`: an Error with
 * an empty message logs as "color: " and says nothing at all.
 */
function errText(e: unknown): string {
  const m = (e as Error)?.message;
  if (typeof m === 'string' && m !== '') return m;
  const s = String(e);
  return s && s !== 'undefined' && s !== 'null' && s !== '[object Object]'
    ? s
    : 'failed with no message — check the Max window';
}

export interface LogLine {
  id: number;
  text: string;
  kind: 'info' | 'ok' | 'error';
}

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

export interface BridgeState {
  connection: ConnectionState;
  lomReady: boolean;
  snapshot: BSV.Snapshot | null;
  palette: number[];
  play: PlayState;
  progress: { done: number; total: number } | null;
  log: LogLine[];
  busy: boolean;
  /** 1 when the last write can be reversed, 0 otherwise. */
  undoDepth: number;
  refresh: () => Promise<void>;
  extractPalette: () => Promise<void>;
  apply: (ops: BSV.ApplyOp[], label?: string) => Promise<void>;
  undo: () => Promise<void>;
  /** Fire something. No await: the answer you want is `play` changing. */
  launch: (target: BSV.LaunchTarget) => void;
  stop: (target: BSV.StopTarget) => void;
}

export function useBridge(): BridgeState {
  const client = useMemo(() => new BridgeClient(), []);
  const logId = useRef(0);

  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [lomReady, setLomReady] = useState(false);
  const [snapshot, setSnapshot] = useState<BSV.Snapshot | null>(null);
  const [palette, setPalette] = useState<number[]>([]);
  const [play, setPlay] = useState<PlayState>(NOT_PLAYING);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);

  const say = useCallback((text: string, kind: LogLine['kind'] = 'info') => {
    setLog((prev) => [{ id: ++logId.current, text, kind }, ...prev].slice(0, 60));
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
  }, [client, say]);

  // The palette is cached server-side; read it before any derivation.
  useEffect(() => {
    fetch('/palette.json')
      .then((r) => r.json())
      .then((p: BSV.Palette) => setPalette(p.colors ?? []))
      .catch(() => setPalette([]));
  }, []);

  const paletteRef = useRef<number[]>([]);
  paletteRef.current = palette;
  /** Tried and failed this session — don't append a scratch track on every refresh. */
  const derivedRef = useRef(false);

  /**
   * Derive the palette if we haven't got one, before the walk.
   *
   * Once per Live version, not once per snapshot, and the difference matters.
   * The sweep appends and deletes a track, so running it on every refresh would
   * mark the set dirty every time, push churn into Live's undo history, and fire
   * the structural observer — whose whole job is to prompt a re-snapshot, which
   * is a feedback loop the moment `observe` is on. It also cannot overlap the
   * walk: the snapshot would see the scratch track as a real one. Live's palette
   * can't change within a session, so there is nothing to gain either way.
   */
  const derivePaletteOnce = useCallback(async () => {
    if (derivedRef.current || paletteRef.current.length >= 2) return;

    // Ask the server's cache rather than trusting React state, which may still
    // be waiting on the mount-time fetch if Snapshot was clicked immediately.
    // A local GET is cheap; appending a track to re-derive what we already have
    // is not.
    try {
      const cached: BSV.Palette = await (await fetch('/palette.json')).json();
      if (Array.isArray(cached.colors) && cached.colors.length >= 2) {
        setPalette(cached.colors);
        return;
      }
    } catch {
      /* no usable cache — derive it below */
    }

    derivedRef.current = true;
    try {
      say('no palette cached — deriving it once from Live…');
      const e = await client.request({ type: 'palette' });
      setPalette(e.colors);
      say(`palette — ${e.count} colors derived and cached`, 'ok');
    } catch (e) {
      // Never block the walk for this. A set you can see without swatches is
      // far better than an error where the grid should be.
      say(`palette: ${errText(e)} — continuing without it`, 'error');
    }
  }, [client, say]);

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

  const guard = useCallback(
    async (label: string, fn: () => Promise<void>) => {
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

  const refresh = useCallback(
    () =>
      guard('snapshot', async () => {
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
      }),
    [client, derivePaletteOnce, guard, say],
  );

  // Manual re-derive. Normally unnecessary — refresh() does it automatically the
  // first time — so this exists for a Live upgrade that changes the palette, and
  // as the retry after an automatic attempt failed.
  const extractPalette = useCallback(
    () =>
      guard('palette', async () => {
        say('deriving palette — adds and removes one scratch track…');
        const e = await client.request({ type: 'palette' });
        derivedRef.current = true;
        setPalette(e.colors);
        say(`palette — ${e.count} colors derived from Live`, 'ok');
      }),
    [client, guard, say],
  );

  // One level of undo, captured from the snapshot rather than from Live. LOM
  // writes don't participate in Live's own history, so ⌘Z in Live will not bring
  // a rename back — this is the only way back there is. Deliberately one level:
  // a stack would need to survive the re-snapshot after every write, and a stale
  // entry that quietly restores the wrong thing is worse than no stack.
  const snapshotRef = useRef<BSV.Snapshot | null>(null);
  snapshotRef.current = snapshot;
  const [undoDepth, setUndoDepth] = useState(0);
  const undoRef = useRef<{ ops: BSV.ApplyOp[]; label: string } | null>(null);

  const write = useCallback(
    (ops: BSV.ApplyOp[], label: string, reverse: { ops: BSV.ApplyOp[]; label: string } | null) =>
      guard(label, async () => {
        if (ops.length === 0) {
          say(`${label} — nothing to write`, 'ok');
          return;
        }
        const e = await client.request({ type: 'apply', ops });
        undoRef.current = reverse;
        setUndoDepth(reverse && reverse.ops.length > 0 ? 1 : 0);
        // Report what we sent alongside what Live did with it. "0 written of 1
        // sent" is a very different bug from "0 written of 0 sent", and without
        // the sent count the two look identical.
        const short = e.applied + e.skipped < ops.length;
        say(
          `${label} — ${e.applied} written, ${e.skipped} skipped of ${ops.length} sent` +
            ` in ${e.lomMs}ms`,
          short ? 'error' : 'ok',
        );
        const s = await client.request({ type: 'snapshot' });
        setSnapshot(s.data);
      }),
    [client, guard, say],
  );

  const apply = useCallback(
    (ops: BSV.ApplyOp[], label = 'apply') => {
      const before = snapshotRef.current?.clips ?? [];
      const back = inverseOps(before, ops);
      return write(ops, label, { ops: back, label: `undo ${label}` });
    },
    [write],
  );

  const undo = useCallback(() => {
    const u = undoRef.current;
    if (!u || u.ops.length === 0) return Promise.resolve();
    // No redo: the entry is consumed either way, so a failed undo can't be
    // replayed into a half-reverted state on a second press.
    undoRef.current = null;
    setUndoDepth(0);
    return write(u.ops, u.label, null);
  }, [write]);

  return {
    connection,
    lomReady,
    snapshot,
    palette,
    play,
    progress,
    log,
    busy,
    undoDepth,
    refresh,
    extractPalette,
    apply,
    undo,
    launch,
    stop,
  };
}
