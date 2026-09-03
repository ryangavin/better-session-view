import { magnitudesOf } from './fft.ts';
import type { Heard, Transient } from './transients.ts';

/**
 * Spectral flux: an onset function that hears the whole spectrum at once.
 *
 * Taken from audiojs/beat (MIT), and kept as it was there: a Hann-windowed
 * STFT, and at each hop the sum of every bin's rise in magnitude since the
 * last, so a hit anywhere in the spectrum counts and a decay nowhere does
 * (Dixon 2006). `transients.ts` listens in three bands and knows a kick from
 * a hat; this treats every onset alike, which is the thing the harness
 * measures it against.
 */

/** An onset function: a strength per frame, the seconds each frame spans, and where the first frame's centre is. */
export interface Onset {
  values: Float64Array;
  per: number;
  /**
   * Seconds to frame zero. Half a frame: a frame is stamped at its centre,
   * where the library stamped it at its start and heard every onset half a
   * frame — 23 ms at 44.1k — before it happened.
   */
  first: number;
}

const FRAME = 2048;
const HOP = 512;

/** How far above the local mean a frame has to stand to be an onset, and how many frames either side the mean is taken over. */
const DELTA = 1.4;
const AROUND = 8;

/** The one channel the STFT hears: the mean of those given. */
export function monoOf(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const channel of channels) for (let i = 0; i < n; i++) out[i] += channel[i];
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  return out;
}

/** The spectral flux of a mono signal, or nothing when it is silent or shorter than a frame. */
export function fluxOf(samples: Float32Array, rate: number): Onset | null {
  const frames = Math.floor((samples.length - FRAME) / HOP) + 1;
  if (frames < 2) return null;
  const window = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / FRAME));
  const frame = new Float64Array(FRAME);
  let last = new Float64Array(FRAME / 2 + 1);
  let now = new Float64Array(FRAME / 2 + 1);
  const values = new Float64Array(frames);
  let any = false;
  for (let f = 0; f < frames; f++) {
    const offset = f * HOP;
    for (let i = 0; i < FRAME; i++) frame[i] = samples[offset + i] * window[i];
    magnitudesOf(frame, now);
    if (f > 0) {
      let flux = 0;
      for (let k = 0; k < now.length; k++) {
        const rise = now[k] - last[k];
        if (rise > 0) flux += rise;
      }
      values[f] = flux;
      if (flux > 0) any = true;
    }
    [last, now] = [now, last];
  }
  return any ? { values, per: HOP / rate, first: FRAME / 2 / rate } : null;
}

/** The onsets in the function: every local maximum standing above the mean around it, in seconds. */
export function onsetsOf(onset: Onset): number[] {
  const { values, per, first } = onset;
  const n = values.length;
  const out: number[] = [];
  const meanAround = (f: number): number => {
    const from = Math.max(0, f - AROUND);
    const to = Math.min(n, f + AROUND + 1);
    let sum = 0;
    for (let i = from; i < to; i++) sum += values[i];
    return sum / (to - from);
  };
  if (n > 1 && values[0] > 0 && values[0] >= values[1] && values[0] > meanAround(0) * DELTA) out.push(first);
  for (let f = 1; f < n - 1; f++) {
    if (values[f] > values[f - 1] && values[f] >= values[f + 1] && values[f] > meanAround(f) * DELTA) out.push(first + f * per);
  }
  return out;
}

/**
 * The onsets as what `tempo.ts` and `follow.ts` listen to: every one a hit in
 * the kick's band, at the strength of its frame against the loudest, so the
 * fit and the follower can be run on this function in place of their own.
 */
export function heardOf(onset: Onset, rate: number, seconds: number): Heard {
  const { values, per, first } = onset;
  let loudest = 0;
  for (const v of values) if (v > loudest) loudest = v;
  const transients: Transient[] = onsetsOf(onset).map((at) => {
    const strength = loudest > 0 ? values[Math.round((at - first) / per)] / loudest : 0;
    return { at, sample: Math.round(at * rate), strength, level: strength, band: 'low' };
  });
  return { seconds, rate, transients };
}
