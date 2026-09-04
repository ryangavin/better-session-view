import type { Measurement } from './measure.ts';

export interface ActivitySpan { from: number; to: number }
export interface Features {
  peak: number;
  level: Float32Array;
  sources: { id: string; level: Float32Array; spans: ActivitySpan[] }[];
}

/** RMS over a fixed duration, independent of viewport width or zoom. */
export function smooth(values: Float32Array, step: number, seconds: number): Float32Array {
  const radius = Math.max(0, Math.round(seconds / step / 2));
  const sums = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) sums[i + 1] = sums[i] + values[i] ** 2;
  return Float32Array.from(values, (_, i) => {
    const a = Math.max(0, i - radius), b = Math.min(values.length, i + radius + 1);
    return Math.sqrt((sums[b] - sums[a]) / (b - a));
  });
}

/** Sustained activity, not instrument detection. Close short gaps and discard short islands. */
export function activity(values: Float32Array, step: number): ActivitySpan[] {
  const peak = values.reduce((a, b) => Math.max(a, b), 0);
  const threshold = Math.max(10 ** (-42 / 20), peak * 10 ** (-24 / 20));
  const spans: ActivitySpan[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] < threshold) continue;
    const from = i * step, to = (i + 1) * step;
    const last = spans.at(-1);
    if (last && from - last.to <= 0.4 + 1e-6) last.to = to;
    else spans.push({ from, to });
  }
  return spans.filter((span) => span.to - span.from >= 0.6);
}

export function featuresOf(data: Measurement): Features {
  return {
    peak: Math.max(0.001, data.peak.reduce((a, b) => Math.max(a, b), 0)),
    level: smooth(data.rms, data.step, 0.6),
    sources: data.stems.map((source) => {
      const level = smooth(source.rms, data.step, 0.4);
      return { id: source.id, level, spans: activity(level, data.step) };
    }),
  };
}
