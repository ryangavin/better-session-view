import { midiPitch, type PitchMap } from './pitchMap.ts';
import { keyRegions, type KeyRegion } from './debug/pitch/evidence.ts';

export const KEY_VERSION = 3;
const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export interface KeyCandidate { tonic: number; mode: 'major' | 'minor'; label: string; support: number }
export interface KeyAnalysis {
  version: number;
  algorithm: 'bass-scale-compatibility';
  analyzedAt: string;
  source: { hash: string; mapHash: string; stems: string; model: string };
  status: 'unknown' | 'ambiguous' | 'candidate' | 'multiple';
  confidence: 'insufficient' | 'low' | 'moderate';
  label: string;
  candidates: KeyCandidate[];
  alternatives: KeyCandidate[];
  coverage: number;
  regions: KeyRegion[];
  possibleChanges: boolean;
}

/** Bass evidence only. Scale support is a fraction of usable pitch duration,
 * never a probability. Relative major/minor membership remains ambiguous. */
export function estimateKey(map: PitchMap, source: KeyAnalysis['source'], analyzedAt = new Date().toISOString()): KeyAnalysis {
  const bins = Array<number>(12).fill(0);
  for (let i = 0; i < map.hz.length; i++) {
    if (map.state[i] !== 'voiced' || !map.hz[i]) continue;
    const pitch = midiPitch(map.hz[i]!);
    if (Math.abs(pitch - Math.round(pitch)) > .35) continue;
    bins[(Math.round(pitch) % 12 + 12) % 12] += Math.min(map.step, map.seconds - i * map.step);
  }
  const total = bins.reduce((a, b) => a + b, 0), coverage = total / map.seconds;
  const scores: KeyCandidate[] = (['major', 'minor'] as const).flatMap(mode => names.map((name, tonic) => {
    const steps = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    return { tonic, mode, label: `${name} ${mode}`, support: total ? steps.reduce((sum, step) => sum + bins[(tonic + step) % 12], 0) / total : 0 };
  })).sort((a, b) => Math.abs(a.support - b.support) < 1e-9 ? 0 : b.support - a.support);
  // Whole-song evidence tolerates breaks, but still requires ten seconds of
  // stable voiced pitch and four meaningful pitch classes. No pedal-key guess.
  const enough = total >= 10 && coverage >= .1 && bins.filter(b => b > total * .03).length >= 4 && scores[0].support >= .9;
  const tied = enough ? scores.filter(s => s.support >= scores[0].support - .025) : [];
  const regions = keyRegions(map, 16);
  const known = new Set(regions.filter(r => r.label !== 'Unknown').map(r => r.label));
  const possibleChanges = known.size > 1;
  const regional = new Set(regions.flatMap(r => r.candidates));
  const alternatives = enough ? tied : scores.filter(c => regional.has(c.label));
  const roots = alternatives.map(candidate => ({ candidate, weight: total ? bins[candidate.tonic] / total : 0 }))
    .sort((a, b) => b.weight - a.weight || b.candidate.support - a.candidate.support);
  // Bass scale membership cannot establish harmonic modulation. Publish the
  // highest-ranked interpretation only; ties and changing regional hypotheses
  // remain diagnostic evidence, never additional song keys or filter entries.
  const candidates = roots.slice(0, 1).map(r => r.candidate);
  const status = candidates.length ? 'candidate' : 'unknown';
  return { version: KEY_VERSION, algorithm: 'bass-scale-compatibility', analyzedAt, source, status,
    confidence: !candidates.length ? 'insufficient' : coverage >= .5 ? 'moderate' : 'low',
    label: candidates.length ? candidates.map(c => c.label).join(' / ') : 'Unknown',
    candidates, alternatives, coverage, regions, possibleChanges };
}

type KeyTrack = { key: string | null; keyAnalysis?: KeyAnalysis | null; stems: string | null; model: string | null };
export function savedKey(track: KeyTrack): KeyAnalysis | null {
  const a = track.keyAnalysis;
  return a?.version === KEY_VERSION && a.algorithm === 'bass-scale-compatibility' && a.source?.stems === track.stems && a.source.model === track.model && Array.isArray(a.candidates) && Array.isArray(a.regions) ? a : null;
}
export function keyLabel(track: KeyTrack): string { return track.key?.trim() || savedKey(track)?.label || 'Unknown'; }
export function keyFilters(track: KeyTrack): string[] {
  if (track.key?.trim()) return [track.key.trim()];
  const a = savedKey(track);
  if (!a || a.status === 'unknown') return ['Unknown'];
  return a.candidates.slice(0, 1).map(c => c.label);
}
export function keyDescription(track: KeyTrack): string {
  if (track.key?.trim()) return `${track.key} · manual key; bass analysis does not overwrite it`;
  const a = savedKey(track);
  if (!a) return 'Unknown · no current bass key analysis';
  return `${a.label} · estimated key`;
}
