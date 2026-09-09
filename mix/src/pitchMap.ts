import type { TranscribedNote } from './tab.ts';

export interface PitchEvidence { map: PitchMap; notes: TranscribedNote[]; transpose: number }

/** Raw model evidence. Instrument tuning and manual note corrections do not alter it. */
export interface PitchMap {
  openflow: 'mix-pitch-map';
  version: 1;
  source: { hash: string; bytes: number };
  engine: { name: string; version: string; model: string; fmin: number; fmax: number; hopMs: number; decoder: string; batchSize: number; seed: number };
  seconds: number;
  sampleRate: number;
  start: number;
  step: number;
  windowSeconds: number;
  policy: { periodicityFloor: number; silenceDb: number };
  hz: (number | null)[];
  periodicity: (number | null)[];
  smoothedPeriodicity: (number | null)[];
  rmsDb: (number | null)[];
  state: ('voiced' | 'unvoiced' | 'silent' | 'invalid')[];
}

export const midiPitch = (hz: number): number => 69 + 12 * Math.log2(hz / 440);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const pitchName = (pitch: number): string => `${NAMES[((Math.round(pitch) % 12) + 12) % 12]}${Math.floor(Math.round(pitch) / 12) - 1}`;

/** Reject malformed evidence rather than draw plausible frames on a wrong clock. */
export function validPitchMap(value: unknown): value is PitchMap {
  if (!value || typeof value !== 'object') return false;
  const p = value as PitchMap;
  if (p.openflow !== 'mix-pitch-map' || p.version !== 1 || p.start !== 0 ||
    !Number.isFinite(p.seconds) || p.seconds <= 0 || !Number.isFinite(p.step) || p.step <= 0 ||
    !Number.isFinite(p.sampleRate) || p.sampleRate <= 0 || !Number.isFinite(p.windowSeconds) || p.windowSeconds <= 0 ||
    typeof p.source?.hash !== 'string' || !Number.isFinite(p.source.bytes) ||
    typeof p.engine?.name !== 'string' || !Number.isFinite(p.engine.fmin) || !Number.isFinite(p.engine.fmax) ||
    !Number.isFinite(p.policy?.periodicityFloor) || !Number.isFinite(p.policy.silenceDb) ||
    !Array.isArray(p.hz) || p.hz.length === 0) return false;
  const n = p.hz.length;
  if ((n - 1) * p.step >= p.seconds || n * p.step < p.seconds - p.step) return false;
  const numbers = [p.hz, p.periodicity, p.smoothedPeriodicity, p.rmsDb];
  if (!numbers.every(a => Array.isArray(a) && a.length === n && a.every(v => v === null || Number.isFinite(v)))) return false;
  return Array.isArray(p.state) && p.state.length === n && p.state.every((s, i) =>
    ['voiced', 'unvoiced', 'silent', 'invalid'].includes(s) &&
    (s !== 'voiced' || (p.hz[i] !== null && p.hz[i]! > 0 && p.smoothedPeriodicity[i] !== null)));
}
