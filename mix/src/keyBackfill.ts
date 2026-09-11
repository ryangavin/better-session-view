import type { Library } from './openflow.ts';
import { keyLabel, savedKey } from './key.ts';

export interface KeyBackfillAPI {
  read(): Promise<Library>;
  busy(): Promise<boolean>;
  analyze(id: string): Promise<Library>;
}

export function keyBackfillPlan(library: Library, reanalyze = false) {
  const eligible = library.tracks.filter(t => t.stems && t.model && t.sources.includes('bass'));
  const pending = eligible.filter(t => reanalyze || !savedKey(t));
  return { pending, eligible: eligible.length, alreadyDone: eligible.length - pending.length,
    missingStems: library.tracks.length - eligible.length };
}
export interface KeyBackfillProgress {
  completed: number; failed: number; skipped: number; stopped: boolean;
  total: number; current: string | null;
}

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
  const { pending, alreadyDone, missingStems } = keyBackfillPlan(library, options.reanalyze);
  const result = { completed: 0, failed: 0, skipped: library.tracks.length - pending.length, stopped: false };
  options.report(`${pending.length} to analyze; ${alreadyDone} already analyzed; ${missingStems} without bass stems.`);
  const progress = (current: string | null) => options.progress?.({ ...result, total: pending.length, current });
  progress(null);
  if (!options.run) {
    for (const track of pending) options.report(`Would analyze: ${track.title}`);
    return result;
  }
  for (const [index, track] of pending.entries()) {
    if (options.stopped?.()) { result.stopped = true; break; }
    const current = await api.read();
    if (current.root !== library.root) throw new Error('Library changed; stopped before analyzing another song');
    if (await api.busy()) throw new Error('The engine is busy; rerun when its current job finishes');
    if (options.stopped?.()) { result.stopped = true; break; }
    progress(track.title);
    options.report(`[${index + 1}/${pending.length}] Analyzing ${track.title}`);
    try {
      const updated = await api.analyze(track.id);
      const song = updated.tracks.find(t => t.id === track.id);
      if (!song || !savedKey(song)) throw new Error('No saved key analysis returned');
      result.completed++;
      options.report(`${track.title}: ${keyLabel(song)}`);
    } catch (error) {
      result.failed++;
      options.report(`${track.title}: failed — ${String(error)}`);
    }
    progress(null);
  }
  if (options.stopped?.()) result.stopped = true;
  progress(null);
  options.report(`${result.completed} completed; ${result.failed} failed; ${result.skipped} skipped${result.stopped ? '; stopped' : ''}.`);
  return result;
}
