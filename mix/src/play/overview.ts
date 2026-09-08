import type { SpectralEnergy } from '@openflow/widgets/theme/spectral.ts';
import { beatAt, sampleOf, type Beats } from '../warp.ts';
import type { Peak } from '../audio.ts';

/** Original-track overview; its origin can precede bar 1. Eight measurements per beat. */
export interface Overview { start: number; peaks: Peak[]; spectrum: SpectralEnergy[] }

/**
 * One source walked once, on a clock rather than on the grid.
 *
 * Reading forty million samples is the expensive half of loading a deck, and
 * doing it in beat columns tied the answer to the grid that was current when
 * it was walked — so an edited beat grid meant walking the samples again. A
 * scan is measured against time, kept beside the track, and any grid's columns
 * are drawn from it by `overviewOf` in a few milliseconds.
 *
 * Five values a bin, interleaved: the widest excursion of either channel, then
 * the low/mid/high energy of the same span.
 */
export interface Scan { rate: number; bins: number; values: Float32Array }

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
/** Bins a second. Five milliseconds apiece, several to a drawn column at any tempo. */
export const SCAN_RATE = 200;
export const SCAN_VALUES = 5;

/**
 * Read decoded samples once, never a rescaled proxy.
 *
 * Persistent 250/2500 Hz crossover states measure low/mid/high energy; the peak
 * silhouette retains the widest excursion of either channel. It comes up for
 * air on a time budget rather than every so many bins, so a replacement drop
 * still cancels within a frame while the walk is not mostly spent waiting.
 */
export async function measureScan(buffer: AudioBuffer, signal: AbortSignal, rate = SCAN_RATE): Promise<Scan> {
  const bins = Math.max(1, Math.round(buffer.duration * rate));
  const values = new Float32Array(bins * SCAN_VALUES);
  const channels = Array.from({length:buffer.numberOfChannels}, (_,i) => buffer.getChannelData(i));
  const a = 1 - Math.exp(-2 * Math.PI * 250 / buffer.sampleRate);
  const b = 1 - Math.exp(-2 * Math.PI * 2500 / buffer.sampleRate);
  const lower = new Float64Array(channels.length), upper = new Float64Array(channels.length);
  const air = breather();
  try {
    let from = 0, mark = performance.now();
    for (let bin = 0; bin < bins; bin++) {
      if (bin % 16 === 0) {
        signal.throwIfAborted();
        if (performance.now() - mark >= 12) {
          await air.pause();
          signal.throwIfAborted();
          mark = performance.now();
        }
      }
      const to = bin === bins - 1 ? buffer.length : Math.min(buffer.length, Math.round((bin + 1) / rate * buffer.sampleRate));
      let min = 0, max = 0, low = 0, mid = 0, high = 0;
      for (let c = 0; c < channels.length; c++) {
        const channel = channels[c];
        let l = lower[c], u = upper[c];
        for (let n = from; n < to; n++) {
          const value = channel[n];
          min = Math.min(min, value); max = Math.max(max, value);
          l += a * (value - l); u += b * (value - u);
          low += l*l; mid += (u-l)**2; high += (value-u)**2;
        }
        lower[c] = l; upper[c] = u;
      }
      const samples = Math.max(1, (to-from)*channels.length), k = bin * SCAN_VALUES;
      values[k] = min; values[k+1] = max;
      values[k+2] = low/samples; values[k+3] = mid/samples; values[k+4] = high/samples;
      from = to;
    }
    return {rate, bins, values};
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
