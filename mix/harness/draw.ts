/** Canvas drawing for the harness page: one row per thing, one time axis. */
import type { Peak } from '../src/audio.ts';
import type { Transient } from '../src/transients.ts';
import type { Beats } from '../src/warp.ts';
import { BEATS_PER_BAR, tempoAt } from '../src/warp.ts';
import type { CandidateTrace, FollowTrace, TempoTrace } from '../src/trace.ts';
import type { KnownTempo, Truth } from './types.ts';

export interface View {
  from: number;
  to: number;
  width: number;
  height: number;
}

export const BAND_INK: Record<Transient['band'], string> = {
  low: '#ff6a3d',
  mid: '#ffd93d',
  high: '#4dd8ff',
};

export const PRED_INK = '#6fd08c';
export const TRUTH_INK = '#d05cc0';

export const xOf = (v: View, t: number): number => ((t - v.from) / (v.to - v.from)) * v.width;
export const timeOf = (v: View, x: number): number => v.from + (x / v.width) * (v.to - v.from);

/** Size a canvas to its box at device pixels and hand back a context in CSS pixels. */
export function fit(canvas: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

export const isDownbeat = (beats: Beats, i: number): boolean =>
  (((beats.first + i) % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0;

export const barOf = (beats: Beats, i: number): number => (beats.first + i) / BEATS_PER_BAR + 1;

/** A tick spacing that lands on a round number of seconds and leaves room to read. */
function step(span: number, width: number): number {
  const want = (span / width) * 70;
  const steps = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of steps) if (s >= want) return s;
  return 600;
}

const clock = (t: number, fine: boolean): string => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${(s < 10 ? '0' : '') + (fine ? s.toFixed(2) : s.toFixed(0))}`;
};

export function drawRuler(g: CanvasRenderingContext2D, v: View, beats: Beats | null): void {
  const span = v.to - v.from;
  const s = step(span, v.width);
  g.fillStyle = '#100f0e';
  g.fillRect(0, 0, v.width, v.height);
  g.font = '10px ui-monospace, monospace';
  for (let t = Math.ceil(v.from / s) * s; t <= v.to; t += s) {
    const x = Math.round(xOf(v, t)) + 0.5;
    g.strokeStyle = '#3a352f';
    g.beginPath();
    g.moveTo(x, v.height - 8);
    g.lineTo(x, v.height);
    g.stroke();
    g.fillStyle = '#8b837a';
    g.fillText(clock(t, s < 1), x + 2, v.height - 10);
  }
  if (!beats) return;
  // Bar numbers along the top, thinned until the labels have room.
  const last = beats.samples.length - 1;
  const barSeconds =
    last > 0
      ? (((beats.samples[last] - beats.samples[0]) / beats.rate) * BEATS_PER_BAR) / last
      : 2;
  const perPixel = span / Math.max(1, v.width);
  let every = 1;
  while ((barSeconds / perPixel) * every < 44 && every < 1024) every *= 2;
  g.fillStyle = '#6fd08c';
  for (let i = 0; i < beats.samples.length; i++) {
    if (!isDownbeat(beats, i)) continue;
    const bar = barOf(beats, i);
    if (bar % every !== 0 && bar !== 1) continue;
    const x = xOf(v, beats.samples[i] / beats.rate);
    if (x < -20 || x > v.width + 20) continue;
    g.fillText(String(bar), x + 2, 10);
  }
}

export function drawPeaks(g: CanvasRenderingContext2D, v: View, peaks: Peak[], per: number, rate: number): void {
  const mid = v.height / 2;
  g.fillStyle = '#4b6b8a';
  const secondsPer = per / rate;
  for (let x = 0; x < v.width; x++) {
    const a = Math.floor(timeOf(v, x) / secondsPer);
    const b = Math.max(a + 1, Math.floor(timeOf(v, x + 1) / secondsPer));
    let lo = 0;
    let hi = 0;
    for (let i = Math.max(0, a); i < Math.min(peaks.length, b); i++) {
      if (peaks[i].min < lo) lo = peaks[i].min;
      if (peaks[i].max > hi) hi = peaks[i].max;
    }
    g.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid));
  }
}

export function drawBuffer(g: CanvasRenderingContext2D, v: View, buffer: AudioBuffer): void {
  const mid = v.height / 2;
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  g.fillStyle = '#6f97bd';
  for (let x = 0; x < v.width; x++) {
    const a = Math.max(0, Math.floor(timeOf(v, x) * rate));
    const b = Math.min(data.length, Math.max(a + 1, Math.floor(timeOf(v, x + 1) * rate)));
    let lo = 0;
    let hi = 0;
    for (let i = a; i < b; i++) {
      const s = data[i];
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    g.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid));
  }
}

export function drawTransients(
  g: CanvasRenderingContext2D,
  v: View,
  hits: readonly Transient[],
  rate: number,
): void {
  for (const t of hits) {
    const x = xOf(v, t.sample / rate);
    if (x < -1 || x > v.width + 1) continue;
    const h = Math.max(1, t.strength * (v.height - 2));
    g.fillStyle = BAND_INK[t.band];
    g.globalAlpha = 0.35 + 0.65 * t.level;
    g.fillRect(x, v.height - h, 1, h);
  }
  g.globalAlpha = 1;
}

export function drawBeats(
  g: CanvasRenderingContext2D,
  v: View,
  beats: Beats,
  trace: FollowTrace | undefined,
): void {
  g.font = '10px ui-monospace, monospace';
  const dense = (v.to - v.from) / v.width > 0.05;
  for (let i = 0; i < beats.samples.length; i++) {
    const x = Math.round(xOf(v, beats.samples[i] / beats.rate)) + 0.5;
    if (x < -30 || x > v.width + 30) continue;
    const down = isDownbeat(beats, i);
    const anchored = trace?.beats?.[i]?.hit != null;
    const top = down ? 8 : v.height * 0.35;
    g.strokeStyle = down ? '#9ef0b6' : PRED_INK;
    g.globalAlpha = anchored ? 1 : 0.55;
    g.setLineDash(anchored ? [] : [2, 3]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, v.height);
    g.stroke();
    if (down && !dense) {
      g.setLineDash([]);
      g.fillStyle = '#9ef0b6';
      g.fillText(String(barOf(beats, i)), x + 2, 8);
    }
  }
  g.setLineDash([]);
  g.globalAlpha = 1;
}

export interface TempoScale {
  lo: number;
  hi: number;
}

/** BPM range over everything the tempo row draws, with a little air. */
export function tempoScale(trace: FollowTrace | undefined, beats: Beats | null): TempoScale {
  let lo = Infinity;
  let hi = -Infinity;
  const see = (n: number) => {
    if (!Number.isFinite(n)) return;
    if (n < lo) lo = n;
    if (n > hi) hi = n;
  };
  for (const n of trace?.tempo ?? []) see(n);
  if (beats) for (let i = 0; i + 1 < beats.samples.length; i++) see((60 * beats.rate) / (beats.samples[i + 1] - beats.samples[i]));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 60, hi: 200 };
  const pad = Math.max(1, (hi - lo) * 0.15);
  return { lo: lo - pad, hi: hi + pad };
}

export function drawTempo(
  g: CanvasRenderingContext2D,
  v: View,
  trace: FollowTrace | undefined,
  beats: Beats | null,
  scale: TempoScale,
): void {
  const yOf = (bpm: number) => v.height - ((bpm - scale.lo) / (scale.hi - scale.lo)) * v.height;
  g.font = '10px ui-monospace, monospace';
  g.strokeStyle = '#2a2724';
  g.fillStyle = '#8b837a';
  for (let k = 0; k <= 4; k++) {
    const bpm = scale.lo + ((scale.hi - scale.lo) * k) / 4;
    const y = Math.round(yOf(bpm)) + 0.5;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(v.width, y);
    g.stroke();
    g.fillText(bpm.toFixed(1), 2, y - 2);
  }

  const frame = trace?.frame ?? 0;
  const curve = trace?.tempo;
  if (curve && frame > 0) {
    g.strokeStyle = '#ffd93d';
    g.lineWidth = 1;
    g.beginPath();
    const a = Math.max(0, Math.floor(v.from / frame));
    const b = Math.min(curve.length, Math.ceil(v.to / frame) + 1);
    const stride = Math.max(1, Math.floor((b - a) / Math.max(1, v.width)));
    let started = false;
    for (let i = a; i < b; i += stride) {
      const x = xOf(v, i * frame);
      const y = yOf(curve[i]);
      if (started) g.lineTo(x, y);
      else {
        g.moveTo(x, y);
        started = true;
      }
    }
    g.stroke();
  }

  if (beats) {
    g.fillStyle = PRED_INK;
    for (let i = 0; i + 1 < beats.samples.length; i++) {
      const t = beats.samples[i] / beats.rate;
      if (t < v.from - 1 || t > v.to + 1) continue;
      const bpm = (60 * beats.rate) / (beats.samples[i + 1] - beats.samples[i]);
      g.fillRect(xOf(v, t) - 1, yOf(bpm) - 1, 2, 2);
    }
  }

  for (const s of trace?.stretches ?? []) {
    if (s.at < v.from - 1 || s.at > v.to + 1) continue;
    g.fillStyle = s.fill ? '#ff4d4d' : s.read == null ? '#7a736b' : '#4dd8ff';
    const y = s.read == null ? v.height - 5 : yOf(s.read);
    g.beginPath();
    g.arc(xOf(v, s.at), y, 3, 0, Math.PI * 2);
    g.fill();
  }
}

/** The steady grid a known constant tempo would rule, honouring its sections. */
export function drawKnownGrid(
  g: CanvasRenderingContext2D,
  v: View,
  known: KnownTempo,
  offset: number,
  seconds: number,
): void {
  const sections = [{ from: 0, bpm: known.bpm }, ...(known.sections ?? [])].sort((a, b) => a.from - b.from);
  g.strokeStyle = '#5a5248';
  g.lineWidth = 1;
  let t = offset;
  let n = 0;
  while (t <= seconds && n < 200000) {
    let bpm = sections[0].bpm;
    for (const s of sections) if (t >= s.from) bpm = s.bpm;
    if (t >= v.from && t <= v.to) {
      const x = Math.round(xOf(v, t)) + 0.5;
      const down = n % BEATS_PER_BAR === 0;
      g.globalAlpha = down ? 0.6 : 0.25;
      g.beginPath();
      g.moveTo(x, down ? 0 : v.height * 0.5);
      g.lineTo(x, v.height);
      g.stroke();
    }
    t += 60 / bpm;
    n++;
  }
  g.globalAlpha = 1;
}

export function drawTruth(
  g: CanvasRenderingContext2D,
  v: View,
  truth: Truth,
  predicted: Beats | null,
): void {
  const downs = new Set(truth.beats.downbeat);
  const rate = truth.beats.rate;
  const label = (v.to - v.from) / v.width < 0.02;
  g.font = '10px ui-monospace, monospace';
  for (let i = 0; i < truth.beats.samples.length; i++) {
    const t = truth.beats.samples[i] / rate;
    const x = Math.round(xOf(v, t)) + 0.5;
    if (x < -30 || x > v.width + 30) continue;
    const down = downs.has(i) || downs.has(truth.beats.samples[i]);
    g.strokeStyle = down ? '#ff8ff0' : '#d05cc0';
    g.beginPath();
    g.moveTo(x, down ? 12 : v.height * 0.4);
    g.lineTo(x, v.height);
    g.stroke();
    if (label && predicted) {
      const near = nearestBeat(predicted, truth.beats.samples[i]);
      if (near != null) {
        const ms = ((truth.beats.samples[i] - predicted.samples[near]) / predicted.rate) * 1000;
        g.fillStyle = Math.abs(ms) > 30 ? '#ff6a3d' : '#8b837a';
        g.fillText(`${ms > 0 ? '+' : ''}${ms.toFixed(1)}`, x + 2, 10);
      }
    }
  }
}

/** The index of the predicted beat closest to a sample. */
export function nearestBeat(beats: Beats, sample: number): number | null {
  const { samples } = beats;
  if (samples.length === 0) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid] < sample) lo = mid + 1;
    else hi = mid;
  }
  const before = Math.max(0, lo - 1);
  return Math.abs(samples[before] - sample) <= Math.abs(samples[lo] - sample) ? before : lo;
}

export function drawAcf(canvas: HTMLCanvasElement, tempo: TempoTrace | undefined, hover: number | null): void {
  const { g, w, h } = fit(canvas);
  g.fillStyle = '#0e0d0c';
  g.fillRect(0, 0, w, h);
  const acf = tempo?.acf;
  if (!acf || !tempo?.frame) {
    g.fillStyle = '#8b837a';
    g.fillText('no autocorrelation', 6, 16);
    return;
  }
  const bpmOf = (i: number) => 60 / ((acf.lo + i) * tempo.frame);
  const bpms = acf.values.map((_, i) => bpmOf(i));
  const lo = Math.min(...bpms);
  const hi = Math.max(...bpms);
  const max = Math.max(...acf.values, 1e-9);
  const x = (bpm: number) => ((bpm - lo) / (hi - lo)) * (w - 40) + 32;
  const y = (val: number) => h - 18 - (val / max) * (h - 30);

  g.strokeStyle = '#2a2724';
  g.fillStyle = '#8b837a';
  g.font = '10px ui-monospace, monospace';
  for (let bpm = Math.ceil(lo / 20) * 20; bpm <= hi; bpm += 20) {
    g.beginPath();
    g.moveTo(x(bpm), 4);
    g.lineTo(x(bpm), h - 18);
    g.stroke();
    g.fillText(String(bpm), x(bpm) - 8, h - 6);
  }

  g.strokeStyle = '#6f97bd';
  g.beginPath();
  acf.values.forEach((val, i) => (i === 0 ? g.moveTo(x(bpms[i]), y(val)) : g.lineTo(x(bpms[i]), y(val))));
  g.stroke();

  const chosen = tempo.chosen?.candidate;
  (tempo.candidates ?? []).forEach((c, i) => {
    const win = i === chosen;
    g.strokeStyle = c.rejected ? '#ff4d4d' : win ? '#9ef0b6' : '#ffd93d';
    g.globalAlpha = i === hover || win ? 1 : 0.6;
    g.beginPath();
    g.moveTo(x(c.bpm), 4);
    g.lineTo(x(c.bpm), h - 18);
    g.stroke();
    g.fillStyle = g.strokeStyle;
    const bits = [c.bpm.toFixed(2), `s${c.score.toFixed(2)}`];
    if (c.beatness != null) bits.push(`b${c.beatness.toFixed(2)}`);
    if (c.rejected) bits.push(c.rejected);
    g.fillText(bits.join(' '), x(c.bpm) + 3, 12 + (i % 4) * 11);
    g.globalAlpha = 1;
  });
}

export function drawSweep(canvas: HTMLCanvasElement, cand: CandidateTrace | undefined): string {
  const { g, w, h } = fit(canvas);
  g.fillStyle = '#0e0d0c';
  g.fillRect(0, 0, w, h);
  const sweep = cand?.sweep;
  if (!sweep || sweep.scores.length === 0) {
    g.fillStyle = '#8b837a';
    g.fillText('no sweep for this candidate', 6, 16);
    return 'no sweep';
  }
  const max = Math.max(...sweep.scores);
  const min = Math.min(...sweep.scores);
  const best = sweep.scores.indexOf(max);
  const x = (i: number) => (i / (sweep.scores.length - 1)) * (w - 40) + 32;
  const y = (val: number) => h - 18 - ((val - min) / Math.max(1e-9, max - min)) * (h - 30);
  g.strokeStyle = '#ffd93d';
  g.beginPath();
  sweep.scores.forEach((val, i) => (i === 0 ? g.moveTo(x(i), y(val)) : g.lineTo(x(i), y(val))));
  g.stroke();
  g.strokeStyle = '#9ef0b6';
  g.beginPath();
  g.moveTo(x(best), 4);
  g.lineTo(x(best), h - 18);
  g.stroke();
  g.fillStyle = '#8b837a';
  g.font = '10px ui-monospace, monospace';
  g.fillText(`${sweep.from.toFixed(3)}s`, 32, h - 6);
  g.fillText(`${(sweep.from + (sweep.scores.length - 1) * sweep.step).toFixed(3)}s`, w - 70, h - 6);
  return `best phase ${(sweep.from + best * sweep.step).toFixed(4)}s, score ${max.toFixed(3)} over ${sweep.scores.length} steps of ${sweep.step}s`;
}

export const localTempo = (beats: Beats, i: number): number => tempoAt(beats, beats.first + i);
