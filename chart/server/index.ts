import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHART_PORT, EVENTS_PATH } from '../protocol.ts';
import { followBridge } from './bridge.ts';
import { buildChart } from './chart.ts';

/**
 * The chart server: one bridge client, and a page for everyone else's phone.
 *
 * ```
 * Live ─ SessionBridge :17800 ─WS─> chart server :18000 ─SSE─> phones
 *            (loopback)                   (the band's wifi)
 * ```
 *
 * The shape is the point. **One** connection reaches the device however many
 * people are looking, so the bridge's connection count does not climb with the
 * size of the band, and the only thing crossing to the wifi is a read-only
 * projection of what is playing. The full protocol — every write, every launch,
 * every scene move — stays on loopback where the device put it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.BSV_CHART_HOST ?? '0.0.0.0';
const PORT = Number(process.env.BSV_CHART_PORT) || CHART_PORT;
const BRIDGE = process.env.BSV_BRIDGE_WS ?? 'ws://127.0.0.1:17800/ws';
const ROOT = path.resolve(here, '../dist');

/**
 * Binding every interface rather than loopback, unlike the device.
 *
 * The device binds `127.0.0.1` because its client is a browser on the same
 * machine. This one's clients are other people's phones, so loopback would
 * defeat the whole point. It remains a deliberate exposure: there is no
 * authentication and it answers anyone who can reach the port, so it belongs on
 * a rehearsal or show wifi and not on a hotel network. What is exposed is a
 * song title and a list of sections, and **nothing here can change the set** —
 * there is no request type on the wire to change it with.
 * `BSV_CHART_HOST=127.0.0.1` takes it back for anyone who wants that.
 */

let dirty = true;
const bridge = followBridge(BRIDGE, () => {
  dirty = true;
});

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const readers = new Set<http.ServerResponse>();

const frame = () => JSON.stringify(buildChart(bridge.state));

/**
 * Server-Sent Events rather than a WebSocket, and it is not a shortcut.
 *
 * A phone reading the chart has nothing to say, so a duplex socket would be a
 * back channel that exists only to be misused later. SSE is one-way by
 * construction, `node:http` already speaks it — which is why this module
 * installs no dependencies at all — and `EventSource` reconnects on its own,
 * which is exactly the behaviour a phone that went in a pocket between songs
 * needs and the one thing a hand-rolled socket client always gets wrong.
 */
function stream(res: http.ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Nothing of ours proxies this, but a phone on a captive venue network may
    // well go through something that does, and a buffered event stream looks
    // exactly like a chart that has frozen.
    'x-accel-buffering': 'no',
  });
  // Faster than the browser's five-second default. A set does not wait for a
  // phone to come back.
  res.write('retry: 2000\n\n');
  res.write(`data: ${frame()}\n\n`);
  readers.add(res);
  res.on('close', () => readers.delete(res));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === EVENTS_PATH) {
    stream(res);
    return;
  }

  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  // Every unknown path is the app, because the chart is a single page.
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    rel = '/index.html';
  }

  const target = path.join(ROOT, rel);
  if (!fs.existsSync(target)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('The chart is not built. Run: npm run build:chart\nOr use the dev server.');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(fs.readFileSync(target));
});

/**
 * Coalesced, and sent only when it says something different.
 *
 * Every input arrives as an event — a clip fired, a scene renamed, the bridge
 * dropping — so there is no clock to poll against. What there is instead is a
 * burst: firing a scene moves every track's play state, and the bridge reports
 * that as one message per observer. A quarter of a second is below noticing and
 * turns the burst into one push.
 *
 * The comparison is what makes the stream quiet. A tempo readback or a
 * reconnect that lands on the same chart sends nothing, so a phone left on a
 * music stand for an hour receives one heartbeat every fifteen seconds and
 * whatever the band actually did.
 */
const TICK_MS = 250;
const BEAT_MS = 15_000;
let last = '';
let sinceBeat = 0;

setInterval(() => {
  sinceBeat += TICK_MS;
  const beat = sinceBeat >= BEAT_MS;
  if (beat) sinceBeat = 0;
  if (readers.size === 0) {
    dirty = false;
    return;
  }
  if (dirty) {
    dirty = false;
    const next = frame();
    if (next !== last) {
      last = next;
      for (const res of readers) res.write(`data: ${next}\n\n`);
      return;
    }
  }
  // A comment, so it costs a phone nothing to receive and keeps whatever is
  // between us from deciding the connection is idle.
  if (beat) for (const res of readers) res.write(': beat\n\n');
}, TICK_MS);

/** Every address a phone could actually type. */
function reachableAt(): string[] {
  if (HOST !== '0.0.0.0') return [`http://${HOST}:${PORT}`];
  const found: string[] = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        found.push(`http://${address.address}:${PORT}`);
      }
    }
  }
  return found.length > 0 ? found : [`http://localhost:${PORT}`];
}

/**
 * A port already taken says so, rather than throwing a stack trace.
 *
 * `npm run dev` runs everything under `concurrently -k`, so one process dying
 * takes the session down with it — which makes the message it dies with the
 * only thing anyone reads. An unhandled `EADDRINUSE` is fourteen lines of Node
 * internals that mention neither this file nor this port.
 */
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `chart: port ${PORT} is already in use — something else is on it.\n` +
        `chart: usually a dev:chart or npm run dev left running from an earlier session.\n` +
        `chart: find it with  lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n` +
        `chart: or run this one elsewhere with  BSV_CHART_PORT=18001 npm run dev:chart`,
    );
  } else {
    console.error(`chart: could not listen on ${HOST}:${PORT} — ${err.message}`);
  }
  bridge.close();
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`chart: bridge ${BRIDGE}`);
  for (const at of reachableAt()) console.log(`chart: ${at}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    for (const res of readers) res.end();
    bridge.close();
    server.close();
    process.exit(0);
  });
}
