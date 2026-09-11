export interface KeyQueueProgress { completed: number; failed: number; skipped: number; stopped: boolean; total: number; current: string | null }
/** One explicit queue for diagnostic jobs. Stopping never kills another client's worker. */
export async function runKeyQueue<T extends {id:string;title:string}>(tracks: readonly T[], options: {
  root: string; skipped: number; readRoot(): Promise<string | null>; busy(): Promise<boolean>;
  execute(track:T):Promise<string>; stopped?:()=>boolean; report(message:string):void; progress?(value:KeyQueueProgress):void;
}) {
  const result = {completed:0,failed:0,skipped:options.skipped,stopped:false};
  const progress = (current:string|null) => options.progress?.({...result,total:tracks.length,current});
  progress(null);
  for (const [index,track] of tracks.entries()) {
    if (options.stopped?.()) { result.stopped = true; break; }
    if (await options.readRoot() !== options.root) throw new Error('Library changed; stopped before analyzing another song');
    if (await options.busy()) throw new Error('The engine is busy; rerun when its current job finishes');
    if (options.stopped?.()) { result.stopped = true; break; }
    progress(track.title); options.report(`[${index+1}/${tracks.length}] Analyzing ${track.title}`);
    try { options.report(`${track.title}: ${await options.execute(track)}`); result.completed++; }
    catch (error) { result.failed++; options.report(`${track.title}: failed — ${String(error)}`); }
    progress(null);
  }
  if (options.stopped?.()) result.stopped = true;
  progress(null);
  options.report(`${result.completed} completed; ${result.failed} failed; ${result.skipped} skipped${result.stopped ? '; stopped' : ''}.`);
  return result;
}
