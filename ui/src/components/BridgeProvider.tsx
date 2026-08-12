import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useBridge } from '../hooks/useBridge.js';
import { BridgeContext, type BridgeSession } from '../hooks/useBridgeSession.js';

/**
 * Owns the connection to Live — above the app rather than inside it.
 *
 * `useBridge` used to be called from `App`, which put the socket, the watches
 * and the snapshot inside the one component every edit touches. React Fast
 * Refresh treats a component whose module updated two ways, and both of them
 * were charging an edit to the UI against Live's main thread:
 *
 * - **Re-render with fresh dependencies.** React deliberately ignores the
 *   previous deps of every `useMemo`, `useCallback` and `useEffect` in a
 *   component it just hot-updated, so `useMemo(() => new BridgeClient(), [])`
 *   built a *new* client, which dropped the socket, reconnected, and re-armed
 *   every watch.
 * - **Remount.** When the signature of any hook a component calls changes —
 *   its own, or one nested inside a custom hook it uses — React can't know the
 *   state still means the same thing, so it remounts instead. That drops the
 *   snapshot, and the once-per-session walk in `useBridge` fires again on the
 *   next `lomReady`.
 *
 * The second is the expensive one: a full walk is ~950ms of Live's main thread
 * with the sync modal over the screen. The first costs a reconnect and a
 * re-arm, and re-arming `observe` re-attaches the `tracks` and `scenes`
 * observers — Live calls at least its numeric observers back on attach (see
 * `watch_selection` in `lom.ts`), and a callback there is broadcast as
 * `changed structure`, which sends **every** connected client for a full walk.
 *
 * Vite hands a hot update to the importers of the file that changed until it
 * reaches one that accepts it. Every hook under `hooks/`, and every module
 * under `lib/` and `core/` that isn't a component, reaches `App` that way — so
 * editing any of them was the same gesture as re-reading forty tracks.
 *
 * This component is where that stops. It's the parent of `App` and it lives in
 * a file that changes when the *bridge* changes rather than when the UI does,
 * so a hot update below it re-renders or remounts `App` while the socket, the
 * watches, the device state and the snapshot stay exactly where they were.
 *
 * Editing `useBridge.ts` or `client.ts` still reconnects, because those are
 * this file's own dependencies. That's the right bill for that edit.
 */
export function BridgeProvider({ children }: { children: ReactNode }) {
  const [showStopClips, setShowStopClips] = useState(true);
  const [showMeters, setShowMeters] = useState(false);
  const [showSends, setShowSends] = useState(false);
  const toggleMeters = useCallback(() => {
    setShowMeters((shown) => !shown);
    setShowSends(false);
  }, []);
  const toggleSends = useCallback(() => {
    setShowMeters(true);
    setShowSends((shown) => !shown);
  }, []);
  const toggleStopClips = useCallback(() => {
    setShowStopClips((shown) => !shown);
  }, []);
  // The status displays live in the stop row, so its toggle is their watch.
  const bridge = useBridge(showMeters, showSends, showStopClips);

  // `bridge` is a fresh object every render, so this memo doesn't stop anything
  // re-rendering — App re-renders when bridge state changes, exactly as it did
  // when it called `useBridge` itself. It's here to keep the context value one
  // expression rather than an object literal in the JSX.
  const session = useMemo<BridgeSession>(
    () => ({
      ...bridge,
      showStopClips,
      showMeters,
      showSends,
      toggleStopClips,
      toggleMeters,
      toggleSends,
    }),
    [
      bridge,
      showStopClips,
      showMeters,
      showSends,
      toggleStopClips,
      toggleMeters,
      toggleSends,
    ],
  );

  return <BridgeContext.Provider value={session}>{children}</BridgeContext.Provider>;
}
