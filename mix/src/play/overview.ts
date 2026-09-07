import { beatAt, sampleOf, type Beats } from '../warp.ts';
import type { Peak } from '../audio.ts';

/** Original-track overview; its origin can precede bar 1. Eight measurements per beat. */
export interface Overview { start: number; peaks: Peak[]; colors: string[] }

/** Broad-band energy colors, independent of deck/stem identity. Silence stays neutral. */
export function spectralColor(low: number, mid: number, high: number): string {
  const maximum = Math.max(low, mid, high);
  if (maximum < 0.00001) return '#45464b';
  const channel = (energy: number) => Math.round(55 + 155 * Math.sqrt(energy / maximum));
  return `rgb(${channel(low)}, ${channel(mid)}, ${channel(high)})`;
}

/**
 * Read decoded full-track samples once, never a selected stem or a rescaled proxy.
 * Persistent 250/2500 Hz crossover states measure low/mid/high energy; the peak
 * silhouette retains the widest excursion of either channel. Yield between chunks
 * so a replacement drop can cancel analysis and the existing decks keep animating.
 */
export async function measureOverview(buffer: AudioBuffer, map: Beats, signal: AbortSignal): Promise<Overview> {
  const start = Math.floor(beatAt(map, 0) * 8) / 8;
  const end = Math.ceil(beatAt(map, buffer.duration * map.rate) * 8) / 8;
  const count = Math.max(1, Math.round((end - start) * 8));
  const channels = Array.from({length:buffer.numberOfChannels}, (_,i) => buffer.getChannelData(i));
  const lower = new Float64Array(channels.length), upper = new Float64Array(channels.length);
  const a = 1 - Math.exp(-2 * Math.PI * 250 / buffer.sampleRate);
  const b = 1 - Math.exp(-2 * Math.PI * 2500 / buffer.sampleRate);
  const peaks: Peak[] = [], colors: string[] = [];
  const sample = (beat: number) => Math.max(0, Math.min(buffer.length, Math.floor(sampleOf(map, beat) / map.rate * buffer.sampleRate)));
  let from = 0;
  for (let bin = 0; bin < count; bin++) {
    if (bin % 32 === 0) {
      signal.throwIfAborted();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    const to = bin === count - 1 ? buffer.length : sample(start + (bin + 1) / 8);
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
    peaks.push({min,max});
    const samples = Math.max(1, (to-from)*channels.length);
    colors.push(spectralColor(low/samples, mid/samples, high/samples));
    from = to;
  }
  return {start,peaks,colors};
}
