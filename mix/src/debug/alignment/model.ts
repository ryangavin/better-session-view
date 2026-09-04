import { sampleOf, BEATS_PER_BAR, type Beats } from '../../warp.ts';
import type { Pin } from '../../pinned.ts';

export type Policy = { kind: 'original' } | { kind: 'recurring'; bars: number } | { kind: 'section'; name: string; bars: number };
export interface Request { startBar: number; endBar: number; bpm: number; policy: Policy }
export interface Alignment {
  rate: number;
  pins: Pin[];
  length: number;
  request: Request;
  /** Absolute source beats and positions; destination starts on local bar 1. */
  beats: { beat: number; source: number; output: number; grid: number }[];
  speeds: number[];
}

export function mapped(pins: readonly Pin[], source: number): number {
  let i = 0;
  while (i + 2 < pins.length && source >= pins[i + 1].source) i++;
  const a = pins[i], b = pins[i + 1];
  return a.output + (source - a.source) * (b.output - a.output) / (b.source - a.source);
}

/** Explicit policy only. No detector scores, density search, extrapolation, or structure writes. */
export function alignmentOf(beats: Beats, request: Request): Alignment {
  const { startBar, endBar, bpm, policy } = request;
  if (!Number.isFinite(beats.rate) || beats.rate <= 0 || !Number.isInteger(beats.first) ||
      !Number.isFinite(beats.length) || beats.length <= 0 || beats.samples.length < 2 ||
      beats.samples.some((s, i) => !Number.isFinite(s) || (i > 0 && s <= beats.samples[i - 1])))
    throw new Error('The source beat map must contain finite, strictly increasing samples.');
  if (![startBar, endBar].every(Number.isFinite) || startBar < 0 || endBar <= startBar)
    throw new Error('Choose an increasing source bar range (bar 1 or later).');
  if (policy.kind !== 'original' && (!Number.isFinite(bpm) || bpm < 20 || bpm > 400)) throw new Error('Target tempo must be 20–400 BPM.');
  const first = startBar * BEATS_PER_BAR, last = endBar * BEATS_PER_BAR;
  if (first < beats.first || last > beats.first + beats.samples.length - 1)
    throw new Error('Choose boundaries inside the stored beat map; this experiment does not extrapolate.');
  const sourceAt = (beat: number) => Math.round(sampleOf(beats, beat));
  const from = sourceAt(first), to = sourceAt(last);
  if (from < 0 || to > beats.length || from >= to) throw new Error('The source range lies outside decoded audio.');
  const spacing = policy.kind === 'original' ? 0 : beats.rate * 60 / bpm;
  const pins: Pin[] = [{ source: from, output: 0 }];
  if (policy.kind === 'recurring') {
    if (!Number.isInteger(policy.bars) || policy.bars < 1 || policy.bars > 64)
      throw new Error('Recurring interval must be a whole number from 1 to 64 bars.');
    for (let beat = first + policy.bars * BEATS_PER_BAR; beat < last; beat += policy.bars * BEATS_PER_BAR)
      pins.push({ source: sourceAt(beat), output: Math.round((beat - first) * spacing) });
  }
  if (policy.kind === 'section' && (!policy.name.trim() || !Number.isInteger(policy.bars) || policy.bars < 1 || policy.bars > 64))
    throw new Error('Name the section and declare a whole musical length from 1 to 64 bars.');
  const output = policy.kind === 'original' ? to - from : Math.round((policy.kind === 'section' ? policy.bars * BEATS_PER_BAR : last - first) * spacing);
  pins.push({ source: to, output });
  const speeds = pins.slice(1).map((b, i) => {
    const a = pins[i];
    if (b.source <= a.source || b.output <= a.output) throw new Error('Rounded boundaries must advance in both timelines.');
    return (b.source - a.source) / (b.output - a.output);
  });
  if (Math.max(to - from, output) / beats.rate > 120) throw new Error('Choose at most 120 seconds for this proof of concept.');
  // Existing export sinc has no speed-dependent anti-alias filter. Keep this preview near unity.
  if (speeds.some((speed) => !Number.isFinite(speed) || speed < 0.95 || speed > 1.05))
    throw new Error('This varispeed preview supports source/output speeds of 0.95–1.05 only. Adjust tempo or declared length.');
  const positions: Alignment['beats'] = [];
  for (let beat = Math.ceil(first); beat <= last; beat++) {
    const source = sampleOf(beats, beat);
    positions.push({ beat, source, output: mapped(pins, source), grid: (beat - first) * spacing * (policy.kind === 'section' ? policy.bars / (endBar - startBar) : 1) });
  }
  return { rate: beats.rate, pins, length: output, request, beats: positions, speeds };
}
