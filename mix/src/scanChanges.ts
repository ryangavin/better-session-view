import { openflow } from './openflow.ts';

const listeners = new Map<string, Set<() => void>>();
let disconnect: (() => void) | undefined;
const keyOf = (root: string, trackId: string) => JSON.stringify([root, trackId]);

/** One IPC listener for every mounted row; changes reach only their own track. */
export function onScanChange(root: string, trackId: string, hear: () => void): () => void {
  const key = keyOf(root, trackId);
  let group = listeners.get(key);
  if (!group) { group = new Set(); listeners.set(key, group); }
  group.add(hear);
  if (!disconnect) disconnect = openflow()?.analysis.onScansChanged?.(change => {
    listeners.get(keyOf(change.root, change.trackId))?.forEach(listener => listener());
  });
  return () => {
    group.delete(hear);
    if (!group.size) listeners.delete(key);
    if (!listeners.size) { disconnect?.(); disconnect = undefined; }
  };
}
