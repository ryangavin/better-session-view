import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BridgeClient, type ConnectionState } from './client.js';

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
        setSnapshot(e.data);
        say(`snapshot — ${e.data.clipCount} clips in ${e.lomMs}ms`, 'ok');
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
