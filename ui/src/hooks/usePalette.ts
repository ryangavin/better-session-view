import { useCallback, useEffect, useRef, useState } from 'react';
import type { BridgeClient } from '../lib/client.js';
import { errText } from '../lib/snapshotTiming.js';
import type { Guard } from './useBridge.js';
import type { Say } from './useLog.js';

/**
 * Live's color palette: the server-side cache, and the derivation sweep that
 * fills it once per Live version.
 */
export function usePalette(client: BridgeClient, guard: Guard, say: Say) {
  const [palette, setPalette] = useState<number[]>([]);

  // The palette is cached server-side; read it before any derivation.
  useEffect(() => {
    fetch('/palette.json')
      .then((r) => r.json())
      .then((p: BSV.Palette) => setPalette(p.colors ?? []))
      .catch(() => setPalette([]));
  }, []);

  const paletteRef = useRef<number[]>([]);
  paletteRef.current = palette;
  /** Tried and failed this session — don't append a scratch track on every refresh. */
  const derivedRef = useRef(false);

  /**
   * Derive the palette if we haven't got one, before the walk.
   *
   * Once per Live version, not once per snapshot, and the difference matters.
   * The sweep appends and deletes a track, so running it on every refresh would
   * mark the set dirty every time, push churn into Live's undo history, and fire
   * the structural observer — whose whole job is to prompt a re-snapshot, which
   * is a feedback loop the moment `observe` is on. It also cannot overlap the
   * walk: the snapshot would see the scratch track as a real one. Live's palette
   * can't change within a session, so there is nothing to gain either way.
   */
  const derivePaletteOnce = useCallback(async () => {
    if (derivedRef.current || paletteRef.current.length >= 2) return;

    // Ask the server's cache rather than trusting React state, which may still
    // be waiting on the mount-time fetch if Snapshot was clicked immediately.
    // A local GET is cheap; appending a track to re-derive what we already have
    // is not.
    try {
      const cached: BSV.Palette = await (await fetch('/palette.json')).json();
      if (Array.isArray(cached.colors) && cached.colors.length >= 2) {
        setPalette(cached.colors);
        return;
      }
    } catch {
      /* no usable cache — derive it below */
    }

    derivedRef.current = true;
    try {
      say('no palette cached — deriving it once from Live…');
      const e = await client.request({ type: 'palette' });
      setPalette(e.colors);
      say(`palette — ${e.count} colors derived and cached`, 'ok');
    } catch (e) {
      // Never block the walk for this. A set you can see without swatches is
      // far better than an error where the grid should be.
      say(`palette: ${errText(e)} — continuing without it`, 'error');
    }
  }, [client, say]);

  // Manual re-derive. Normally unnecessary — refresh() does it automatically the
  // first time — so this exists for a Live upgrade that changes the palette, and
  // as the retry after an automatic attempt failed.
  const extractPalette = useCallback(
    () =>
      guard('palette', async () => {
        say('deriving palette — adds and removes one scratch track…');
        const e = await client.request({ type: 'palette' });
        derivedRef.current = true;
        setPalette(e.colors);
        say(`palette — ${e.count} colors derived from Live`, 'ok');
      }),
    [client, guard, say],
  );

  return { palette, derivePaletteOnce, extractPalette };
}
