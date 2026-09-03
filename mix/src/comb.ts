import type { Onset } from './flux.ts';

/**
 * A tempo by comb-filter resonance, after audiojs/beat (MIT).
 *
 * Every whole tempo in the range is tried as a train of pulses over the onset
 * function, with its second, third and fourth harmonics at diminishing
 * weight, and the train that gathers the most onset strength under its
 * pulses is the tempo (Scheirer 1998). A log-Gaussian lean toward 120
 * settles between octaves — the lean `tempo.ts` gave up in favour of asking
 * what the kit does — and that difference is one of the things the harness
 * is there to measure.
 *
 * One departure from the library. It anchored every train at frame zero and
 * never slid it, so a tempo scored by where the song's beats happened to sit
 * against the top of the file, and a rendered click train at 132 was called
 * 154. Scheirer's filter is a resonator and has no anchor. So each tempo is
 * scored at its best phase: the strength is binned by phase within one
 * period, and the train is slid around the bin.
 */

export interface Comb {
  bpm: number;
  /** 0 to 1, against the strongest tempo tried. */
  confidence: number;
  /** Every tempo tried, strongest first, with octave duplicates of a stronger one dropped. */
  candidates: { bpm: number; confidence: number }[];
}

const LEAN_BPM = 120;
const LEAN_SIGMA = 1.4;
const HARMONICS = 4;
/** How wide the raised-cosine window under each pulse is, as a share of the pulse's period. */
const WIDTH = 0.15;

/** The strength a train at `period` frames gathers at its best phase, harmonics and all. */
function resonance(values: Float64Array, period: number): number {
  const bins = Math.max(2, Math.round(period));
  const binned = new Float64Array(bins);
  for (let i = 0; i < values.length; i++) binned[Math.floor(((i % period) / period) * bins)] += values[i];
  const kernel = new Float64Array(bins);
  for (let h = 1; h <= HARMONICS; h++) {
    const p = bins / h;
    const half = Math.max(1, p * WIDTH);
    for (let b = 0; b < bins; b++) {
      let phase = b % p;
      if (phase > p / 2) phase = p - phase;
      if (phase < half) kernel[b] += (0.5 * (1 + Math.cos((Math.PI * phase) / half))) / h;
    }
  }
  let best = 0;
  for (let phase = 0; phase < bins; phase++) {
    let sum = 0;
    for (let b = 0; b < bins; b++) sum += binned[(phase + b) % bins] * kernel[b];
    if (sum > best) best = sum;
  }
  return best;
}

export function combOf(onset: Onset, slowest: number, fastest: number): Comb | null {
  const { values, per } = onset;
  if (values.length < 2) return null;
  const scored: { bpm: number; confidence: number }[] = [];
  let strongest = 0;
  for (let bpm = Math.ceil(slowest); bpm <= Math.floor(fastest); bpm++) {
    const lean = Math.log2(bpm / LEAN_BPM) / LEAN_SIGMA;
    const score = resonance(values, 60 / bpm / per) * Math.exp(-0.5 * lean * lean);
    scored.push({ bpm, confidence: score });
    if (score > strongest) strongest = score;
  }
  if (!(strongest > 0)) return null;
  for (const s of scored) s.confidence /= strongest;
  scored.sort((a, b) => b.confidence - a.confidence);
  const candidates: Comb['candidates'] = [];
  for (const s of scored) {
    const duplicate = candidates.some((c) => {
      const ratio = s.bpm / c.bpm;
      return (ratio > 0.95 && ratio < 1.05) || (ratio > 1.95 && ratio < 2.05) || (ratio > 0.45 && ratio < 0.55);
    });
    if (!duplicate) candidates.push(s);
  }
  return { bpm: candidates[0].bpm, confidence: candidates[0].confidence, candidates };
}
