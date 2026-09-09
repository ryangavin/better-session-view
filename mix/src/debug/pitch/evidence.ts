import { midiPitch, type PitchMap } from '../../pitchMap.ts';

export interface PitchReference {
  sourceHash: string;
  provenance: string;
  kind: 'synthetic' | 'resynthesized' | 'human';
  /** Hz zero is explicitly unvoiced; null is unannotated, never silence. */
  frames: { time: number; hz: number | null }[];
}

export function parseReference(text: string, sourceHash: string): PitchReference {
  const r = JSON.parse(text) as PitchReference;
  if (r.sourceHash !== sourceHash) throw new Error('Reference belongs to different audio bytes.');
  if (!r.provenance?.trim() || !['synthetic', 'resynthesized', 'human'].includes(r.kind) || !Array.isArray(r.frames) || !r.frames.length ||
    r.frames.some((f, i) => !Number.isFinite(f.time) || f.time < 0 ||
      (i > 0 && f.time <= r.frames[i - 1].time) || (f.hz !== null && (!Number.isFinite(f.hz) || f.hz < 0)))) {
    throw new Error('Reference needs provenance, kind and increasing time/Hz frames (0 unvoiced, null unannotated).');
  }
  return r;
}

export function scorePitch(map: PitchMap, reference: PitchReference, from = 0, to = map.seconds) {
  let voiced = 0, unvoiced = 0, detected = 0, falseVoiced = 0, correct = 0, octave = 0;
  const errors: number[] = [];
  const disagreements: number[] = [];
  for (const f of reference.frames) {
    if (f.hz === null || f.time < from || f.time >= to) continue;
    const i = Math.round((f.time - map.start) / map.step);
    if (i < 0 || i >= map.hz.length || Math.abs(i * map.step - f.time) > map.step / 2 + 1e-8) continue;
    const estimated = map.state[i] === 'voiced' && map.hz[i] !== null;
    if (f.hz === 0) {
      unvoiced++;
      if (estimated) { falseVoiced++; disagreements.push(f.time); }
      continue;
    }
    voiced++;
    if (!estimated) { disagreements.push(f.time); continue; }
    detected++;
    const cents = Math.abs(1200 * Math.log2(map.hz[i]! / f.hz));
    errors.push(cents);
    if (cents <= 50) correct++;
    else {
      disagreements.push(f.time);
      if (Math.round(cents / 1200) >= 1 && Math.abs(cents - Math.round(cents / 1200) * 1200) <= 50) octave++;
    }
  }
  errors.sort((a, b) => a - b);
  return { voiced, unvoiced, detected, falseVoiced, correct, octave, disagreements,
    medianCents: errors.length ? (errors[Math.floor((errors.length - 1) / 2)] + errors[Math.floor(errors.length / 2)]) / 2 : null };
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const SCALES = [
  { mode: 'major', steps: [0, 2, 4, 5, 7, 9, 11] },
  { mode: 'minor', steps: [0, 2, 3, 5, 7, 8, 10] },
];
export interface KeyRegion { from: number; to: number; label: string; coverage: number; candidates: string[] }

/** Experimental scale compatibility, not proof of harmony. Equal relative keys stay equal.
 * Eight-second windows suppress individual passing-note changes. All thresholds are
 * explicit research defaults, not validated acceptance criteria or probabilities.
 */
export function keyRegions(map: PitchMap, windowSeconds = 8, tuningCents = 0): KeyRegion[] {
  if (!(windowSeconds >= 1) || !Number.isFinite(windowSeconds) || !Number.isFinite(tuningCents)) return [];
  const result: KeyRegion[] = [];
  for (let from = 0; from < map.seconds; from += windowSeconds) {
    const to = Math.min(map.seconds, from + windowSeconds);
    const bins = new Array<number>(12).fill(0);
    let total = 0;
    for (let i = Math.ceil(from / map.step); i < Math.min(map.hz.length, Math.ceil(to / map.step)); i++) {
      if (map.state[i] !== 'voiced' || !map.hz[i]) continue;
      const pitch = midiPitch(map.hz[i]!) - tuningCents / 100;
      // Slides between semitones are preserved in the map, but are not votes
      // for whichever chromatic bin a rounding operation happens to choose.
      if (Math.abs(pitch - Math.round(pitch)) > 0.35) continue;
      const weight = Math.min(map.step, to - i * map.step);
      bins[((Math.round(pitch) % 12) + 12) % 12] += weight;
      total += weight;
    }
    const coverage = total / (to - from);
    const distinct = bins.filter(b => b > total * 0.03).length;
    const scores = SCALES.flatMap(scale => NAMES.map((name, tonic) => ({
      label: `${name} ${scale.mode}`, score: total ? scale.steps.reduce((sum, n) => sum + bins[(tonic + n) % 12], 0) / total : 0,
    }))).sort((a, b) => Math.abs(b.score - a.score) < 1e-9 ? 0 : b.score - a.score);
    const candidates = coverage >= 0.5 && distinct >= 4 && scores[0].score >= 0.9
      ? scores.filter(s => s.score >= scores[0].score - 0.025).map(s => s.label) : [];
    const label = candidates.length && candidates.length <= 4 ? candidates.join(' / ') : 'Unknown';
    const previous = result.at(-1);
    if (previous?.label === label) {
      previous.coverage = (previous.coverage * (previous.to - previous.from) + total) / (to - previous.from);
      previous.to = to;
    } else result.push({ from, to, label, coverage, candidates });
  }
  return result;
}
