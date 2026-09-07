import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Track } from '../openflow.ts';
import { loadDeckAsset, params } from './decks.ts';
import { MixerEngine } from './engine.ts';

/** The single adapter between the controlled widget face and the playback owner. */
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
  const state = useSyncExternalStore(engine.subscribe, engine.snapshot);
  const load = useCallback(async (deckId: string, trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (root && track) await engine.load(deckId, track, loader);
  }, [engine, tracks, root, loader]);
  return { state, commands: engine.commands, readFrame: engine.readFrame, params, load, engine };
}
