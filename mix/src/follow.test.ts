import { describe, expect, it } from 'vitest';
import { followOf, seedOf } from './follow.ts';
import { barAt, fitOf, mapOf, placeOf, tempoAt, type Heard, type Marker } from './warp.ts';

/**
 * What this protects is a grid that follows a drummer without inventing one
 * for a machine.
 *
 * Two failures, and they pull against each other. A follower that trusts
 * every hit turns a record made to a click into a hundred pins and a playback
 * rate that wobbles; one that trusts the seed loses a band the moment it
 * pushes into a chorus. So every fixture here is four minutes long and what is
 * asserted is where bar 100 lands — and, for the record, that nothing was
 * pinned at all.
 */

const SECONDS = 240;
const COLUMNS = 20672;
const PER = SECONDS / COLUMNS;
/** A column of the envelope, which is what a hit is placed to before the parabola. */
const DRIFT = 0.015;

/** One thing the kit did: when, how loud, and whether it is in the kick band. */
interface Strike {
  at: number;
  loud: number;
  low: boolean;
}

/** The two envelopes a fit listens to, from a list of strikes. */
function heardOf(strikes: readonly Strike[]): Heard {
  const low = new Float32Array(COLUMNS);
  const wide = new Float32Array(COLUMNS);
  const hit = (level: Float32Array, at: number, loud: number, ring: number) => {
    const from = Math.floor(at / PER);
    if (from < 0) return;
    for (let i = from; i < COLUMNS && i < from + 80; i++) {
      level[i] = Math.max(level[i], loud * Math.exp((-(i - from) * PER) / ring));
    }
  };
  for (const strike of strikes) {
    if (strike.low) hit(low, strike.at, strike.loud, 0.06);
    hit(wide, strike.at, strike.loud, strike.low ? 0.06 : 0.09);
  }
  return { low: { level: low, per: PER }, wide: { level: wide, per: PER } };
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

/** A deterministic drummer: the same wobble every run. */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

interface Playing {
  /** Which beats of the bar carry a kick, by bar. Every beat unless said otherwise. */
  kicks?: (bar: number) => number[];
  /** Which beats carry a snare. */
  snares?: number[];
  /** A jitter on every hit, in seconds, one standard deviation. */
  jitter?: number;
}

/** A kit playing those beats. */
function kit(beats: readonly number[], { kicks, snares = [], jitter = 0 }: Playing = {}): Strike[] {
  const wobble = lcg(7);
  const gauss = () => {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += wobble();
    return sum - 6;
  };
  const strikes: Strike[] = [];
  beats.forEach((at, k) => {
    const inBar = k % 4;
    const bar = Math.floor(k / 4);
    const when = at + (jitter > 0 ? gauss() * jitter : 0);
    const on = kicks ? kicks(bar) : [0, 1, 2, 3];
    if (on.includes(inBar)) strikes.push({ at: when, loud: inBar === 0 ? 1 : 0.8, low: true });
    if (snares.includes(inBar)) strikes.push({ at: when, loud: 0.9, low: false });
  });
  return strikes;
}

/** Where the map puts a bar, in seconds. */
const at = (markers: readonly Marker[], bar: number) =>
  placeOf(mapOf(SECONDS, markers, 120), bar) * SECONDS;

/** The follower, from the seed it would be given in the window. */
function followed(heard: Heard) {
  const seed = seedOf(heard);
  expect(seed).not.toBeNull();
  const follow = followOf(heard, seed!);
  expect(follow).not.toBeNull();
  return follow!;
}

describe('following a machine', () => {
  const beats = beatsOf(0.25, () => 128);
  const heard = heardOf(kit(beats));

  it('comes back as the two markers a straight line is', () => {
    // Live 11.3.10's rule, and the one that matters most often: a record made
    // to a click gets one constant tempo, not a pin on every bar.
    const follow = followed(heard);
    expect(follow.markers).toHaveLength(2);
    expect(follow.tracked).toBeGreaterThan(0.95);
  });

  it('holds at bar 100 as well as the fit did', () => {
    const follow = followed(heard);
    expect(Math.abs(at(follow.markers, 100) - beats[400])).toBeLessThan(DRIFT);
  });

  it('agrees with the kick at least as well as the straight fit', () => {
    expect(followed(heard).agreement).toBeGreaterThanOrEqual(fitOf(heard)!.agreement - 0.01);
  });
});

describe('following a band', () => {
  it('follows a ritardando to the end of the song', () => {
    // 128 for ninety-six bars, then down to 120 over the last thirty-two. The
    // straight fit is a beat out by the end; the markers are not.
    const beats = beatsOf(0.25, (bar) => (bar < 96 ? 128 : 128 - (8 * (bar - 96)) / 32));
    const heard = heardOf(kit(beats));
    const follow = followed(heard);
    expect(Math.abs(at(follow.markers, 100) - beats[400])).toBeLessThan(DRIFT);
    expect(Math.abs(at(follow.markers, 124) - beats[496])).toBeLessThan(DRIFT);
    expect(follow.slowest).toBeLessThan(122);
    expect(follow.fastest).toBeGreaterThan(127);
  });

  it('takes a tempo step in its stride', () => {
    // A hard cut from 128 to 132 at bar 60 — a three per cent jump, which is
    // inside the window a beat is looked for in, so the walk never lets go.
    const beats = beatsOf(0.25, (bar) => (bar < 60 ? 128 : 132));
    const heard = heardOf(kit(beats));
    const follow = followed(heard);
    expect(Math.abs(at(follow.markers, 100) - beats[400])).toBeLessThan(DRIFT);
    expect(Math.abs(at(follow.markers, 30) - beats[120])).toBeLessThan(DRIFT);
    // A handful of markers at the step, not one on every bar either side of
    // it — and the tempo either side read off the kick to a hundredth.
    expect(follow.markers.length).toBeLessThanOrEqual(6);
    const map = mapOf(SECONDS, follow.markers, 128);
    expect(tempoAt(map, 20)).toBeCloseTo(128, 1);
    expect(tempoAt(map, 100)).toBeCloseTo(132, 1);
    expect((barAt(map, beats[380] / SECONDS) - barAt(map, beats[300] / SECONDS)) * 4).toBeCloseTo(80, 0);
  });

  it('is seeded even where the whole song will not hold one line', () => {
    // The seed is fitted to the opening when the whole song refuses; a song
    // with a real tempo change in it is the song this file exists for.
    const beats = beatsOf(0.25, (bar) => (bar < 40 ? 120 : bar < 80 ? 132 : 112));
    const heard = heardOf(kit(beats));
    const seed = seedOf(heard);
    expect(seed).not.toBeNull();
    expect(seed!.bpm).toBe(120);
  });

  it('keeps a drummer in the room without pinning every bar', () => {
    // Eight milliseconds of wobble on every hit and a slow lean of a per cent
    // either way over the song. The lean is followed; the wobble is not
    // written down as tempo.
    const beats = beatsOf(0.3, (bar) => 128 * (1 + 0.01 * Math.sin((2 * Math.PI * bar) / 64)));
    const heard = heardOf(kit(beats, { jitter: 0.008, snares: [1, 3] }));
    const follow = followed(heard);
    expect(Math.abs(at(follow.markers, 100) - beats[400])).toBeLessThan(2 * DRIFT);
    expect(Math.abs(at(follow.markers, 50) - beats[200])).toBeLessThan(2 * DRIFT);
    expect(follow.markers.length).toBeGreaterThan(2);
    expect(follow.markers.length).toBeLessThan(40);
  });

  it('carries the count through a breakdown and picks the beat up again', () => {
    // Sixteen bars with no kick in them. The walk carries on at the seed's
    // tempo — good to a hundredth of a BPM — and the first kick after the gap
    // has to land on a bar line, not a beat early or late.
    const beats = beatsOf(0.25, () => 128);
    const heard = heardOf(kit(beats, { kicks: (bar) => (bar >= 40 && bar < 56 ? [] : [0, 1, 2, 3]) }));
    const follow = followed(heard);
    const map = mapOf(SECONDS, follow.markers, 128);
    const landed = barAt(map, beats[56 * 4] / SECONDS);
    expect(Math.abs(landed - Math.round(landed))).toBeLessThan(1 / 32);
    expect(Math.abs(at(follow.markers, 100) - beats[400])).toBeLessThan(DRIFT);
    expect(follow.markers.every((m) => m.bar < 40 || m.bar >= 56)).toBe(true);
  });

  it('does not lose the beat when the kick drops to one and three', () => {
    const beats = beatsOf(0.25, () => 128);
    const heard = heardOf(
      kit(beats, { kicks: (bar) => (bar >= 32 && bar < 64 ? [0, 2] : [0, 1, 2, 3]), snares: [1, 3] }),
    );
    const follow = followed(heard);
    expect(Math.abs(at(follow.markers, 100) - beats[400])).toBeLessThan(DRIFT);
    expect(follow.tracked).toBeGreaterThan(0.8);
  });

  it('warps from a point rather than from the top when asked', () => {
    const beats = beatsOf(0.25, (bar) => (bar < 60 ? 128 : 132));
    const heard = heardOf(kit(beats));
    const seed = seedOf(heard)!;
    const rest = followOf(heard, seed, beats[240])!;
    expect(rest.markers[0].bar).toBeGreaterThanOrEqual(60);
    expect(Math.abs(at(rest.markers, 100) - beats[400])).toBeLessThan(DRIFT);
  });

  it('finds nothing to follow in silence', () => {
    const silent: Heard = {
      low: { level: new Float32Array(COLUMNS), per: PER },
      wide: { level: new Float32Array(COLUMNS), per: PER },
    };
    expect(followOf(silent, { bpm: 128, offset: 0, agreement: 1 })).toBeNull();
  });
});
