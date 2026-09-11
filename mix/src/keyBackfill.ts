import { detectedKey } from './keyDetection.ts';
import { runKeyQueue, type KeyQueueProgress } from './keyQueue.ts';
import type { Library } from './openflow.ts';
import { keyLabel } from './key.ts';

export interface KeyBackfillAPI {
  read(): Promise<Library>;
  busy(): Promise<boolean>;
  analyze(id: string): Promise<Library>;
}

export function keyBackfillPlan(library: Library, reanalyze = false) {
  const eligible = library.tracks.filter(t => !!t.file);
  const pending = eligible.filter(t => reanalyze || !detectedKey(t));
  return { pending, eligible: eligible.length, alreadyDone: eligible.length - pending.length,
    missingOriginal: library.tracks.length - eligible.length };
}
export type KeyBackfillProgress = KeyQueueProgress;

/** Developer backfill uses the app's worker, so it shares the engine lease. */
export async function backfillKeys(api: KeyBackfillAPI, options: {
  run: boolean;
  progress?: (progress: KeyBackfillProgress) => void;
  reanalyze?: boolean;
  stopped?: () => boolean;
  report: (message: string) => void;
}) {
  const library = await api.read();
  if (!library.root || library.problem) throw new Error(library.problem || 'Choose a library in mix[flow] first');
  const { pending, alreadyDone, missingOriginal } = keyBackfillPlan(library, options.reanalyze);
  const result = { completed: 0, failed: 0, skipped: library.tracks.length - pending.length, stopped: false };
  options.report(`${pending.length} to analyze; ${alreadyDone} already analyzed; ${missingOriginal} without original audio.`);
  if (!options.run) {
    options.progress?.({ ...result, total: pending.length, current: null });
    for (const track of pending) options.report(`Would analyze: ${track.title}`);
    return result;
  }
  return runKeyQueue(pending, { ...options, root: library.root, skipped: result.skipped,
    readRoot: async () => (await api.read()).root, busy: () => api.busy(),
    execute: async track => {
      const updated = await api.analyze(track.id);
      const song = updated.tracks.find(t => t.id === track.id);
      if (!song || !detectedKey(song)) throw new Error('No saved key analysis returned');
      return keyLabel(song);
    },
  });
}
