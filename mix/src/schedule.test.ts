import { describe, expect, it } from 'vitest';
import { passOf, sourceAt, straight } from './schedule.ts';
import { beatAt, beatsOf, evenBeats, sampleOf, type Beats } from './warp.ts';

/**
 * What this protects is the sound and the playhead agreeing.
 *
 * The stretcher is told where to read and how fast; the playhead is worked
 * out from the same map on the audio clock. If the two ever disagreed the
 * line would drift away from what is heard — the one failure playback.md
 * exists to rule out — and nothing in a browser would say so.
 */

const RATE = 48000;
const SECONDS = 240;
const LENGTH = SECONDS * RATE;

/** 128 for forty bars, 120 for forty, then 132. */
function bent(): Beats {
  const samples: number[] = [];
  let at = 0.5 * RATE;
  const push = (bpm: number, beats: number) => {
    for (let i = 0; i < beats; i++) {
      samples.push(Math.round(at));
      at += (60 * RATE) / bpm;
    }
  };
  push(128, 160);
  push(120, 160);
  push(132, 81);
  return beatsOf(RATE, LENGTH, 0, samples);
}
const map = bent();
const seconds = (beat: number) => sampleOf(map, beat) / RATE;

describe('the boundaries of a pass', () => {
  it('reads each beat at the rate that lands the next anchor on its beat', () => {
    const pass = passOf(map, 128, 0);
    for (let i = 0; i + 1 < pass.boundaries.length; i++) {
      const a = pass.boundaries[i];
      const b = pass.boundaries[i + 1];
      expect((b.output - a.output) * a.rate).toBeCloseTo(b.input - a.input, 6);
    }
  });

  it('is a rate of one everywhere for an even map at its own tempo', () => {
    const even = evenBeats(RATE, LENGTH, 128, 0.25);
    const pass = passOf(even, 128, 0);
    for (const boundary of pass.boundaries) expect(boundary.rate).toBeCloseTo(1, 4);
    expect(straight(even, 128)).toBe(true);
    expect(straight(even, 127.9)).toBe(false);
    expect(straight(map, 128)).toBe(false);
  });

  it('is still straight with a detector’s scatter on the anchors, and not with a drummer’s', () => {
    const even = evenBeats(RATE, LENGTH, 128, 0.25);
    const scattered = { ...even, samples: even.samples.map((s, i) => s + ((i * 7919) % 5 - 2) * 40) };
    expect(straight(scattered, 128)).toBe(true);
    const played = { ...even, samples: even.samples.map((s, i) => s + ((i * 7919) % 5 - 2) * 400) };
    expect(straight(played, 128)).toBe(false);
  });

  it('plays twice as fast at twice the tempo', () => {
    const pass = passOf(evenBeats(RATE, LENGTH, 128, 0), 256, 0);
    expect(pass.boundaries[0].rate).toBeCloseTo(2, 6);
    expect(pass.length).toBeCloseTo(SECONDS / 2, 3);
  });

  it('starts mid-beat at that beat’s rate, with only the anchors ahead', () => {
    const from = seconds(230.5);
    const pass = passOf(map, 128, from);
    expect(pass.boundaries[0]).toMatchObject({ output: 0, input: from });
    expect(pass.boundaries[0].rate).toBeCloseTo(128 / 120, 3);
    expect(pass.boundaries[1].input).toBeCloseTo(seconds(231), 6);
  });

  it('lasts as long as the beats left take at the target tempo', () => {
    const pass = passOf(map, 120, 0);
    expect(pass.length).toBeCloseTo(((beatAt(map, LENGTH) - beatAt(map, 0)) * 60) / 120, 6);
  });
});

describe('where the sound is', () => {
  it('inverts the output time at every beat, before bar 1 and past the last anchor', () => {
    const startBeat = beatAt(map, 0);
    for (const beat of [startBeat, 0, 150.5, 400, 440]) {
      const elapsed = ((beat - startBeat) * 60) / 128;
      expect(sourceAt(map, 128, 0, elapsed, false)).toBeCloseTo(seconds(beat), 6);
    }
  });

  it('starts from where the pass started', () => {
    const from = seconds(230.5);
    expect(sourceAt(map, 128, from, 0, false)).toBeCloseTo(from, 9);
    expect(sourceAt(map, 128, from, 1, false)).toBeCloseTo(from + 128 / 120, 3);
  });

  it('loops back to the top of the file, in beats', () => {
    const from = seconds(230.5);
    const pass = passOf(map, 128, from);
    const wrapped = sourceAt(map, 128, from, pass.length + 1, true);
    expect(wrapped).toBeCloseTo(sourceAt(map, 128, 0, 1, false), 6);
    expect(wrapped).toBeGreaterThan(0);
    expect(wrapped).toBeLessThan(2);
  });

  it('holds at the end of the file when not looping', () => {
    const pass = passOf(map, 128, 100);
    expect(sourceAt(map, 128, 100, pass.length + 1, false)).toBe(SECONDS);
  });

  it('is never before the start, however early the clock reads', () => {
    expect(sourceAt(map, 128, 100, -0.2, true)).toBeCloseTo(100, 9);
  });
});
