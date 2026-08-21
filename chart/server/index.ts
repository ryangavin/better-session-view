import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHART_EVENT,
  CHART_PORT,
  EVENTS_PATH,
  LOOPS_EVENT,
  NUDGE,
  PROGRESSION_EVENT,
  TEMPO_PATH,
} from '../protocol.ts';
import { followBridge } from './bridge.ts';
import { buildChart } from './chart.ts';
import { buildLoops, loopShape } from './loops.ts';
import { buildProgression, playingClips, progressionShape } from './progression.ts';

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
 * size of the band, and what crosses to the wifi is a projection of what is
 * playing plus exactly one verb. The rest of the protocol — every launch, every
 * rename, every scene move — stays on loopback where the device put it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.BSV_CHART_HOST ?? '0.0.0.0';
const PORT = Number(process.env.BSV_CHART_PORT) || CHART_PORT;
const BRIDGE = process.env.BSV_BRIDGE_WS ?? 'ws://127.0.0.1:17800/ws';
const ROOT = path.resolve(here, '../dist');
/**
 * The Vite dev server to hand the page off to, when there is one.
 *
 * **One address, in both modes**, and that is the point rather than a
 * convenience. This module's whole premise is that somebody reads a URL out to
 * the room; a second URL that behaves differently undermines it, and the one
 * anybody reaches for is this server's — which serves `chart/dist` and so shows
 * an edit only after a rebuild. Working on the page then looks exactly like
 * hot reload being broken.
 *
 * So `npm run dev` points this at Vite and every page request is proxied there,
 * HMR socket included. Unset — which is how it ships — nothing is proxied and
 * `dist` is served as before.
 */
const DEV_UI = process.env.BSV_CHART_UI ?? '';

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

const chartFrame = () => JSON.stringify(buildChart(bridge.state));

/** One named SSE event to one reader. */
function push(res: http.ServerResponse, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
}

function pushAll(event: string, data: string): void {
  for (const res of readers) push(res, event, data);
}

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
  push(res, CHART_EVENT, chartFrame());
  push(res, LOOPS_EVENT, JSON.stringify(buildLoops(bridge.state)));
  const chords = buildProgression(bridge.state);
  if (chords) push(res, PROGRESSION_EVENT, JSON.stringify(chords));
  readers.add(res);
  res.on('close', () => readers.delete(res));
}

/**
 * The one thing a phone may ask for: one BPM, up or down.
 *
 * Relative and bounded to a single step. There is no way to *state* a tempo,
 * because a phone's reading is always a little stale and asking for 101 when
 * the set has already moved is how a nudge becomes a jump. `by` is taken only
 * as exactly ±1, so a malformed or hostile body cannot widen the step, and the
 * rate limit below stops a stuck button dragging the set across the room.
 */
let lastNudge = 0;

function nudge(req: http.IncomingMessage, res: http.ServerResponse): void {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    // Nothing legitimate here is longer than a couple of dozen bytes.
    if (body.length > 200) req.destroy();
  });
  req.on('end', () => {
    let by: unknown = null;
    try {
      by = (JSON.parse(body) as { by?: unknown }).by;
    } catch {
      by = null;
    }
    // Strict rather than coerced. `Number("1")` is 1, so coercion would accept
    // a string here — harmless, since the value still has to *be* ±1, but the
    // point of this endpoint is that what it accepts can be stated in one line.
    // Anything that has to be converted first is something to reason about.
    if (typeof by !== 'number' || (by !== NUDGE && by !== -NUDGE)) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`by must be ${NUDGE} or ${-NUDGE}`);
      return;
    }
    // A person tapping cannot outrun this; a button held down by a pocket, or a
    // script, can. Twelve a second is faster than anyone taps and slow enough
    // that a runaway is something you can see happening and stop.
    const now = Date.now();
    if (now - lastNudge < 80) {
      res.writeHead(429, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('slow down');
      return;
    }
    lastNudge = now;

    const asked = bridge.nudgeTempo(by);
    if (asked === null) {
      res.writeHead(409, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('no set to nudge');
      return;
    }
    // No body worth reading. `setTransport` has no reply by design — what Live
    // actually took arrives as the next `transportState`, and that reaches
    // every phone at once rather than only the one that pressed.
    res.writeHead(204).end();
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === EVENTS_PATH) {
    stream(res);
    return;
  }
  if (url.pathname === TEMPO_PATH) {
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' }).end();
      return;
    }
    nudge(req, res);
    return;
  }

  if (DEV_UI) return toDevServer(req, res);

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
 * Hand one page request to the dev server, and serve `dist` if it isn't up.
 *
 * The fallback is not defensive padding: `npm run dev` starts this and Vite
 * together under `concurrently`, so for the first moment of a dev session there
 * is nothing on the other end. Answering that with a stack trace would make
 * every session start with an error that resolves itself.
 */
function toDevServer(req: http.IncomingMessage, res: http.ServerResponse): void {
  const target = new URL(DEV_UI);
  const proxied = http.request(
    {
      host: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  proxied.on('error', () => {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`The dev server at ${DEV_UI} is not up yet. Reload in a moment.`);
  });
  req.pipe(proxied);
}

/**
 * Vite's HMR socket, through the same port as the page.
 *
 * Without this the page loads from here and its hot-reload client tries to
 * connect back to this port, where nothing is listening — so the page is
 * served, looks right, and never updates. Which is the failure this whole
 * arrangement exists to remove, arriving by a different route.
 */
server.on('upgrade', (req, socket, head) => {
  if (!DEV_UI) return;
  const target = new URL(DEV_UI);
  const up = http.request({
    host: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: target.host },
  });
  up.on('upgrade', (answer, upstream, upstreamHead) => {
    const lines = Object.entries(answer.headers)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join('\r\n');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines}\r\n\r\n`);
    if (upstreamHead.length) socket.unshift(upstreamHead);
    upstream.pipe(socket).pipe(upstream);
  });
  up.on('error', () => socket.destroy());
  if (head.length) up.write(head);
  up.end();
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

/**
 * How often a loop frame goes out, against Live reporting them at 20 Hz.
 *
 * A phone does not need to be *told* where a playhead is. A loop advances at a
 * rate the tempo states, so a position and the moment it arrived are enough for
 * the browser to draw every frame in between at whatever rate its display runs
 * — which is also the only way a wheel turns smoothly rather than stepping.
 * What this rate buys is correction: drift, and the moment the clips themselves
 * change. Half a second of drift at 120 BPM is one beat, and the frame that
 * lands puts it right.
 *
 * A **change of shape** does not wait for it. Firing a scene swaps every clip,
 * and a wheel that kept turning against the loop it used to be drawing for half
 * a second would be wrong at exactly the moment somebody looked.
 */
const LOOPS_MS = 500;

let last = '';
let lastShape = '';
let lastChords = '';
/** The clips whose notes we last asked for, so we ask once per change. */
let asked = '';
let sinceBeat = 0;
let sinceLoops = 0;

setInterval(() => {
  sinceBeat += TICK_MS;
  sinceLoops += TICK_MS;
  const beat = sinceBeat >= BEAT_MS;
  if (beat) sinceBeat = 0;
  if (readers.size === 0) {
    dirty = false;
    return;
  }

  let said = false;

  if (dirty) {
    dirty = false;
    const next = chartFrame();
    if (next !== last) {
      last = next;
      pushAll(CHART_EVENT, next);
      said = true;
    }
  }

  const loops = buildLoops(bridge.state);
  const shape = loopShape(loops);
  // The periodic frame exists to correct drift, so it is worth sending only
  // while there is drift to correct. A stopped set's positions are not moving
  // and the phone is not advancing them, so re-stating them twice a second
  // says nothing — a chart left open between songs should cost the wifi
  // nothing at all. A change of shape still goes out immediately either way.
  if (shape !== lastShape || (loops.rolling && sinceLoops >= LOOPS_MS)) {
    lastShape = shape;
    sinceLoops = 0;
    pushAll(LOOPS_EVENT, JSON.stringify(loops));
    said = true;
  }

  // Notes are a read, not a watch, so somebody has to decide when to take one.
  // The answer is "when the playing clips change" — which is exactly when the
  // harmony can have changed, and never while a loop merely goes round.
  const wanted = playingClips(bridge.state);
  const wantKey = wanted.map((clip) => `${clip.t}:${clip.s}`).join(',');
  if (wantKey !== asked && bridge.state.lomReady) {
    asked = wantKey;
    bridge.readNotes(wanted);
  }

  const chords = buildProgression(bridge.state);
  const chordShape = progressionShape(chords);
  if (chordShape !== lastChords) {
    lastChords = chordShape;
    // An empty payload is how a chart goes away — a song with no readable
    // harmony has to be able to clear the one before it.
    pushAll(PROGRESSION_EVENT, chords ? JSON.stringify(chords) : 'null');
    said = true;
  }

  // A comment, so it costs a phone nothing to receive and keeps whatever is
  // between us from deciding the connection is idle. Only needed when the set
  // has been silent long enough that nothing else has gone out.
  if (beat && !said) for (const res of readers) res.write(': beat\n\n');
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
  if (DEV_UI) console.log(`chart: page from ${DEV_UI} — hot reload through this port`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    for (const res of readers) res.end();
    bridge.close();
    server.close();
    process.exit(0);
  });
}
