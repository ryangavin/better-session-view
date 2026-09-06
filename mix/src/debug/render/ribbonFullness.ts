import { magnitudesOf } from '../../fft.ts';
import type { AudioSource, Measurement } from '../waveforms/measure.ts';

/** Soft fraction of log-frequency bands occupied, relative to this frame's strongest band. */
export function spectralCoverage(amplitudes: readonly number[]): number {
  const peak = Math.max(0, ...amplitudes);
  if (peak < 1e-5) return 0;
  return amplitudes.reduce((sum, a) => {
    const db = 20 * Math.log10(Math.max(1e-10, a) / peak);
    const t = Math.max(0, Math.min(1, (db + 36) / 18));
    return sum + t * t * (3 - 2 * t);
  }, 0) / Math.max(1, amplitudes.length);
}

/** Preview-only FFT coverage: channel-preserving mix, Hann windows, about ten frames/sec. */
export async function measureCoverage(sources: readonly AudioSource[], rate: number, data: Measurement, signal: AbortSignal): Promise<Float32Array> {
  const size = 2048, frame = new Float64Array(size), spectrum = new Float64Array(size / 2 + 1);
  const channels = Math.max(...sources.map((s) => s.channels.length));
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  const edges = Array.from({ length: 17 }, (_, i) => 50 * (Math.min(16000, rate / 2) / 50) ** (i / 16));
  const result = new Float32Array(data.rms.length), stride = Math.max(1, Math.round(0.1 / data.step));
  for (let bin = 0; bin < result.length; bin += stride) {
    if (bin % (stride * 16) === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); signal.throwIfAborted(); }
    const powers = new Float64Array(16);
    const start = Math.round(bin * data.step * rate) - size / 2;
    for (let c = 0; c < channels; c++) {
      for (let i = 0; i < size; i++) {
        let value = 0;
        for (const source of sources) value += source.channels[Math.min(c, source.channels.length - 1)][start + i] ?? 0;
        frame[i] = value * window[i];
      }
      magnitudesOf(frame, spectrum);
      for (let band = 0; band < 16; band++) {
        const from = Math.max(1, Math.ceil(edges[band] * size / rate)), to = Math.min(size / 2 + 1, Math.max(from + 1, Math.ceil(edges[band + 1] * size / rate)));
        for (let k = from; k < to; k++) powers[band] += (spectrum[k] / size) ** 2 / Math.max(1, to - from) / channels;
      }
    }
    const coverage = spectralCoverage(Array.from(powers, Math.sqrt));
    result.fill(coverage, bin, Math.min(result.length, bin + stride));
  }
  // Arithmetic persistence: brief broadband transients do not get RMS emphasis here.
  const prefix = new Float64Array(result.length + 1);
  result.forEach((v, i) => { prefix[i + 1] = prefix[i] + v; });
  const radius = Math.max(1, Math.round(2 / data.step));
  return Float32Array.from(result, (_, i) => {
    const a = Math.max(0, i - radius), b = Math.min(result.length, i + radius + 1);
    return (prefix[b] - prefix[a]) / (b - a);
  });
}
