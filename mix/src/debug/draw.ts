/**
 * Canvas drawing for the analysis harness: one row per thing, one time axis.
 *
 * Every ink is a palette token read off the page, so the rows follow the
 * app's colours rather than carrying their own. The bands are the three
 * accents — kick red, snare amber, hats blue — and a predicted beat is green,
 * the way the app's own warp lane draws a downbeat tick.
 */
import { ink, timeOf, xOf, type View } from '@openflow/widgets/debug/index.ts';
import type { Peak } from '../audio.ts';
import type { Transient } from '../transients.ts';
import type { Sweep } from '../tempo.ts';
import type { CandidateTrace, FollowTrace, TempoTrace } from '../trace.ts';
import { BEATS_PER_BAR, type Beats } from '../warp.ts';

export type { View };

export interface Inks {
  low: string;
  mid: string;
  high: string;
  beat: string;
  downbeat: string;
  kept: string;
  wave: string;
  followed: string;
  read: string;
  unclear: string;
  fill: string;
  text: string;
  faint: string;
  strong: string;
  grid: string;
}

/** The inks as the page resolves them, once per draw. */
export function inksOf(el: Element | null): Inks {
  return {
    low: ink(el, '--red', '#d4544f'),
    mid: ink(el, '--amber', '#f0b23c'),
    high: ink(el, '--blue', '#4da6d9'),
    beat: ink(el, '--green', '#5fbfa8'),
    downbeat: ink(el, '--fg', '#ececed'),
    kept: ink(el, '--preview', '#b58fd6'),
    wave: ink(el, '--stem-drums', '#f0883a'),
    followed: ink(el, '--amber', '#f0b23c'),
    read: ink(el, '--blue', '#4da6d9'),
    unclear: ink(el, '--idle', '#3a3a41'),
    fill: ink(el, '--red', '#d4544f'),
    text: ink(el, '--detail', '#8b8b93'),
    faint: ink(el, '--bd3', '#2c2c31'),
    strong: ink(el, '--fg', '#ececed'),
    grid: ink(el, '--bd', '#262629'),
  };
}

export const FONT = '9px system-ui, sans-serif';

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

export function drawRuler(g: CanvasRenderingContext2D, v: View, beats: Beats | null, inks: Inks): void {
  const span = v.to - v.from;
  const s = step(span, v.width);
  g.font = FONT;
  for (let t = Math.ceil(v.from / s) * s; t <= v.to; t += s) {
    const x = Math.round(xOf(v, t)) + 0.5;
    g.strokeStyle = inks.faint;
    g.beginPath();
    g.moveTo(x, v.height - 4);
    g.lineTo(x, v.height);
    g.stroke();
    g.fillStyle = inks.text;
    g.fillText(clock(t, s < 1), x + 2, v.height - 5);
  }
  if (!beats) return;
  const last = beats.samples.length - 1;
  const barSeconds = last > 0 ? (((beats.samples[last] - beats.samples[0]) / beats.rate) * BEATS_PER_BAR) / last : 2;
  const perPixel = span / Math.max(1, v.width);
  let every = 1;
  while ((barSeconds / perPixel) * every < 44 && every < 1024) every *= 2;
  g.fillStyle = inks.beat;
  for (let i = 0; i < beats.samples.length; i++) {
    if (!isDownbeat(beats, i)) continue;
    const bar = barOf(beats, i);
    if (bar % every !== 0 && bar !== 1) continue;
    const x = xOf(v, beats.samples[i] / beats.rate);
    if (x < -20 || x > v.width + 20) continue;
    g.fillText(String(bar), x + 2, 9);
  }
}

export function drawPeaks(g: CanvasRenderingContext2D, v: View, peaks: readonly Peak[], per: number, rate: number, color: string): void {
  const mid = v.height / 2;
  g.fillStyle = color;
  g.globalAlpha = 0.7;
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
  g.globalAlpha = 1;
}

export function drawBuffer(g: CanvasRenderingContext2D, v: View, buffer: AudioBuffer, color: string): void {
  const mid = v.height / 2;
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  g.fillStyle = color;
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

export function drawTransients(g: CanvasRenderingContext2D, v: View, hits: readonly Transient[], rate: number, inks: Inks): void {
  for (const t of hits) {
    const x = xOf(v, t.sample / rate);
    if (x < -1 || x > v.width + 1) continue;
    const h = Math.max(1, t.strength * (v.height - 2));
    g.fillStyle = inks[t.band];
    g.globalAlpha = 0.35 + 0.65 * t.level;
    g.fillRect(x, v.height - h, 1, h);
  }
  g.globalAlpha = 1;
}

/** The beats of a map: downbeats tall and numbered, anchored ones solid, interpolated dashed. */
export function drawBeats(
  g: CanvasRenderingContext2D,
  v: View,
  beats: Beats,
  trace: FollowTrace | undefined,
  inks: Inks,
  color = inks.beat,
  strong = inks.downbeat,
): void {
  g.font = FONT;
  const dense = (v.to - v.from) / v.width > 0.05;
  for (let i = 0; i < beats.samples.length; i++) {
    const x = Math.round(xOf(v, beats.samples[i] / beats.rate)) + 0.5;
    if (x < -30 || x > v.width + 30) continue;
    const down = isDownbeat(beats, i);
    const anchored = trace?.beats?.[i]?.hit != null || !trace;
    const top = down ? 8 : v.height * 0.35;
    g.strokeStyle = down ? strong : color;
    g.globalAlpha = anchored ? 1 : 0.55;
    g.setLineDash(anchored ? [] : [2, 3]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, v.height);
    g.stroke();
    if (down && !dense) {
      g.setLineDash([]);
      g.fillStyle = strong;
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
  inks: Inks,
): void {
  const yOf = (bpm: number) => v.height - ((bpm - scale.lo) / (scale.hi - scale.lo)) * v.height;
  g.font = FONT;
  g.strokeStyle = inks.grid;
  g.fillStyle = inks.text;
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
    g.strokeStyle = inks.followed;
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
    g.fillStyle = inks.beat;
    for (let i = 0; i + 1 < beats.samples.length; i++) {
      const t = beats.samples[i] / beats.rate;
      if (t < v.from - 1 || t > v.to + 1) continue;
      const bpm = (60 * beats.rate) / (beats.samples[i + 1] - beats.samples[i]);
      g.fillRect(xOf(v, t) - 1, yOf(bpm) - 1, 2, 2);
    }
  }
  for (const s of trace?.stretches ?? []) {
    if (s.at < v.from - 1 || s.at > v.to + 1) continue;
    g.fillStyle = s.fill ? inks.fill : s.read == null ? inks.unclear : inks.read;
    const y = s.read == null ? v.height - 5 : yOf(s.read);
    g.beginPath();
    g.arc(xOf(v, s.at), y, 3, 0, Math.PI * 2);
    g.fill();
  }
}

/** The index of the beat closest to a sample. */
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

const note = (g: CanvasRenderingContext2D, text: string, inks: Inks) => {
  g.fillStyle = inks.text;
  g.font = FONT;
  g.fillText(text, 6, 14);
};

/** Where a candidate's tempo lands across an autocorrelation plot. */
export function candidateX(tempo: TempoTrace, bpm: number, w: number): number | null {
  const acf = tempo.acf;
  if (!acf || !tempo.frame) return null;
  const bpmOf = (i: number) => 60 / ((acf.lo + i) * tempo.frame);
  const lo = bpmOf(acf.values.length - 1);
  const hi = bpmOf(0);
  return ((bpm - lo) / (hi - lo)) * (w - 40) + 32;
}

export function drawAcf(g: CanvasRenderingContext2D, w: number, h: number, tempo: TempoTrace | undefined, hover: number | null, inks: Inks): void {
  const acf = tempo?.acf;
  if (!acf || !tempo?.frame) return note(g, 'no autocorrelation', inks);
  const bpmOf = (i: number) => 60 / ((acf.lo + i) * tempo.frame);
  const bpms = acf.values.map((_, i) => bpmOf(i));
  const lo = Math.min(...bpms);
  const hi = Math.max(...bpms);
  const max = Math.max(...acf.values, 1e-9);
  const x = (bpm: number) => ((bpm - lo) / (hi - lo)) * (w - 40) + 32;
  const y = (val: number) => h - 14 - (val / max) * (h - 26);
  g.strokeStyle = inks.grid;
  g.fillStyle = inks.text;
  g.font = FONT;
  for (let bpm = Math.ceil(lo / 20) * 20; bpm <= hi; bpm += 20) {
    g.beginPath();
    g.moveTo(x(bpm), 4);
    g.lineTo(x(bpm), h - 14);
    g.stroke();
    g.fillText(String(bpm), x(bpm) - 8, h - 4);
  }
  g.strokeStyle = inks.wave;
  g.beginPath();
  acf.values.forEach((val, i) => (i === 0 ? g.moveTo(x(bpms[i]), y(val)) : g.lineTo(x(bpms[i]), y(val))));
  g.stroke();
  const chosen = tempo.chosen?.candidate;
  (tempo.candidates ?? []).forEach((c, i) => {
    const win = i === chosen;
    g.strokeStyle = c.rejected ? inks.fill : win ? inks.downbeat : inks.mid;
    g.globalAlpha = i === hover || win ? 1 : 0.6;
    g.beginPath();
    g.moveTo(x(c.bpm), 4);
    g.lineTo(x(c.bpm), h - 14);
    g.stroke();
    g.fillStyle = g.strokeStyle;
    const bits = [c.bpm.toFixed(2), `s${c.score.toFixed(2)}`];
    if (c.beatness != null) bits.push(`b${c.beatness.toFixed(2)}`);
    if (c.rejected) bits.push(c.rejected);
    g.fillText(bits.join(' '), x(c.bpm) + 3, 11 + (i % 4) * 10);
    g.globalAlpha = 1;
  });
}

export function drawSweep(g: CanvasRenderingContext2D, w: number, h: number, cand: CandidateTrace | undefined, inks: Inks): string {
  const sweep = cand?.sweep;
  if (!sweep || sweep.scores.length === 0) {
    note(g, 'no sweep for this candidate', inks);
    return 'no sweep';
  }
  const max = Math.max(...sweep.scores);
  const min = Math.min(...sweep.scores);
  const best = sweep.scores.indexOf(max);
  const x = (i: number) => (i / (sweep.scores.length - 1)) * (w - 40) + 32;
  const y = (val: number) => h - 14 - ((val - min) / Math.max(1e-9, max - min)) * (h - 26);
  g.strokeStyle = inks.mid;
  g.beginPath();
  sweep.scores.forEach((val, i) => (i === 0 ? g.moveTo(x(i), y(val)) : g.lineTo(x(i), y(val))));
  g.stroke();
  g.strokeStyle = inks.downbeat;
  g.beginPath();
  g.moveTo(x(best), 4);
  g.lineTo(x(best), h - 14);
  g.stroke();
  g.fillStyle = inks.text;
  g.font = FONT;
  g.fillText(`${sweep.from.toFixed(3)}s`, 32, h - 4);
  g.fillText(`${(sweep.from + (sweep.scores.length - 1) * sweep.step).toFixed(3)}s`, w - 70, h - 4);
  return `best phase ${(sweep.from + best * sweep.step).toFixed(4)}s, score ${max.toFixed(3)} over ${sweep.scores.length} steps of ${sweep.step}s`;
}

/** The tempo sweep: error against tempo, with 1.1.1 held. */
export function drawDrift(g: CanvasRenderingContext2D, w: number, h: number, sweep: Sweep | null, inks: Inks): string {
  if (!sweep) {
    note(g, 'alt-click a beat or a hit to set 1.1.1, or press sweep', inks);
    return '';
  }
  const from = sweep.curve[0].bpm;
  const to = sweep.curve[sweep.curve.length - 1].bpm;
  const max = Math.max(...sweep.curve.map((p) => p.error));
  const x = (bpm: number) => ((bpm - from) / (to - from)) * (w - 40) + 32;
  const y = (error: number) => h - 14 - (error / Math.max(1e-9, max)) * (h - 26);
  const mark = (bpm: number, color: string, dashed = false) => {
    g.strokeStyle = color;
    g.setLineDash(dashed ? [3, 3] : []);
    g.beginPath();
    g.moveTo(x(bpm), 4);
    g.lineTo(x(bpm), h - 14);
    g.stroke();
    g.setLineDash([]);
  };
  if (sweep.whole.bpm >= from && sweep.whole.bpm <= to) mark(sweep.whole.bpm, inks.strong, true);
  mark(sweep.was.bpm, inks.mid, true);
  mark(sweep.best.bpm, inks.beat);
  g.strokeStyle = inks.beat;
  g.beginPath();
  sweep.curve.forEach((p, i) => (i === 0 ? g.moveTo(x(p.bpm), y(p.error)) : g.lineTo(x(p.bpm), y(p.error))));
  g.stroke();
  g.fillStyle = inks.text;
  g.font = FONT;
  g.fillText(`${from.toFixed(3)}`, 32, h - 4);
  g.fillText(`${to.toFixed(3)}`, w - 60, h - 4);
  g.fillText(`${max.toFixed(0)} ms`, 2, 10);
  const ms = (p: { error: number }) => `${p.error.toFixed(1)} ms`;
  return [
    `bottom ${sweep.best.bpm.toFixed(4)} · ${ms(sweep.best)}`,
    `whole ${sweep.whole.bpm} · ${ms(sweep.whole)}`,
    `from ${sweep.was.bpm.toFixed(4)} · ${ms(sweep.was)}`,
    `1.1.1 at ${sweep.offset.toFixed(4)} s`,
  ].join('\n');
}
