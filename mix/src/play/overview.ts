import type { SpectralEnergy } from '@openflow/widgets/theme/spectral.ts';
import { beatAt, sampleOf, type Beats } from '../warp.ts';
import type { Peak } from '../audio.ts';
import { SCAN_RATE, SCAN_VALUES, walk, type Samples, type Scan } from './scan.ts';

/** Original-track overview; its origin can precede bar 1. Eight measurements per beat. */
export interface Overview { start: number; peaks: Peak[]; spectrum: SpectralEnergy[] }

/**
 * Somewhere for a long walk to let the window past, without a timer.
 *
 * `setTimeout(0)` is clamped to four milliseconds as soon as it is nested, and
 * to a second or more in a window the system has decided is not on screen — so
 * a walk that pauses often enough to stay cancellable spent longer parked than
 * reading, and behind another app it appeared to hang. A message is a task like
 * any other and is throttled as neither.
 */
function breather() {
  const channel = new MessageChannel();
  channel.port1.start();
  return {
    pause: () => new Promise<void>(resolve => { channel.port1.onmessage = () => resolve(); channel.port2.postMessage(0); }),
    close: () => { channel.port1.close(); channel.port2.close(); },
  };
}
/**
 * Walk a decoded buffer without stalling the window.
 *
 * It comes up for air on a time budget rather than every so many bins, so a
 * replacement drop still cancels within a frame while the walk is not mostly
 * spent waiting.
 */
export async function measureScan(buffer: AudioBuffer, signal: AbortSignal, rate = SCAN_RATE): Promise<Scan> {
  const source: Samples = {
    channels: Array.from({length: buffer.numberOfChannels}, (_,i) => buffer.getChannelData(i)),
    sampleRate: buffer.sampleRate, length: buffer.length, duration: buffer.duration,
  };
  signal.throwIfAborted();
  const air = breather();
  try {
    const steps = walk(source, rate);
    let mark = performance.now(), since = 0;
    for (;;) {
      const step = steps.next();
      if (step.done) return step.value;
      if (++since % 16 === 0) {
        signal.throwIfAborted();
        if (performance.now() - mark >= 12) { await air.pause(); signal.throwIfAborted(); mark = performance.now(); }
      }
    }
  } finally { air.close(); }
}

/**
 * The columns a grid asks for, gathered out of a scan.
 *
 * A column covers whatever span of time its eighth of a beat covers, which is
 * a handful of scan bins; a column falling entirely past the end of the audio
 * is silent, the way walking the samples there found nothing.
 */
export function overviewOf(scan: Scan, map: Beats, duration: number): Overview {
  const start = Math.floor(beatAt(map, 0) * 8) / 8;
  const end = Math.ceil(beatAt(map, duration * map.rate) * 8) / 8;
  const count = Math.max(1, Math.round((end - start) * 8));
  const binAt = (beat: number) => Math.round(sampleOf(map, beat) / map.rate * scan.rate);
  const peaks: Peak[] = [], spectrum: SpectralEnergy[] = [];
  let from = binAt(start);
  for (let column = 0; column < count; column++) {
    const to = column === count - 1 ? scan.bins : binAt(start + (column + 1) / 8);
    const lo = Math.max(0, from), hi = Math.min(scan.bins, Math.max(lo + 1, to));
    if (lo >= scan.bins) { peaks.push({min:0,max:0}); spectrum.push([0,0,0]); from = to; continue; }
    let min = 0, max = 0, low = 0, mid = 0, high = 0;
    for (let bin = lo; bin < hi; bin++) {
      const k = bin * SCAN_VALUES;
      min = Math.min(min, scan.values[k]); max = Math.max(max, scan.values[k+1]);
      low += scan.values[k+2]; mid += scan.values[k+3]; high += scan.values[k+4];
    }
    const spread = hi - lo;
    peaks.push({min,max}); spectrum.push([low/spread, mid/spread, high/spread]);
    from = to;
  }
  return {start, peaks, spectrum};
}
