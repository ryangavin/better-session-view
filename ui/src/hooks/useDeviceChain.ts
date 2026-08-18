import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BridgeState } from './useBridge.js';

/**
 * Which track's device chain the footer is showing, and what's in it.
 *
 * **A watch, not a read**, and that inverts what this hook used to be. It once
 * fetched a track's whole chain on demand — every rack, every chain, every
 * nested device in one answer — because a watch could only be armed per *kind*,
 * and this one needs a target. Now that a watch can carry one, the footer
 * declares what it is looking at and the bridge keeps it current.
 *
 * So the hook's job is to say what is **visible**, which is a smaller thing than
 * what exists:
 *
 * - the shown track's own device run, always;
 * - for every rack in a run that is open, the one chain it is showing;
 * - and recursively into that, because a rack inside a chain is the same case.
 *
 * A folded rack contributes nothing. A rack's other seven chains contribute
 * nothing. That is the entire point — following a closed rack's contents is
 * ~120 LOM observers for something nobody is looking at.
 *
 * The tree therefore fills in a level per round trip: subscribing to the track
 * run reveals which of its devices are racks, which adds their open chains to
 * the next declaration. On a local socket that is invisible, and it is what
 * keeps the client from ever having to know a rack's shape before asking.
 */

/** Address of a *run* — even length. `[]` is the track's own device list. */
function runKey(path: readonly number[]): string {
  return path.join('.');
}

/** Address of a *device* — odd length, so it can't collide with a run. */
function deviceKey(path: readonly number[], index: number): string {
  return [...path, index].join('.');
}

/**
 * Everything on screen, as subscriptions.
 *
 * Walks what we already hold rather than what exists in Live, because those are
 * the same thing here: a run we haven't subscribed to has no devices to walk,
 * so the recursion stops exactly where the client's knowledge does.
 */
function visibleRuns(
  t: number,
  chains: readonly BSV.WatchedChain[],
  chainAt: Readonly<Record<string, number>>,
): BSV.ChainWatch[] {
  const known = new Map(chains.filter((c) => c.t === t).map((c) => [runKey(c.path), c]));
  const subs: BSV.ChainWatch[] = [{ t, path: [], open: [] }];

  const descend = (path: number[]) => {
    const run = known.get(runKey(path));
    if (!run?.devices) return;
    run.devices.forEach((device, i) => {
      const count = device.chains?.length ?? 0;
      // A rack drawn shut is showing nothing, so nothing inside it is watched.
      if (count === 0 || device.folded) return;
      const chosen = Math.min(chainAt[deviceKey(path, i)] ?? 0, count - 1);
      const inner = [...path, i, chosen];
      subs.push({ t, path: inner, open: [] });
      descend(inner);
    });
  };

  descend([]);
  return subs;
}

export interface DeviceChainState {
  /** The track being shown, or null when the footer is closed. */
  track: number | null;
  /** The shown track's own device run. Empty until the first push lands. */
  devices: BSV.ChainDevice[];
  /** Nothing has arrived for the shown track yet. */
  loading: boolean;
  /** The track no longer resolves in Live. Distinct from "no devices". */
  failed: boolean;
  /** One rack's chain devices, or undefined while its subscription is in flight. */
  runAt: (path: readonly number[]) => BSV.ChainDevice[] | null | undefined;
  /** Which chain a rack is showing. */
  chainAt: (path: readonly number[], index: number) => number;
  onChain: (path: readonly number[], index: number, chain: number) => void;
  onSelectTrack: (t: number) => void;
  onClose: () => void;
}

export function useDeviceChain({
  lomReady,
  selectTrack,
  watchChains,
  subscribeChains,
}: {
  lomReady: boolean;
  selectTrack: BridgeState['selectTrack'];
  watchChains: BridgeState['watchChains'];
  subscribeChains: BridgeState['subscribeChains'];
}): DeviceChainState {
  const [track, setTrack] = useState<number | null>(null);
  const [state, setState] = useState<BSV.ChainState | null>(null);
  const [chosen, setChosen] = useState<Record<string, number>>({});

  useEffect(() => subscribeChains(setState), [subscribeChains]);

  const subs = useMemo(
    () => (track === null ? [] : visibleRuns(track, state?.chains ?? [], chosen)),
    [track, state, chosen],
  );

  // Keyed on the declaration's *content*, not its identity. Every push rebuilds
  // `subs`, and almost none of them change what is being watched — re-sending
  // an identical one is harmless (the bridge drops it) but it is a message per
  // knob turn once parameters land, which is the shape to avoid before it is a
  // problem rather than after.
  const declaration = JSON.stringify(subs);
  useEffect(() => {
    if (!lomReady) return;
    watchChains(JSON.parse(declaration) as BSV.ChainWatch[]);
  }, [lomReady, watchChains, declaration]);

  const byRun = useMemo(() => {
    const map = new Map<string, BSV.ChainDevice[] | null>();
    for (const chain of state?.chains ?? []) {
      if (track !== null && chain.t === track) map.set(runKey(chain.path), chain.devices);
    }
    return map;
  }, [state, track]);

  const runAt = useCallback(
    (path: readonly number[]) => byRun.get(runKey(path)),
    [byRun],
  );

  const chainAt = useCallback(
    (path: readonly number[], index: number) => chosen[deviceKey(path, index)] ?? 0,
    [chosen],
  );

  const onChain = useCallback((path: readonly number[], index: number, chain: number) => {
    setChosen((held) => ({ ...held, [deviceKey(path, index)]: chain }));
  }, []);

  const onSelectTrack = useCallback(
    (t: number) => {
      setTrack((shown) => {
        // A different track's runs are addressed by paths that mean something
        // else entirely, so held chain picks can't carry over.
        if (shown !== t) setChosen({});
        return t;
      });
      selectTrack(t);
    },
    [selectTrack],
  );

  const onClose = useCallback(() => {
    setTrack(null);
    setChosen({});
  }, []);

  const run = byRun.get(runKey([]));
  return {
    track,
    devices: run ?? [],
    // `undefined` is "nothing has arrived", `null` is "Live says it's gone".
    loading: track !== null && run === undefined,
    failed: run === null,
    runAt,
    chainAt,
    onChain,
    onSelectTrack,
    onClose,
  };
}
