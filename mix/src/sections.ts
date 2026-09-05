import type { Measurement } from './debug/waveforms/measure.ts';
import { beatAt, countOf, type Beats } from './warp.ts';

export interface SectionSuggestion { bar: number; reason: string; strength: number }

/** Sustained changes in measured audio, snapped to phrases. These are proposals, not song labels. */
export function sectionSuggestions(data: Measurement, grid: Beats, quantum: 4 | 8): SectionSuggestion[] {
  const bars = Math.floor(countOf(grid));
  if (bars < 8) return [];
  const bins = [data.rms, ...data.stems.map((s) => s.rms)];
  const levels = bins.map(() => new Float64Array(bars));
  const counts = new Uint32Array(bars);
  for (let i = 0; i < data.rms.length; i++) {
    const bar = Math.floor(beatAt(grid, (i + 0.5) * data.step * grid.rate) / 4);
    if (bar < 0 || bar >= bars) continue;
    counts[bar]++;
    bins.forEach((values, j) => { levels[j][bar] += (values[i] ?? 0) ** 2; });
  }
  levels.forEach((values) => values.forEach((v, i) => { values[i] = Math.sqrt(v / Math.max(1, counts[i])); }));
  const peaks = levels.map((v) => Math.max(...v));
  const average = (values: Float64Array, from: number, to: number) => {
    let sum = 0;
    for (let b = from; b < to; b++) sum += values[b];
    return sum / (to - from);
  };
  const candidates: SectionSuggestion[] = [];
  for (let at = 4; at + 4 <= bars; at++) {
    const bar = Math.round(at / quantum) * quantum;
    if (bar < quantum || bar + quantum > bars) continue;
    let strength = 0, reason = '';
    levels.forEach((values, j) => {
      if (peaks[j] < 0.008) return; // Do not turn separation residue into structure.
      const before = average(values, at - 4, at), after = average(values, at, at + 4);
      const delta = Math.abs(after - before) / peaks[j];
      const ratio = Math.max(before, after) / Math.max(0.002, Math.min(before, after));
      const id = data.stems[j - 1]?.id;
      const vocal = id === 'vocals';
      const qualifies = j === 0 ? ratio >= 1.8 && delta >= 0.2 : ratio >= (vocal ? 2.5 : 3) && delta >= (vocal ? 0.22 : 0.4);
      if (!qualifies) return;
      const midpoint = (before + after) / 2;
      const stable = (from: number, above: boolean) => Array.from({ length: 4 }, (_, k) => values[from + k]).filter((v) => above ? v > midpoint : v < midpoint).length >= 3;
      if (!stable(at - 4, before > after) || !stable(at, after > before)) return;
      const score = delta * (vocal ? 1.4 : 1);
      if (score <= strength) return;
      strength = score;
      reason = j === 0 ? (after > before ? 'Energy rises' : 'Energy drops') : vocal ? (after > before ? 'Vocals enter' : 'Vocals recede') : `${id[0].toUpperCase()}${id.slice(1)} ${after > before ? 'enters' : 'recedes'}`;
    });
    if (reason) candidates.push({ bar: at, reason, strength });
  }
  // Pick peaks before snapping: otherwise a change halfway between phrases appears twice.
  const peaksOfChange: SectionSuggestion[] = [];
  for (const next of candidates.sort((a, b) => b.strength - a.strength || a.bar - b.bar)) {
    if (!peaksOfChange.some((s) => Math.abs(s.bar - next.bar) < 4)) peaksOfChange.push(next);
  }
  const selected: SectionSuggestion[] = [];
  for (const next of peaksOfChange) {
    const bar = Math.round(next.bar / quantum) * quantum;
    if (!selected.some((s) => s.bar === bar)) selected.push({ ...next, bar });
  }
  return selected.sort((a, b) => a.bar - b.bar);
}
