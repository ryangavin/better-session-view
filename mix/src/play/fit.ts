import { playbackGrid } from '../musical.ts';
import { FIRST_CHOICE } from '../algorithms.ts';
import { monoOf } from '../flux.ts';
import type { Analysis } from '../openflow.ts';
import type { Found } from './fit.worker.ts';

/**
 * Find a track's beat grid without stopping the window.
 *
 * A track that was never prepared arrived at a deck with no grid at all, which
 * is Sync greyed out and a launch that cannot wait for the bar — and the only
 * way to get one was to separate stems first, which is minutes of GPU for a
 * fact about the audio that takes two seconds to establish. The deck now
 * establishes it on the original it has already decoded.
 *
 * In a worker because those two seconds are arithmetic, not waiting: on the
 * window's thread they stop all four decks, the meters and the waveforms, and
 * a drop in the middle of a set is exactly when that is least affordable.
 */
export async function findGrid(buffer: AudioBuffer, signal: AbortSignal): Promise<Found | null> {
  signal.throwIfAborted();
  const channels = Array.from({length: buffer.numberOfChannels}, (_,i) => buffer.getChannelData(i));
  // A copy, and then handed over rather than cloned: `monoOf` returns the
  // deck's own samples untouched for a mono file, and transferring those would
  // take the audio out from under the deck that is about to play it.
  const mono = Float32Array.from(monoOf(channels));
  // No worker is not a refusal. A refusal is written down and never asked
  // again; a doorway that would not open is nothing found out about the track.
  let worker: Worker;
  try { worker = new Worker(new URL('./fit.worker.ts', import.meta.url), {type:'module'}); } catch { return null; }
  try {
    return await new Promise<Found>((resolve, reject) => {
      const stop = () => { reject(signal.reason); };
      signal.addEventListener('abort', stop, {once:true});
      worker.onmessage = (event: MessageEvent<Found>) => { signal.removeEventListener('abort', stop); resolve(event.data); };
      worker.onerror = () => { signal.removeEventListener('abort', stop); resolve({found:null, beats:null}); };
      worker.postMessage({mono, rate: buffer.sampleRate, length: buffer.length}, [mono.buffer]);
    });
  } finally { worker.terminate(); }
}

/** The grid and reading a found beat makes, in the shape the library keeps. */
export function gridOf(found: Found): Pick<Analysis,'grid'|'fit'> {
  if (!found.found) return {grid: null, fit: null};
  const beats = found.beats ?? ('beats' in found.found ? found.found.beats : null);
  const { beats: _held, ...reading } = { beats: undefined, ...found.found };
  return {
    grid: playbackGrid({ bpm: found.found.bpm, bpmAuto: true, offset: found.found.offset, beats: beats ?? null }, FIRST_CHOICE),
    fit: reading,
  };
}
