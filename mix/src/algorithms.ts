/**
 * The beat finding, several ways, so the harness can run them against one
 * another on the same track.
 *
 * Our own pipeline is three stages — `transients.ts` hears the hits,
 * `tempo.ts` fits a line through them, `follow.ts` follows the beat through
 * the song — and the library this is measured against (audiojs/beat, copied
 * into `flux.ts`, `comb.ts` and `ellis.ts`) has the same three. So an entry
 * here is not simply ours or theirs: their onsets can be handed to our fit
 * and follower, their tempo can seed our follower, and each swap says which
 * stage is losing the accuracy. That is the whole point of running them side
 * by side rather than one at a time.
 */
import { combOf, onsetOf } from './comb.ts';
import { ellisOf, gridOf } from './ellis.ts';
import { fluxOf, heardOf, monoOf, onsetsOf } from './flux.ts';
import { followOf, type Follow } from './follow.ts';
import { beatnessOf, FASTEST, fitOf, phaseOf, SLOWEST, type Fit } from './tempo.ts';
import type { Trace } from './trace.ts';
import { heardIn, type Heard } from './transients.ts';
import { beatsOf, type Beats } from './warp.ts';

/**
 * One way of finding the beat: what to call it, and what it actually does.
 *
 * One list rather than an id list beside a table of names beside a table of
 * descriptions. Three of these were kept in three places and drifted: the
 * menu called one thing what the tooltip called something else.
 */
export interface Described {
  id: string;
  /** For a menu: what it is. */
  name: string;
  /** For the row beneath it: how it gets there, stage by stage. */
  does: string;
  /** Whose stages these are, which is what a comparison is usually asking. */
  from: 'ours' | 'theirs' | 'mixed';
}

export const ALGORITHMS = [
  { id: 'ours', name: 'Adaptive beat follower', from: 'ours', does: 'our transients, our fit, our follower' },
  { id: 'line', name: 'Fitted straight grid', from: 'ours', does: 'our transients and our fit, laid straight: the fitted line, no follower' },
  { id: 'whole', name: 'Whole-tempo grid', from: 'ours', does: 'a straight grid at the whole-number tempo from the fitted 1.1.1: what a file labelled with that tempo gets' },
  { id: 'flux', name: 'Spectral onset follower', from: 'mixed', does: 'their spectral flux onsets into our fit and follower' },
  { id: 'comb', name: 'Comb-seeded follower', from: 'mixed', does: 'our transients; their comb-filter tempo seeds our follower' },
  { id: 'ellis', name: 'Dynamic beat tracker', from: 'theirs', does: 'their onsets, their comb tempo, their dynamic-programming tracker' },
  { id: 'grid', name: 'Comb straight grid', from: 'theirs', does: 'their onsets, their comb tempo, a straight grid at the best phase' },
] as const satisfies readonly Described[];

export type Algorithm = (typeof ALGORITHMS)[number]['id'];

/** The ids in order, for the places that want the bare list. */
export const IDS = ALGORITHMS.map((a) => a.id) as readonly Algorithm[];

/**
 * What the app itself offers, in menu order — and the first of them is what an
 * import gets without being asked.
 *
 * Ellis leads because it is the one that reads a whole song rather than the
 * part of it with drums in. Ours starts counting at the first kick, so on a
 * track with a minute of intro bar 1 lands a minute in and everything before
 * it falls outside the bars; Ellis rules the file. On Some Chords that is the
 * difference between 928 beats and 1033 — 105 beats, which is the 49 seconds
 * before the drums arrive.
 *
 * `whole` and `grid` stay in the harness. The first is a diagnostic — what a
 * file labelled with a whole tempo would get — and the second is measurably
 * wrong, landing off the beat on every track in the library.
 */
export const OFFERED: readonly Algorithm[] = ['ellis', 'ours', 'line', 'flux', 'comb'];

/** What an import runs when nobody has chosen. */
export const FIRST_CHOICE: Algorithm = 'ellis';

/**
 * What laid a grid: one of the algorithms, or a hand.
 *
 * `'hand'` is written down rather than left as an absence, because absence
 * already means something else — a file from before this was recorded, whose
 * grid an algorithm certainly made and nobody can now say which. Claiming
 * those were made by hand would be inventing a fact about somebody's work.
 */
export type Made = Algorithm | 'hand';

export const describe = (id: Algorithm): Described =>
  ALGORITHMS.find((a) => a.id === id) ?? ALGORITHMS[0];

/** What the algorithms hear: the drums stem alone, or every stem summed back into the whole. */
export const INPUTS = ['drums', 'full'] as const;
export type Input = (typeof INPUTS)[number];

/** The algorithm's default file name is bare; every other pairing carries its name. */
export const variantOf = (input: Input, algorithm: Algorithm): string | null => (input === 'drums' && algorithm === 'ours' ? null : `${input}.${algorithm}`);

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

export function run(algorithm: Algorithm, channels: readonly Float32Array[], rate: number, trace: Trace): Run | null {
  const length = channels[0].length;
  const seconds = length / rate;
  if (algorithm === 'ours' || algorithm === 'line' || algorithm === 'whole') {
    const heard = heardIn(channels, rate);
    if (!heard) return null;
    const fit = fitOf(heard, trace.tempo);
    if (algorithm === 'ours') {
      const follow = fit ? followOf(heard, fit, trace.follow) : null;
      return { heard, fit, follow, beats: follow?.beats ?? null };
    }
    if (!fit) return { heard, fit, follow: null, beats: null };
    if (algorithm === 'line') return { heard, fit, follow: null, beats: straight(fit.bpm, fit.offset, rate, length) };
    // From the same 1.1.1 as the line, so the two differ only by their drift across the song.
    const whole = Math.round(fit.bpm);
    return { heard, fit: { ...fit, bpm: whole }, follow: null, beats: straight(whole, fit.offset, rate, length) };
  }
  // Before the flux, because this one has no use for it: the tempo resonates
  // over the hits it is already placing beats on, which is what makes it an
  // experiment about the tempo stage alone. It was hearing the file twice —
  // the bands once, then a whole STFT whose only purpose was to hand the comb
  // something to resonate over.
  if (algorithm === 'comb') {
    const heard = heardIn(channels, rate);
    if (!heard) return null;
    const comb = combOf(onsetOf(heard), SLOWEST, FASTEST);
    if (!comb) return { heard, fit: null, follow: null, beats: null };
    const period = 60 / comb.bpm;
    const line = phaseOf(heard.transients.filter((t) => t.band !== 'high'), period, heard.seconds);
    const fit: Fit = { bpm: comb.bpm, offset: line.first, agreement: beatnessOf(heard, period, line.first) };
    const follow = followOf(heard, fit, trace.follow);
    return { heard, fit, follow, beats: follow?.beats ?? null };
  }
  const onset = fluxOf(monoOf(channels), rate);
  if (!onset) return null;
  if (algorithm === 'flux') {
    const heard = heardOf(onset, rate, seconds);
    const fit = fitOf(heard, trace.tempo);
    const follow = fit ? followOf(heard, fit, trace.follow) : null;
    return { heard, fit, follow, beats: follow?.beats ?? null };
  }
  const comb = combOf(onset, SLOWEST, FASTEST);
  const heard = heardOf(onset, rate, seconds);
  if (!comb) return { heard, fit: null, follow: null, beats: null };
  const times = algorithm === 'ellis' ? ellisOf(onset, comb.bpm) : gridOf(onsetsOf(onset), comb.bpm, seconds);
  const beats = mapOf(times, rate, length, comb.bpm);
  const fit: Fit = { bpm: comb.bpm, offset: beats ? beats.samples[0] / rate : 0, agreement: comb.confidence };
  return { heard, fit, follow: null, beats };
}

/**
 * How closely one map agrees with another, with no truth to appeal to.
 *
 * The truth files were abandoned: hand-correcting a whole song to score
 * against is more work than listening to the result, and there are eight
 * tracks in the library and one pair of ears. What is left is still worth a
 * lot — *do these seven agree with each other, and where do they part?* Seven
 * algorithms landing on the same beat is not proof, but two landing somewhere
 * else together is a question, and one landing alone is usually wrong.
 *
 * Every beat of the reference asks for the nearest beat in the candidate, so
 * this is not symmetric: a candidate at half the tempo answers every
 * reference beat and scores well, while the reference answers only half of
 * its beats. `octave` is what catches that pair, and reading both directions
 * is what tells them apart.
 */
export interface Agreement {
  /** Beats of the reference with a candidate beat inside `CLOSE`, as a fraction. */
  together: number;
  /** The median distance in milliseconds, signed: the candidate late is positive. */
  medianMs: number;
  /** The candidate's tempo over the reference's, rounded where it is near a musical ratio. */
  ratio: number;
  /** 2, ½, 3/2 … where the tempo is a musical multiple rather than the same tempo. */
  octave: string | null;
}

/** How near a candidate beat has to fall to count as the same beat. */
export const CLOSE = 0.025;

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const half = s.length >> 1;
  return s.length % 2 ? s[half] : (s[half - 1] + s[half]) / 2;
};

/** The named ratios worth calling out, since a half-time read is the classic wrong answer. */
const RATIOS: readonly [number, string][] = [
  [2, '2×'], [0.5, '½×'], [1.5, '3/2×'], [2 / 3, '2/3×'], [3, '3×'], [1 / 3, '⅓×'], [4, '4×'], [0.25, '¼×'],
];

/**
 * Seconds of each beat, which is what a comparison works in: two maps at
 * different rates or numbered from different downbeats still line up in time.
 */
export const secondsOf = (beats: Beats): number[] => beats.samples.map((s) => s / beats.rate);

export function agreementOf(reference: Beats, candidate: Beats): Agreement {
  const a = secondsOf(reference), b = secondsOf(candidate);
  if (a.length < 2 || b.length < 2) return { together: 0, medianMs: 0, ratio: 0, octave: null };
  const offsets: number[] = [];
  let together = 0;
  // Both are ascending, so the nearest candidate walks forward with the
  // reference rather than being searched for each time.
  let j = 0;
  for (const at of a) {
    while (j + 1 < b.length && Math.abs(b[j + 1] - at) <= Math.abs(b[j] - at)) j++;
    const gap = b[j] - at;
    if (Math.abs(gap) <= CLOSE) {
      together++;
      offsets.push(gap * 1000);
    }
  }
  const spanA = a[a.length - 1] - a[0], spanB = b[b.length - 1] - b[0];
  const perA = spanA / (a.length - 1), perB = spanB / (b.length - 1);
  const ratio = perB > 0 ? perA / perB : 0;
  const near = RATIOS.find(([r]) => Math.abs(ratio - r) < r * 0.04);
  return {
    together: together / a.length,
    medianMs: median(offsets),
    ratio,
    octave: near ? near[1] : null,
  };
}
