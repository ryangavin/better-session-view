import type { Library } from '../src/openflow.ts';
import { keyLabel, savedKey } from '../src/key.ts';

export interface KeyBackfillAPI {
  read(): Promise<Library>;
  busy(): Promise<boolean>;
  analyze(id: string): Promise<Library>;
}

/** Developer backfill uses the app's worker, so it shares the engine lease. */
export async function backfillKeys(api: KeyBackfillAPI, options: {
  run: boolean;
  reanalyze?: boolean;
  stopped?: () => boolean;
  report: (message: string) => void;
}) {
  const library = await api.read();
  if (!library.root || library.problem) throw new Error(library.problem || 'Choose a library in mix[flow] first');
  const tracks = library.tracks.filter(t => t.stems && t.model && t.sources.includes('bass'));
  const pending = tracks.filter(t => options.reanalyze || !savedKey(t));
  const result = { completed: 0, failed: 0, skipped: library.tracks.length - pending.length, stopped: false };
  options.report(`${pending.length} to analyze; ${tracks.length - pending.length} already analyzed; ${library.tracks.length - tracks.length} without bass stems.`);
  if (!options.run) {
    for (const track of pending) options.report(`Would analyze: ${track.title}`);
    return result;
  }
  for (const [index, track] of pending.entries()) {
    if (options.stopped?.()) { result.stopped = true; break; }
    const current = await api.read();
    if (current.root !== library.root) throw new Error('Library changed; stopped before analyzing another song');
    if (await api.busy()) throw new Error('The engine is busy; rerun when its current job finishes');
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
  }
  options.report(`${result.completed} completed; ${result.failed} failed; ${result.skipped} skipped${result.stopped ? '; stopped' : ''}.`);
  return result;
}
