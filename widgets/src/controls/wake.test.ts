import { describe, expect, it } from 'vitest';
import { chase, WAKE_MARKS } from './wake.ts';

/** A display's rate, which is what a host actually hands a control. */
const FRAME = 1 / 60;

function settled(at: number): number[] {
  return new Array(WAKE_MARKS).fill(at);
}

/** Run the cascade for a while against a number that isn't moving any more. */
function until(marks: number[], head: number, frames: number): number[] {
  for (let n = 0; n < frames; n += 1) chase(marks, head, FRAME);
  return marks;
}

describe('the wake behind an arriving number', () => {
  it('stretches into a streak on a step and then collapses to a point', () => {
    const marks = chase(settled(0.2), 0.8, FRAME);
    // Every mark is between where the number was and where it is, in order —
    // which is the whole difference from three delayed samples of the source,
    // where a held signal puts them at three unrelated readings.
    expect(marks[0]).toBe(0.8);
    for (let k = 1; k < WAKE_MARKS; k += 1) {
      expect(marks[k]).toBeLessThan(marks[k - 1]);
      expect(marks[k]).toBeGreaterThanOrEqual(0.2);
    }

    const spread = marks[0] - marks[WAKE_MARKS - 1];
    expect(until(marks, 0.8, 60)[WAKE_MARKS - 1]).toBeCloseTo(0.8, 3);
    expect(marks[0] - marks[WAKE_MARKS - 1]).toBeLessThan(spread);
  });

  it('trails behind whichever way the number went', () => {
    const rising = chase(settled(0.5), 0.9, FRAME);
    expect(rising[WAKE_MARKS - 1]).toBeLessThan(rising[0]);

    const falling = chase(settled(0.5), 0.1, FRAME);
    expect(falling[WAKE_MARKS - 1]).toBeGreaterThan(falling[0]);
  });

  it('closes the whole trail at once when a frame was a long time coming', () => {
    // A tab that comes back from the background hands over a gap of seconds.
    // The caller clamps it to a tenth, and at that clamp the cascade must land
    // rather than overshoot — a mark that sailed past the head would draw a
    // trail in front of the number.
    const marks = chase(settled(0.2), 0.9, 0.1);
    for (const at of marks) expect(at).toBeCloseTo(0.9, 10);
  });

  it('leaves a still number alone', () => {
    expect(until(settled(0.42), 0.42, 30)).toEqual(settled(0.42));
  });
});
