/**
 * A client of the Session Bridge, and nothing more than a client.
 *
 * The second kind of client `CONTRIBUTING.md` anticipated — "a stage display, a
 * CLI — should cost nothing and perturb nothing" — so it obeys rule 5 exactly.
 * It asks for `snapshot` without `fresh`, which the device answers from what it
 * already holds, and it never sends `observe` or `watchSelection`, which are the
 * device's own. Six phones in a room are one connection here, and connecting,
 * dropping and reconnecting leave the bridge's knowledge of the set untouched.
 *
 * **No dependency, deliberately.** Node has had a `WebSocket` client since 22,
 * and the only reason the other two halves of this project carry `ws` is that
 * they also need a *server* — the device to serve browsers, visuals to serve the
 * renderer. This serves phones over SSE, which `node:http` already speaks, so
 * `chart/` installs nothing at all and runs from a fresh clone.
 *
 * It is the same shape as `visuals/server/bridge.ts` and deliberately not shared
 * with it: that one carries a renderer's worth of state — clips, meters, the
 * mixer — and lives in a process that has `ws` for the addon's sake. This one
 * keeps five fields. **If a third client appears, this is the thing to extract**;
 * two is not yet a pattern.
 */

export interface SetState {
  connected: boolean;
  lomReady: boolean;
  rev: number;
  /** Live's tempo, kept current by `watchTransport`. */
  tempo: number;
  tracks: BSV.Track[];
  scenes: BSV.Scene[];
  /** The mapping, read out of the scene names once — by the bridge, not here. */
  model: BSV.SetModel | null;
  /** Live's transport, which is the answer no observer gives on joining. */
  rolling: boolean;
  play: BSV.TrackPlayState[];
}

export function emptySet(): SetState {
  return {
    connected: false,
    lomReady: false,
    rev: -1,
    tempo: 120,
    tracks: [],
    scenes: [],
    model: null,
    rolling: false,
    play: [],
  };
}

export interface BridgeLink {
  state: SetState;
  close(): void;
}

/**
 * Follows the bridge, reconnecting forever.
 *
 * Forever is what separates a tool from a show rig. The chart may well be
 * running before the machine with Live on it, somebody may close the set
 * between songs, and a rack that had to be started in the right order is a rack
 * that fails at the worst moment. There is no retry limit and no error to
 * surface: it is either connected or it is trying, and the phone is told which.
 */
export function followBridge(url: string, onChange: () => void): BridgeLink {
  const state = emptySet();
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let asking: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const send = (request: BSV.Request) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify(request));
  };

  /**
   * Ask again, later, until the set actually arrives.
   *
   * A connected bridge is not a bridge that can answer. The device refuses
   * every request with `device not ready` until `init()` has run in `lom.ts`,
   * so one whose device is still coming up — or whose script was recompiled
   * under a loaded device — is reachable and unhelpful. Stops the moment `rev`
   * says a set landed.
   */
  const askAgain = () => {
    if (closed || asking || state.rev >= 0) return;
    asking = setTimeout(() => {
      asking = null;
      if (closed || state.rev >= 0) return;
      send({ type: 'snapshot' });
      askAgain();
    }, 1000);
  };

  /** Returns whether anything a phone would notice actually moved. */
  const take = (event: BSV.Event): boolean => {
    switch (event.type) {
      case 'status':
        state.lomReady = event.lomReady;
        // The LOM going ready is what makes an earlier refusal worth retrying,
        // and it arrives unprompted.
        if (event.lomReady && state.rev < 0) send({ type: 'snapshot' });
        askAgain();
        return true;
      case 'snapshot':
        state.rev = event.data.rev;
        state.tempo = event.data.tempo;
        state.tracks = event.data.tracks;
        state.scenes = event.data.scenes;
        state.model = event.model;
        return true;
      case 'delta':
        // A delta is a partial re-read, and patching a copy of the set here
        // would be a second answer to a question the bridge already answers.
        // Asking again costs the device nothing: `snapshot` with no `fresh` is
        // served from what it holds.
        if (event.model) state.model = event.model;
        send({ type: 'snapshot' });
        return true;
      case 'playState':
        state.rolling = event.isPlaying;
        state.play = event.tracks;
        return true;
      case 'transportState':
        state.tempo = event.state.tempo;
        return true;
      case 'error':
        // Never fatal. The device refuses everything until it is ready, and the
        // only useful response is to ask again rather than to give up or take
        // the process down with an unhandled rejection.
        askAgain();
        return false;
      default:
        return false;
    }
  };

  const retry = () => {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, 1000);
  };

  function connect(): void {
    if (closed) return;
    const ws = new WebSocket(url);
    socket = ws;

    ws.addEventListener('open', () => {
      state.connected = true;
      send({ type: 'snapshot' });
      // Two viewport watches and no more. Play state is the whole question this
      // client asks — which scene, and what is fired — and transport is the
      // tempo the set is actually running at. Meters, the mixer and the device
      // chains are somebody else's client.
      send({ type: 'watchPlay', on: true });
      send({ type: 'watchTransport', on: true });
      onChange();
    });

    ws.addEventListener('message', (message: MessageEvent) => {
      let event: BSV.Event;
      try {
        event = JSON.parse(String(message.data)) as BSV.Event;
      } catch {
        return;
      }
      if (take(event)) onChange();
    });

    ws.addEventListener('close', () => {
      state.connected = false;
      state.lomReady = false;
      state.rev = -1;
      state.play = [];
      state.rolling = false;
      if (asking) {
        clearTimeout(asking);
        asking = null;
      }
      onChange();
      retry();
    });

    // Without this a refused connection is an unhandled error event that takes
    // the process down — which for the band means a blank phone rather than one
    // saying it is waiting.
    ws.addEventListener('error', () => {});
  }

  connect();

  return {
    state,
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      if (asking) clearTimeout(asking);
      socket?.close();
    },
  };
}
