/**
 * One source walked once, on a clock rather than on the grid.
 *
 * Reading a hundred million samples is the expensive half of loading a deck,
 * and doing it in beat columns tied the answer to the grid that happened to be
 * current, so an edited beat grid meant reading them again. A scan is measured
 * against time and kept beside the track; `overviewOf` draws any grid's columns
 * out of it in a few milliseconds.
 *
 * Five values a bin, interleaved: the widest excursion of either channel, then
 * the low/mid/high energy of the same span.
 */
export interface Scan { rate: number; bins: number; values: Float32Array }
/** Bins a second. Five milliseconds apiece, several to a drawn column at any tempo. */
export const SCAN_RATE = 200;
export const SCAN_VALUES = 5;

/** Decoded audio, however this host came by it: a browser's buffer or a file read. */
export interface Samples {
  channels: readonly Float32Array[];
  sampleRate: number;
  length: number;
  duration: number;
}

export const binsOf = (duration: number, rate = SCAN_RATE): number => Math.max(1, Math.round(duration * rate));

/**
 * The walk itself, paused by whoever drives it.
 *
 * Both the window and the separator walk stems, and a scan one of them wrote
 * has to be one the other would have written — so the reading lives here, once,
 * and each host decides only when to let its own event loop past. Persistent
 * 250/2500 Hz crossover states measure low/mid/high energy; the silhouette
 * retains the widest excursion of either channel.
 */
export function* walk(source: Samples, rate = SCAN_RATE): Generator<void, Scan, void> {
  const bins = binsOf(source.duration, rate);
  const values = new Float32Array(bins * SCAN_VALUES);
  const channels = source.channels;
  const a = 1 - Math.exp(-2 * Math.PI * 250 / source.sampleRate);
  const b = 1 - Math.exp(-2 * Math.PI * 2500 / source.sampleRate);
  const lower = new Float64Array(channels.length), upper = new Float64Array(channels.length);
  let from = 0;
  for (let bin = 0; bin < bins; bin++) {
    yield;
    const to = bin === bins - 1 ? source.length : Math.min(source.length, Math.round((bin + 1) / rate * source.sampleRate));
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
}
