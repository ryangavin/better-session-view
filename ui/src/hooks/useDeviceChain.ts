import { useCallback, useEffect, useState } from 'react';
import type { BridgeState } from './useBridge.js';

/**
 * Which track's device chain the footer is showing, and what's in it.
 *
 * **A read, not a watch.** `Track.devices` is observable, but the bridge
 * refcounts every watch per *kind* across clients and this one would have to be
 * refcounted per kind and per track — see `devices` in the protocol. So the
 * chain is fetched when the track changes and re-fetched on request, and a
 * device added in Live until then simply isn't there yet.
 *
 * Selecting a track tells Live as well. Its own device view shows the selected
 * track's chain, and a footer here pointed at one track while Live points at
 * another is two answers to the same question.
 */
export interface DeviceChainState {
  /** The track being shown, or null when the footer is closed. */
  track: number | null;
  devices: BSV.ChainDevice[];
  /** A read is in flight. The footer says so rather than flashing empty. */
  loading: boolean;
  /** The read failed or the track has gone. Distinct from "no devices". */
  failed: boolean;
  onSelectTrack: (t: number) => void;
  onRefresh: () => void;
  onClose: () => void;
}

export function useDeviceChain({
  lomReady,
  selectTrack,
  readDevices,
}: {
  lomReady: boolean;
  selectTrack: BridgeState['selectTrack'];
  readDevices: BridgeState['readDevices'];
}): DeviceChainState {
  const [track, setTrack] = useState<number | null>(null);
  const [devices, setDevices] = useState<BSV.ChainDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped to re-run the read against the same track. A counter rather than a
  // function call so the fetch stays in one effect with one cancellation path.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (track === null || !lomReady) return;
    // The socket answers out of order across selections — click three headers
    // quickly and the first reply can land last. Whoever is still current wins.
    let current = true;
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        const state = await readDevices(track);
        if (!current) return;
        // A reply for a track we're no longer showing is stale, and a null state
        // means the index didn't resolve — a set that shrank underneath us.
        setDevices(state && state.t === track ? state.devices : []);
        setFailed(state === null);
      } catch {
        if (!current) return;
        setDevices([]);
        setFailed(true);
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [track, lomReady, readDevices, attempt]);

  const onSelectTrack = useCallback(
    (t: number) => {
      setTrack((shown) => {
        // Re-picking the track already on screen is a refresh, not a no-op:
        // it's the gesture reached for when Live has moved on since the read.
        if (shown === t) setAttempt((n) => n + 1);
        else setDevices([]);
        return t;
      });
      selectTrack(t);
    },
    [selectTrack],
  );

  const onRefresh = useCallback(() => setAttempt((n) => n + 1), []);

  const onClose = useCallback(() => {
    setTrack(null);
    setDevices([]);
    setFailed(false);
  }, []);

  return { track, devices, loading, failed, onSelectTrack, onRefresh, onClose };
}
