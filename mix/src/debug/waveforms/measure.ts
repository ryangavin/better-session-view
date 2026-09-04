/** Preview measurements only: channel-preserving sum, broad crossover energy and stem RMS. */
export interface AudioSource { id: string; channels: readonly Float32Array[] }
export interface Measurement {
  seconds: number;
  step: number;
  peak: Float32Array;
  rms: Float32Array;
  bands: Float32Array[];
  stems: { id: string; rms: Float32Array }[];
}

/** Cooperatively yields, and cancels on track change/unmount. Never copies full audio buffers. */
export async function measure(sources: readonly AudioSource[], rate: number, signal: AbortSignal): Promise<Measurement> {
  if (!sources.length || rate <= 0 || sources.some((s) => !s.channels.length)) throw new Error('No decoded audio');
  const length = Math.max(...sources.flatMap((s) => s.channels.map((c) => c.length)));
  const channels = Math.max(...sources.map((s) => s.channels.length));
  const step = Math.max(1, Math.ceil(length / 16384));
  const count = Math.ceil(length / step);
  const result: Measurement = { seconds: length / rate, step: step / rate, peak: new Float32Array(count), rms: new Float32Array(count), bands: Array.from({ length: 3 }, () => new Float32Array(count)), stems: sources.map((s) => ({ id: s.id, rms: new Float32Array(count) })) };
  const low = new Float64Array(channels), upper = new Float64Array(channels);
  const a = 1 - Math.exp(-2 * Math.PI * 250 / rate), b = 1 - Math.exp(-2 * Math.PI * 2500 / rate);
  for (let bin = 0; bin < count; bin++) {
    if (bin % 64 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    const end = Math.min(length, (bin + 1) * step);
    const n = (end - bin * step) * channels;
    for (let i = bin * step; i < end; i++) for (let c = 0; c < channels; c++) {
      let sum = 0;
      for (let s = 0; s < sources.length; s++) {
        const input = sources[s].channels;
        const value = input[Math.min(c, input.length - 1)][i] ?? 0;
        sum += value;
        result.stems[s].rms[bin] += value * value;
      }
      low[c] += a * (sum - low[c]);
      upper[c] += b * (sum - upper[c]);
      result.peak[bin] = Math.max(result.peak[bin], Math.abs(sum));
      result.rms[bin] += sum * sum;
      result.bands[0][bin] += low[c] * low[c];
      result.bands[1][bin] += (upper[c] - low[c]) ** 2;
      result.bands[2][bin] += (sum - upper[c]) ** 2;
    }
    for (const values of [result.rms, ...result.bands, ...result.stems.map((s) => s.rms)]) values[bin] = Math.sqrt(values[bin] / n);
  }
  return result;
}
