import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BridgeClient, type ConnectionState, type WireTiming } from './client.js';

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

export interface LogLine {
  id: number;
  text: string;
  kind: 'info' | 'ok' | 'error';
}

export interface BridgeState {
  connection: ConnectionState;
  lomReady: boolean;
  snapshot: BSV.Snapshot | null;
  palette: number[];
  progress: { done: number; total: number } | null;
  log: LogLine[];
  busy: boolean;
  refresh: () => Promise<void>;
  extractPalette: () => Promise<void>;
  apply: (ops: BSV.ApplyOp[]) => Promise<void>;
}

export function useBridge(): BridgeState {
  const client = useMemo(() => new BridgeClient(), []);
  const logId = useRef(0);

  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [lomReady, setLomReady] = useState(false);
  const [snapshot, setSnapshot] = useState<BSV.Snapshot | null>(null);
  const [palette, setPalette] = useState<number[]>([]);
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
          say(event.message, 'error');
          break;
      }
    });
    client.connect();
    return () => {
      off();
      client.close();
    };
  }, [client, say]);

  // The palette is cached server-side; read it before any extraction.
  useEffect(() => {
    fetch('/palette.json')
      .then((r) => r.json())
      .then((p: BSV.Palette) => setPalette(p.colors ?? []))
      .catch(() => setPalette([]));
  }, []);

  const guard = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        say(`${label}: ${(e as Error).message}`, 'error');
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
    [client, guard, say],
  );

  const extractPalette = useCallback(
    () =>
      guard('palette', async () => {
        say('extracting palette — adds and removes one scratch scene…');
        const e = await client.request({ type: 'palette' });
        setPalette(e.colors);
        say(`palette — ${e.count} colors extracted from Live`, 'ok');
      }),
    [client, guard, say],
  );

  const apply = useCallback(
    (ops: BSV.ApplyOp[]) =>
      guard('apply', async () => {
        const e = await client.request({ type: 'apply', ops });
        say(`applied ${e.applied}, skipped ${e.skipped} in ${e.lomMs}ms`, 'ok');
        const s = await client.request({ type: 'snapshot' });
        setSnapshot(s.data);
      }),
    [client, guard, say],
  );

  return {
    connection,
    lomReady,
    snapshot,
    palette,
    progress,
    log,
    busy,
    refresh,
    extractPalette,
    apply,
  };
}
