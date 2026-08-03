import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogLine } from './useBridge.js';

/**
 * The rail, and the log, both start closed.
 *
 * Neither is the thing you came for. The grid is, and on a 40-track set every
 * pixel the rail isn't using is a track column you can see. The rail opens the
 * moment you pick something to work on, which is the only time it has anything
 * to say — see `openRail`.
 */
export function useRailAndLog(log: LogLine[]) {
  const [showRail, setShowRail] = useState(false);
  const [showLog, setShowLog] = useState(false);

  /**
   * Open the rail because a selection gesture just happened.
   *
   * Called from the three places that mean "I want to work on this" — a clip, a
   * scene name, a song — rather than from an effect on the selection itself. An
   * effect would also fire when a selection is *cleared*, and reopening the rail
   * on the click that emptied it is the opposite of what closing it asked for.
   */
  const openRail = useCallback(() => setShowRail(true), []);

  /**
   * Close the chrome, and only the chrome. Closing the rail also drops the
   * selection, but the selection isn't owned here — `App` composes the two
   * into `closeRail`.
   */
  const hideRail = useCallback(() => setShowRail(false), []);

  /**
   * An error opens the log, however it got closed.
   *
   * Hiding diagnostics is fine right up until something fails silently, and
   * every write in this app goes through `guard()` and lands here rather than
   * throwing. So the one kind of line that can't be missed shows itself.
   *
   * Tracks the highest id seen rather than looking at `log[0]`: `say` prepends,
   * and a burst can put an info line in front of the error that arrived with it.
   */
  const seenLogId = useRef(0);
  useEffect(() => {
    const fresh = log.filter((l) => l.id > seenLogId.current);
    if (fresh.length === 0) return;
    seenLogId.current = fresh[0]!.id;
    if (fresh.some((l) => l.kind === 'error')) setShowLog(true);
  }, [log]);

  const toggleLog = useCallback(() => setShowLog((v) => !v), []);

  return { showRail, openRail, hideRail, showLog, toggleLog };
}
