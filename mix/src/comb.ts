import type { Onset } from './flux.ts';
import type { Heard } from './transients.ts';

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
 *
 * The onset function is read once into the frames that carry any strength at
 * all and every tempo is then scored over those alone, because the function
 * `onsetOf` builds is nearly all zeros and a zero moves no bin. A spectral
 * flux is dense and loses nothing by it; a raster of hits is a thousandth as
 * full and the same hundred and twenty tempos cost a twentieth of the time.
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

/** Frames of an onset function that carry any strength, and how much: what every tempo is scored over. */
interface Struck {
  at: Int32Array;
  strength: Float64Array;
}

/** The strength a train at `period` frames gathers at its best phase, harmonics and all. */
function resonance(struck: Struck, period: number): number {
  const { at, strength } = struck;
  const bins = Math.max(2, Math.round(period));
  const binned = new Float64Array(bins);
  for (let i = 0; i < at.length; i++) binned[Math.floor(((at[i] % period) / period) * bins)] += strength[i];
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

/** Every frame with strength in it, in order, so the tempos share one reading of the function. */
function struckIn(values: Float64Array): Struck {
  let n = 0;
  for (let i = 0; i < values.length; i++) if (values[i] !== 0) n++;
  const at = new Int32Array(n);
  const strength = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === 0) continue;
    at[k] = i;
    strength[k] = values[i];
    k++;
  }
  return { at, strength };
}

export function combOf(onset: Onset, slowest: number, fastest: number): Comb | null {
  const { values, per } = onset;
  if (values.length < 2) return null;
  const struck = struckIn(values);
  const scored: { bpm: number; confidence: number }[] = [];
  let strongest = 0;
  for (let bpm = Math.ceil(slowest); bpm <= Math.floor(fastest); bpm++) {
    const lean = Math.log2(bpm / LEAN_BPM) / LEAN_SIGMA;
    const score = resonance(struck, 60 / bpm / per) * Math.exp(-0.5 * lean * lean);
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

/** Frames of the raster a hit is laid on. The flux's own hop, so a period counts the same frames it always did. */
const HOP = 512;

/**
 * The hits as an onset function, so a tempo can be had off what
 * `transients.ts` already heard.
 *
 * An arm that places its beats on our hits was hearing the file twice: the
 * bands once, and then a whole STFT whose only purpose was to hand this a
 * function to resonate over. That second hearing was five sixths of the arm's
 * running time — two and a half seconds of FFT on an eight-minute track, to
 * produce one number. A hit is already an onset, and a rise is what a
 * spectral flux measures, so each one is laid on the flux's own frame grid at
 * the sharpness it stood up with. All three bands go in: what the kick does
 * on the beat, the snare on two and four and the hats between them is the
 * evidence for the pulse, and the comb is asking exactly that question.
 */
export function onsetOf(heard: Heard): Onset {
  const per = HOP / heard.rate;
  const values = new Float64Array(Math.max(2, Math.ceil(heard.seconds / per)));
  for (const hit of heard.transients) {
    const frame = Math.round(hit.at / per);
    if (frame >= 0 && frame < values.length) values[frame] += hit.strength;
  }
  return { values, per, first: 0 };
}
