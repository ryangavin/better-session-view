import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { BridgeState } from './useBridge.js';

/**
 * A tiny external store for the high-frequency meter stream.
 *
 * It retains and publishes values only for track indexes with a mounted meter.
 * That makes visibility the filter: collapsing a group unmounts its descendant
 * headers, which unsubscribes those tracks without a second visibility model.
 */
export class MeterStore {
  private readonly levels = new Map<number, number>();
  private readonly listeners = new Map<number, Set<() => void>>();

  update = (meters: readonly BSV.TrackMeterLevel[]): void => {
    if (this.listeners.size === 0) return;
    const frame = new Map<number, number>();
    for (const meter of meters) {
      if (this.listeners.has(meter.t)) frame.set(meter.t, meter.level);
    }
    for (const [trackIndex, listeners] of this.listeners) {
      const raw = frame.get(trackIndex) ?? 0;
      const next = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
      if (this.level(trackIndex) === next) continue;
      this.levels.set(trackIndex, next);
      for (const listener of listeners) listener();
    }
  };

  clear = (): void => {
    for (const [trackIndex, listeners] of this.listeners) {
      if (this.level(trackIndex) === 0) continue;
      this.levels.set(trackIndex, 0);
      for (const listener of listeners) listener();
    }
  };

  level = (trackIndex: number): number => this.levels.get(trackIndex) ?? 0;

  subscribe = (trackIndex: number, listener: () => void): (() => void) => {
    const listeners = this.listeners.get(trackIndex) ?? new Set();
    listeners.add(listener);
    this.listeners.set(trackIndex, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size > 0) return;
      this.listeners.delete(trackIndex);
      this.levels.delete(trackIndex);
    };
  };
}

/** Subscribe one store to the bridge without putting meter frames in React state. */
export function useMeters(
  subscribeMeters: BridgeState['subscribeMeters'],
  active: boolean,
): MeterStore {
  const store = useMemo(() => new MeterStore(), []);

  useEffect(() => subscribeMeters(store.update), [store, subscribeMeters]);
  useEffect(() => {
    if (!active) store.clear();
  }, [active, store]);

  return store;
}

const zero = () => 0;

/** The current level for one rendered track. Only that component re-renders. */
export function useTrackMeter(store: MeterStore, trackIndex: number): number {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(trackIndex, listener),
    [store, trackIndex],
  );
  const snapshot = useCallback(() => store.level(trackIndex), [store, trackIndex]);
  return useSyncExternalStore(subscribe, snapshot, zero);
}
