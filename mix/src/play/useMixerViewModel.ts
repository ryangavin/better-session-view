import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Track } from '../openflow.ts';
import { loadDeckAsset, params } from './decks.ts';
import { MixerEngine } from './engine.ts';

/** Own lifetime/loading here; consuming views subscribe so control edits never render App. */
export function useMixerViewModel(tracks: readonly Track[], root: string | null, loader = loadDeckAsset) {
  const engine = useMemo(() => new MixerEngine(), [root]);
  const releases = useRef(new Set<MixerEngine>());
  useEffect(() => {
    releases.current.delete(engine);
    return () => {
      engine.cancelLoads();
      releases.current.add(engine);
      // StrictMode replays effects synchronously; only a real release disposes audio.
      queueMicrotask(() => { if (releases.current.delete(engine)) engine.dispose(); });
    };
  }, [engine]);
  const load = useCallback(async (deckId: string, trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (root && track) await engine.load(deckId, track, loader);
  }, [engine, tracks, root, loader]);
  return { commands: engine.commands, readFrame: engine.readFrame, params, load, engine };
}
