import { describe, expect, it } from 'vitest';
import { followOf, type Follow } from './follow.ts';
import { fitOf } from './tempo.ts';
import { heardIn, type Heard } from './transients.ts';
import { tempoAt } from './warp.ts';

/**
 * What this protects is a sample for every beat, where the beat was.
 *
 * Two failures pull against each other. A follower that trusts every hit
 * grabs the syncopated kick and calls it the beat; one that trusts the seed
 * loses a band the moment it pushes into a chorus. And a third is quieter: a
 * breakdown with nothing in it, where the beats have to go on being counted
 * at the right spacing so the first kick after it lands on the beat it is.
 * So every fixture is four minutes long, rendered, and what is asserted is
 * the sample of a beat deep in the song.
 */

const RATE = 16000;
const SECONDS = 240;
/** How far a beat may be from the strike it stands for. Three milliseconds, which is what a sixty-hertz kick allows. */
const CLOSE = 0.003;

function strike(out: Float32Array, at: number, hz: number, ring: number, loud: number): void {
  const from = Math.round(at * RATE);
  if (from < 0 || from >= out.length) return;
  const span = Math.min(out.length - from, Math.round(RATE * ring * 8));
  for (let i = 0; i < span; i++) {
    out[from + i] += loud * Math.sin((2 * Math.PI * hz * i) / RATE) * Math.exp(-i / (RATE * ring));
  }
}

/** A deterministic drummer: the same wobble every run. */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

/** The beats of a song whose tempo is a function of the bar, until the file ends. */
function beatsOf(offset: number, tempoAt: (bar: number) => number): number[] {
  const out: number[] = [];
  let at = offset;
  for (let k = 0; at < SECONDS; k++) {
    out.push(at);
    at += 60 / tempoAt(k / 4);
  }
  return out;
}

interface Playing {
  /** Which beats of the bar carry a kick, by bar. Every beat unless said otherwise. */
  kicks?: (bar: number) => number[];
  snares?: number[];
  /** A jitter on every hit, in seconds, one standard deviation. Returns the times actually struck. */
  jitter?: number;
}

/** A kit playing those beats, rendered and heard. Returns what was heard and when each beat was really struck. */
function kit(beats: readonly number[], { kicks, snares = [], jitter = 0 }: Playing = {}): { heard: Heard; struck: number[] } {
  const out = new Float32Array(SECONDS * RATE);
  const wobble = lcg(7);
  const gauss = () => {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += wobble();
    return sum - 6;
  };
  const struck: number[] = [];
  beats.forEach((at, k) => {
    const inBar = k % 4;
    const bar = Math.floor(k / 4);
    const when = at + (jitter > 0 ? gauss() * jitter : 0);
    struck.push(when);
    const on = kicks ? kicks(bar) : [0, 1, 2, 3];
    if (on.includes(inBar)) strike(out, when, 60, 0.05, inBar === 0 ? 1 : 0.8);
    if (snares.includes(inBar)) strike(out, when, 1000, 0.04, 0.9);
  });
  return { heard: heardIn([out], RATE)!, struck };
}

/** The follower, from the seed it would be given in the window. */
function followed(heard: Heard): Follow {
  const seed = fitOf(heard);
  expect(seed).not.toBeNull();
  const follow = followOf(heard, seed!);
  expect(follow).not.toBeNull();
  return follow!;
}

/** Where the map puts beat `k`, in seconds. Beat zero is bar 1's downbeat. */
const at = (follow: Follow, k: number): number => follow.beats.samples[k - follow.beats.first] / RATE;

describe('following a machine', () => {
  const beats = beatsOf(0.25, () => 128);
  const { heard } = kit(beats);

  it('places every beat on the kick, to the end of the song', () => {
    const follow = followed(heard);
    for (const k of [0, 1, 100, 250, 400, 510]) expect(Math.abs(at(follow, k) - beats[k])).toBeLessThan(CLOSE);
    expect(follow.tracked).toBeGreaterThan(0.95);
    expect(follow.agreement).toBeGreaterThan(0.9);
  });

  it('counts the beats there were, no more and no fewer', () => {
    const follow = followed(heard);
    const last = follow.beats.first + follow.beats.samples.length - 1;
    expect(last).toBeGreaterThanOrEqual(beats.length - 1);
    expect(last).toBeLessThanOrEqual(beats.length);
  });

  it('runs at one tempo, read off the spacing', () => {
    const follow = followed(heard);
    expect(follow.slowest).toBeGreaterThan(126);
    expect(follow.fastest).toBeLessThan(130);
  });
});

describe('following a band', () => {
  it('follows a ritardando to the end of the song', () => {
    const beats = beatsOf(0.25, (bar) => (bar < 96 ? 128 : 128 - (8 * (bar - 96)) / 32));
    const follow = followed(kit(beats).heard);
    for (const k of [100, 400, 496]) expect(Math.abs(at(follow, k) - beats[k])).toBeLessThan(CLOSE);
    expect(tempoAt(follow.beats, 500)).toBeLessThan(122);
    expect(tempoAt(follow.beats, 100)).toBeGreaterThan(127);
  });

  it('takes a tempo step in its stride', () => {
    const beats = beatsOf(0.25, (bar) => (bar < 60 ? 128 : 132));
    const follow = followed(kit(beats).heard);
    for (const k of [120, 239, 240, 241, 400]) expect(Math.abs(at(follow, k) - beats[k])).toBeLessThan(CLOSE);
    expect(tempoAt(follow.beats, 100)).toBeCloseTo(128, 0);
    expect(tempoAt(follow.beats, 400)).toBeCloseTo(132, 0);
  });

  it('follows a jump from house to the drop', () => {
    // 128 to 140 at bar 60: a jump of nearly a tenth, which a walk held to
    // the seed's tempo could not follow. The local period can.
    const beats = beatsOf(0.25, (bar) => (bar < 60 ? 128 : 140));
    const follow = followed(kit(beats, { snares: [1, 3] }).heard);
    for (const k of [120, 300, 450]) expect(Math.abs(at(follow, k) - beats[k])).toBeLessThan(CLOSE);
  });

  it('follows the drummer, wobble and all', () => {
    // Eight milliseconds of wobble on every hit and a slow lean of a per cent.
    // The beats are where the hits were, not where a line would put them.
    const beats = beatsOf(0.3, (bar) => 128 * (1 + 0.01 * Math.sin((2 * Math.PI * bar) / 64)));
    const { heard, struck } = kit(beats, { jitter: 0.008, snares: [1, 3] });
    const follow = followed(heard);
    for (const k of [50, 200, 400]) expect(Math.abs(at(follow, k) - struck[k])).toBeLessThan(CLOSE);
    expect(follow.tracked).toBeGreaterThan(0.9);
  });

  it('counts through a breakdown at the spacing it had, and lands the first kick after it', () => {
    // Sixteen bars with no kick. The beats in it are evenly spaced between the
    // last kick before and the first after, and that first kick is on the
    // beat it is — not a beat early or late.
    const beats = beatsOf(0.25, () => 128);
    const follow = followed(kit(beats, { kicks: (bar) => (bar >= 40 && bar < 56 ? [] : [0, 1, 2, 3]) }).heard);
    expect(Math.abs(at(follow, 56 * 4) - beats[56 * 4])).toBeLessThan(CLOSE);
    expect(Math.abs(at(follow, 400) - beats[400])).toBeLessThan(CLOSE);
    for (let k = 40 * 4 + 1; k < 56 * 4; k++) {
      const spacing = at(follow, k) - at(follow, k - 1);
      expect(Math.abs(spacing - 60 / 128)).toBeLessThan(0.002);
    }
  });

  it('does not lose the beat when the kick drops to one and three', () => {
    const beats = beatsOf(0.25, () => 128);
    const follow = followed(
      kit(beats, { kicks: (bar) => (bar >= 32 && bar < 64 ? [0, 2] : [0, 1, 2, 3]), snares: [1, 3] }).heard,
    );
    for (const k of [130, 200, 400]) expect(Math.abs(at(follow, k) - beats[k])).toBeLessThan(CLOSE);
  });

  it('finds nothing to follow in silence', () => {
    const silent: Heard = { seconds: SECONDS, rate: RATE, transients: [] };
    expect(followOf(silent, { bpm: 128, offset: 0, agreement: 1 })).toBeNull();
  });
});
