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
  tracks: OpenFlow.Track[];
  scenes: OpenFlow.Scene[];
  /** The mapping, read out of the scene names once — by the bridge, not here. */
  model: OpenFlow.SetModel | null;
  /** Live's transport, which is the answer no observer gives on joining. */
  rolling: boolean;
  play: OpenFlow.TrackPlayState[];
  /**
   * The clip playing in each track, at 20 Hz from Live.
   *
   * Tracks with nothing playing are absent rather than present and empty, which
   * is the frame's own convention and the reason it stays small on a set with
   * far more silent tracks than sounding ones.
   */
  status: OpenFlow.PlayingClip[];
  /**
   * The notes of the clips currently playing, keyed `t:s`.
   *
   * A **read**, asked for when the playing clips change and kept until they
   * change again. Nothing observes notes — the LOM has no event for a clip's
   * contents that would help here — so this is the one piece of state that goes
   * stale if somebody edits the MIDI of a clip that is already running. The
   * cost of noticing would be re-reading every playing clip on a timer, and a
   * roll that lags an edit by one relaunch is a better trade.
   */
  notes: Map<string, OpenFlow.ClipNotes>;
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
    status: [],
    notes: new Map(),
  };
}

export interface BridgeLink {
  state: SetState;
  /**
   * Move Live's tempo by a whole number of BPM, relative to where it is now.
   *
   * Relative because the caller is a phone and a phone's reading is always a
   * little stale. Asking for "one more than what you have" cannot land
   * somewhere surprising; asking for 101 when the set has already moved on can.
   *
   * Rounded before the step, so a set at 100.4 nudges to 101 rather than 101.4
   * — a band nudging a tempo wants whole numbers, and the drift is the thing
   * they are correcting. Clamped to the range `bridge.ts` validates, so an
   * out-of-range ask is a no-op here rather than an error broadcast there.
   *
   * There is no reply, by the protocol's own design: `setTransport` is
   * acknowledged by the next observed `transportState`, which is the value Live
   * actually took. Returns what it asked for, for the log.
   */
  nudgeTempo(by: number): number | null;
  /**
   * Ask for the notes of these clips. Fire-and-forget: the answer lands in
   * `state.notes` and `onChange` fires, like everything else here.
   */
  readNotes(clips: Array<{ t: number; s: number }>): void;
  close(): void;
}

/** Live's own limits, as `bridge.ts` states them. */
const MIN_TEMPO = 20;
const MAX_TEMPO = 999;

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

  const send = (request: OpenFlow.Request) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify(request));
  };

  /**
   * The track count the watches were last armed for, or -1 for "not armed".
   *
   * **Watches have to be re-sent, and getting this wrong is silent.** The
   * device refuses every request until the LOM is ready, so a chart running
   * before Live finished loading has all three refused — and unlike `snapshot`
   * nothing retries them, leaving a client that looks connected, shows the
   * song, and never draws a wheel. Two things therefore re-arm: the LOM
   * reporting ready, and a snapshot whose track count differs from the one the
   * watches were built against, because `watchPlay` and `watchStatus` install
   * observers *per track* and a set that grew a track has a gap in them.
   *
   * Re-sending is free by the protocol's own design: every `watch_*` handler in
   * `lom.ts` clears and rebuilds before it installs, which is why `on` is
   * forwarded on every subscribe and only `off` is edge-triggered.
   */
  let armedFor = -1;

  const arm = (trackCount: number) => {
    armedFor = trackCount;
    // Three viewport watches and no more. Play state is which scene; transport
    // is the tempo the set is actually running at; status is where each playing
    // clip is in its loop. Meters, the mixer and the device chains are somebody
    // else's client.
    send({ type: 'watchPlay', on: true });
    send({ type: 'watchTransport', on: true });
    send({ type: 'watchStatus', on: true });
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
  const take = (event: OpenFlow.Event): boolean => {
    switch (event.type) {
      case 'status':
        state.lomReady = event.lomReady;
        // The LOM going ready is what makes an earlier refusal worth retrying,
        // and it arrives unprompted. Both the set and the watches were refused
        // by the same "device not ready", so both come back here.
        if (event.lomReady) {
          if (state.rev < 0) send({ type: 'snapshot' });
          arm(state.tracks.length);
        }
        askAgain();
        return true;
      case 'snapshot':
        state.rev = event.data.rev;
        state.tempo = event.data.tempo;
        state.tracks = event.data.tracks;
        state.scenes = event.data.scenes;
        state.model = event.model;
        // A set with a different number of tracks than the watches were built
        // against has tracks nothing is observing.
        if (state.tracks.length !== armedFor) arm(state.tracks.length);
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
      case 'clipNotes': {
        // Replaced wholesale rather than merged. The ask is always "the clips
        // playing now", so anything held that is not in the answer is a clip
        // that stopped — and an upsert would leave its notes behind to be read
        // as harmony that is no longer sounding.
        const held = new Map<string, OpenFlow.ClipNotes>();
        for (const clip of event.clips) held.set(`${clip.t}:${clip.s}`, clip);
        state.notes = held;
        return true;
      }
      case 'clipStatus':
        state.status = event.frame.tracks;
        // **Not a change.** Positions move twenty times a second and are read
        // rather than diffed against; letting them mark the chart dirty would
        // push the whole song list at 20 Hz to report that a playhead moved.
        // They ride their own slower stream — see `index.ts`.
        return false;
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
      // Armed now for the common case — a bridge that is already up — and
      // re-armed by `arm` above when it is not, or when the set changes shape.
      arm(-1);
      onChange();
    });

    ws.addEventListener('message', (message: MessageEvent) => {
      let event: OpenFlow.Event;
      try {
        event = JSON.parse(String(message.data)) as OpenFlow.Event;
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
      state.status = [];
      state.notes = new Map();
      state.rolling = false;
      armedFor = -1;
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
    nudgeTempo(by) {
      if (!state.lomReady || !Number.isFinite(by)) return null;
      const want = Math.round(state.tempo) + Math.round(by);
      if (want < MIN_TEMPO || want > MAX_TEMPO) return null;
      send({ type: 'setTransport', patch: { tempo: want } });
      return want;
    },
    readNotes(clips) {
      if (!state.lomReady || clips.length === 0) return;
      send({ type: 'clipNotes', clips });
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      if (asking) clearTimeout(asking);
      socket?.close();
    },
  };
}
