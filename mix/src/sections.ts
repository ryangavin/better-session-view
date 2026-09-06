import type { Measurement } from './debug/waveforms/measure.ts';
import { beatAt, countOf, tempoAt, BEATS_PER_BAR, type Beats } from './warp.ts';

export interface SectionSuggestion {
  /** Bars from 1.1.1, on whatever beat the change is on. */
  bar: number;
  reason: string;
  strength: number;
}

/** How far either side of a beat the change is judged over: a phrase. */
const WINDOW = 4 * BEATS_PER_BAR;
/** Two changes this close or closer are one change: the stronger wins. */
const APART = 2 * BEATS_PER_BAR;
/** A tempo that moves by this share across a boundary is a section change on its own. */
const TEMPO_MOVES = 0.03;
/** A window whose every beat is within this share of its mean is running steady. */
const STEADY = 0.025;

/**
 * Sustained changes in the measured audio, and in the tempo the map runs at,
 * on whatever beat they fall. These are proposals, not song labels.
 *
 * A section starts where the music changes: a stem arriving or leaving, the
 * whole getting louder or quieter, or the record changing speed. Nothing
 * here is snapped to a lattice from bar 1 — a change on the third beat of
 * bar 33 is offered there. What keeps one change from being offered four
 * times is that a candidate must be the strongest within two bars of itself.
 */
export function sectionSuggestions(data: Measurement, grid: Beats): SectionSuggestion[] {
  const beats = Math.floor(countOf(grid)) * BEATS_PER_BAR;
  if (beats < 2 * WINDOW) return [];
  const bins = [data.rms, ...data.stems.map((s) => s.rms)];
  const levels = bins.map(() => new Float64Array(beats));
  const counts = new Uint32Array(beats);
  for (let i = 0; i < data.rms.length; i++) {
    const beat = Math.floor(beatAt(grid, (i + 0.5) * data.step * grid.rate));
    if (beat < 0 || beat >= beats) continue;
    counts[beat]++;
    bins.forEach((values, j) => {
      levels[j][beat] += (values[i] ?? 0) ** 2;
    });
  }
  levels.forEach((values) =>
    values.forEach((v, i) => {
      values[i] = Math.sqrt(v / Math.max(1, counts[i]));
    }),
  );
  const peaks = levels.map((v) => Math.max(...v));
  const average = (values: ArrayLike<number>, from: number, to: number) => {
    let sum = 0;
    for (let b = from; b < to; b++) sum += values[b];
    return sum / (to - from);
  };
  const tempos = Array.from({ length: beats }, (_, beat) => tempoAt(grid, beat));
  const steady = (from: number) => {
    const mean = average(tempos, from, from + WINDOW);
    for (let k = from; k < from + WINDOW; k++) if (Math.abs(tempos[k] - mean) / mean > STEADY) return false;
    return true;
  };
  const candidates: SectionSuggestion[] = [];
  for (let at = WINDOW; at + WINDOW <= beats; at++) {
    let strength = 0;
    let reason = '';
    levels.forEach((values, j) => {
      if (peaks[j] < 0.008) return; // Do not turn separation residue into structure.
      const before = average(values, at - WINDOW, at);
      const after = average(values, at, at + WINDOW);
      const delta = Math.abs(after - before) / peaks[j];
      const ratio = Math.max(before, after) / Math.max(0.002, Math.min(before, after));
      const id = data.stems[j - 1]?.id;
      const vocal = id === 'vocals';
      const qualifies = j === 0 ? ratio >= 1.8 && delta >= 0.2 : ratio >= (vocal ? 2.5 : 3) && delta >= (vocal ? 0.22 : 0.4);
      if (!qualifies) return;
      // Sustained: three beats in four either side sit on their own side of the middle.
      const midpoint = (before + after) / 2;
      const stable = (from: number, above: boolean) => {
        let held = 0;
        for (let k = 0; k < WINDOW; k++) if (above ? values[from + k] > midpoint : values[from + k] < midpoint) held++;
        return held >= (WINDOW * 3) / 4;
      };
      if (!stable(at - WINDOW, before > after) || !stable(at, after > before)) return;
      const score = delta * (vocal ? 1.4 : 1);
      if (score <= strength) return;
      strength = score;
      reason =
        j === 0
          ? after > before
            ? 'Energy rises'
            : 'Energy drops'
          : vocal
            ? after > before
              ? 'Vocals enter'
              : 'Vocals recede'
            : `${id[0].toUpperCase()}${id.slice(1)} ${after > before ? 'enters' : 'recedes'}`;
    });
    // The record changing speed is a section change whatever the stems do: a
    // steady section is what loops, and a ramp is where two of them meet.
    // One side has to be running steady, so a ramp is marked where it starts
    // and where it ends and not on every beat in between; the mean rather
    // than the median, so a step is the peak and not a plateau.
    const before = average(tempos, at - WINDOW, at);
    const after = average(tempos, at, at + WINDOW);
    const moved = Math.abs(after - before) / Math.min(before, after);
    if (moved >= TEMPO_MOVES && (steady(at - WINDOW) || steady(at)) && moved * 5 > strength) {
      strength = moved * 5;
      reason = after > before ? 'Tempo rises' : 'Tempo falls';
    }
    if (reason) candidates.push({ bar: at / BEATS_PER_BAR, reason, strength });
  }
  // The strongest within two bars of itself, so a change that takes a bar to
  // land is one suggestion and not four. A tempo change is judged over a
  // phrase either side and its shadow is as long, so two of those closer
  // than a phrase are one.
  const tempo = (s: SectionSuggestion) => s.reason.startsWith('Tempo');
  const same = (a: SectionSuggestion, b: SectionSuggestion) => {
    const apart = Math.abs(a.bar - b.bar) * BEATS_PER_BAR;
    return tempo(a) && tempo(b) ? apart < WINDOW : apart <= APART;
  };
  const selected: SectionSuggestion[] = [];
  for (const next of candidates.sort((a, b) => b.strength - a.strength || a.bar - b.bar)) {
    if (!selected.some((s) => same(s, next))) selected.push(next);
  }
  return selected.sort((a, b) => a.bar - b.bar);
}
