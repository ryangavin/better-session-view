import type { Heard } from '../transients.ts';
import type { Beats } from '../warp.ts';

export interface BeatEvidence { at: number; residualMs: number | null; supported: boolean }
export interface Evidence {
  beats: BeatEvidence[];
  supported: number;
  support: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  leadSeconds: number;
  tailSeconds: number;
  invalidIntervals: number;
  windows: { from: number; to: number; count: number; supported: number; support: number }[];
}

/** Detector agreement, NOT annotated beat accuracy. Only explicitly stored beats count. */
export function gridEvidence(grid: Beats, heard: Heard, seconds: number, toleranceMs: number): Evidence {
  const hits = heard.transients.filter((h) => h.band !== 'high' && Number.isFinite(h.at)).map((h) => h.at).sort((a, b) => a - b);
  const times = grid.samples.map((s) => s / grid.rate);
  let invalidIntervals = 0;
  for (let i = 0; i < times.length; i++) if (!Number.isFinite(times[i]) || (i > 0 && times[i] <= times[i - 1])) invalidIntervals++;
  const beats = times.filter((t) => Number.isFinite(t) && t >= 0 && t <= seconds).map((at): BeatEvidence => {
    let lo = 0, hi = hits.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (hits[mid] < at) lo = mid + 1; else hi = mid; }
    const nearest = [hits[lo - 1], hits[lo]].filter((t): t is number => t !== undefined).sort((a, b) => Math.abs(a - at) - Math.abs(b - at))[0];
    const residualMs = nearest === undefined ? null : (nearest - at) * 1000;
    return { at, residualMs, supported: residualMs !== null && Math.abs(residualMs) <= toleranceMs + 1e-6 };
  });
  const errors = beats.flatMap((b) => b.residualMs === null ? [] : [Math.abs(b.residualMs)]).sort((a, b) => a - b);
  const percentile = (q: number) => errors.length ? errors[Math.ceil(q * errors.length) - 1] : null;
  const supported = beats.filter((b) => b.supported).length;
  const windows = Array.from({ length: Math.ceil(seconds / 10) }, (_, i) => ({ from: i * 10, to: Math.min(seconds, (i + 1) * 10), count: 0, supported: 0, support: 0 }));
  for (const beat of beats) {
    const window = windows[Math.min(windows.length - 1, Math.floor(beat.at / 10))];
    if (window) { window.count++; if (beat.supported) window.supported++; }
  }
  for (const window of windows) window.support = window.count ? window.supported / window.count : 0;
  const valid = times.filter(Number.isFinite).sort((a, b) => a - b);
  return { beats, supported, support: beats.length ? supported / beats.length : null, medianMs: percentile(0.5), p95Ms: percentile(0.95),
    leadSeconds: Math.min(seconds, Math.max(0, valid[0] ?? seconds)),
    tailSeconds: Math.min(seconds, Math.max(0, seconds - (valid.at(-1) ?? 0))), invalidIntervals, windows };
}
