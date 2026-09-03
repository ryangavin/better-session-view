/**
 * The beat finding, several ways, so the harness can score them against one
 * another on the same track and the same truth.
 *
 * Our own pipeline is three stages — `transients.ts` hears the hits,
 * `tempo.ts` fits a line through them, `follow.ts` follows the beat through
 * the song — and the library this is measured against (audiojs/beat, copied
 * into `flux.ts`, `comb.ts` and `ellis.ts`) has the same three. So an arm is
 * not only ours or theirs: their onsets can be handed to our fit and
 * follower, their tempo can seed our follower, and each swap says which stage
 * is losing the accuracy.
 */
import { combOf } from '../comb.ts';
import { ellisOf, gridOf } from '../ellis.ts';
import { fluxOf, heardOf, monoOf, onsetsOf } from '../flux.ts';
import { followOf, type Follow } from '../follow.ts';
import { beatnessOf, FASTEST, fitOf, phaseOf, SLOWEST, type Fit } from '../tempo.ts';
import type { Trace } from '../trace.ts';
import { heardIn, type Heard } from '../transients.ts';
import { beatsOf, type Beats } from '../warp.ts';

export const ARMS = ['ours', 'line', 'whole', 'flux', 'comb', 'ellis', 'grid'] as const;
export type Arm = (typeof ARMS)[number];

export const SAYS: Record<Arm, string> = {
  ours: 'our transients, our fit, our follower',
  line: 'our transients and our fit, laid straight: the fitted line, no follower',
  whole: 'a straight grid at the whole-number tempo from the fitted 1.1.1: what a file labelled with that tempo gets',
  flux: 'their spectral flux onsets into our fit and follower',
  comb: 'our transients; their comb-filter tempo seeds our follower',
  ellis: 'their onsets, their comb tempo, their dynamic-programming tracker',
  grid: 'their onsets, their comb tempo, a straight grid at the best phase',
};

/** What the arms hear: the drums stem alone, or every stem summed back into the whole. */
export const INPUTS = ['drums', 'full'] as const;
export type Input = (typeof INPUTS)[number];

/** The arm's default file name is bare; every other pairing carries its name. */
export const variantOf = (input: Input, arm: Arm): string | null => (input === 'drums' && arm === 'ours' ? null : `${input}.${arm}`);

export interface Run {
  heard: Heard;
  fit: Fit | null;
  follow: Follow | null;
  beats: Beats | null;
}

/** A beat map from times in seconds: bar 1 at the first beat, as the follower counts. */
const mapOf = (seconds: readonly number[], rate: number, length: number, bpm: number): Beats | null =>
  seconds.length >= 2 ? beatsOf(rate, length, 0, seconds.map((s) => Math.round(s * rate)), bpm) : null;

/** A straight grid at `bpm` with bar 1's downbeat at `offset`, from the top of the file to the end. */
export function straight(bpm: number, offset: number, rate: number, length: number): Beats | null {
  const period = 60 / bpm;
  const seconds = length / rate;
  const first = Math.ceil(-offset / period);
  const samples: number[] = [];
  for (let k = first; offset + k * period < seconds; k++) samples.push(Math.round((offset + k * period) * rate));
  return samples.length >= 2 ? beatsOf(rate, length, first, samples, bpm) : null;
}

export function run(arm: Arm, channels: readonly Float32Array[], rate: number, trace: Trace): Run | null {
  const length = channels[0].length;
  const seconds = length / rate;
  if (arm === 'ours' || arm === 'line' || arm === 'whole') {
    const heard = heardIn(channels, rate);
    if (!heard) return null;
    const fit = fitOf(heard, trace.tempo);
    if (arm === 'ours') {
      const follow = fit ? followOf(heard, fit, trace.follow) : null;
      return { heard, fit, follow, beats: follow?.beats ?? null };
    }
    if (!fit) return { heard, fit, follow: null, beats: null };
    if (arm === 'line') return { heard, fit, follow: null, beats: straight(fit.bpm, fit.offset, rate, length) };
    // From the same 1.1.1 as the line, so the two differ only by their drift across the song.
    const whole = Math.round(fit.bpm);
    return { heard, fit: { ...fit, bpm: whole }, follow: null, beats: straight(whole, fit.offset, rate, length) };
  }
  const onset = fluxOf(monoOf(channels), rate);
  if (!onset) return null;
  if (arm === 'flux') {
    const heard = heardOf(onset, rate, seconds);
    const fit = fitOf(heard, trace.tempo);
    const follow = fit ? followOf(heard, fit, trace.follow) : null;
    return { heard, fit, follow, beats: follow?.beats ?? null };
  }
  const comb = combOf(onset, SLOWEST, FASTEST);
  if (arm === 'comb') {
    const heard = heardIn(channels, rate);
    if (!heard) return null;
    if (!comb) return { heard, fit: null, follow: null, beats: null };
    const period = 60 / comb.bpm;
    const line = phaseOf(heard.transients.filter((t) => t.band !== 'high'), period, heard.seconds);
    const fit: Fit = { bpm: comb.bpm, offset: line.first, agreement: beatnessOf(heard, period, line.first) };
    const follow = followOf(heard, fit, trace.follow);
    return { heard, fit, follow, beats: follow?.beats ?? null };
  }
  const heard = heardOf(onset, rate, seconds);
  if (!comb) return { heard, fit: null, follow: null, beats: null };
  const times = arm === 'ellis' ? ellisOf(onset, comb.bpm) : gridOf(onsetsOf(onset), comb.bpm, seconds);
  const beats = mapOf(times, rate, length, comb.bpm);
  const fit: Fit = { bpm: comb.bpm, offset: beats ? beats.samples[0] / rate : 0, agreement: comb.confidence };
  return { heard, fit, follow: null, beats };
}
