import { describe, expect, it } from 'vitest';
import { gainOf, REST, type Level } from './engine.ts';

/**
 * The mixer's whole rule, and the reason it is a function rather than four
 * lines inside the graph: the lane's drawing asks the same question the gain
 * does, and if they were two implementations a soloed stem could be drawn lit
 * and played silent.
 */

const FOUR = ['vocals', 'drums', 'bass', 'other'];

const mix = (over: Record<string, Partial<Level>> = {}): Record<string, Level> =>
  Object.fromEntries(FOUR.map((id) => [id, { ...REST, ...over[id] }]));

describe('what a stem comes to', () => {
  it('is unity where the fader rests, not a couple of dB under it', () => {
    expect(gainOf('vocals', mix(), FOUR)).toBeCloseTo(1, 5);
  });

  it('is silence for a muted stem', () => {
    expect(gainOf('vocals', mix({ vocals: { muted: true } }), FOUR)).toBe(0);
  });

  it('is silence for everything unsoloed once anything is soloed', () => {
    const levels = mix({ drums: { soloed: true } });
    expect(gainOf('drums', levels, FOUR)).toBeGreaterThan(0);
    expect(gainOf('vocals', levels, FOUR)).toBe(0);
  });

  it('plays every soloed stem, not only the last one pressed', () => {
    const levels = mix({ drums: { soloed: true }, bass: { soloed: true } });
    expect(gainOf('drums', levels, FOUR)).toBeGreaterThan(0);
    expect(gainOf('bass', levels, FOUR)).toBeGreaterThan(0);
    expect(gainOf('other', levels, FOUR)).toBe(0);
  });

  it("lets solo win over that stem's own mute", () => {
    // Live's rule, and the only one that behaves when you hold both down: a
    // soloed stem is audible, and the mute is what it goes back to.
    const levels = mix({ vocals: { soloed: true, muted: true } });
    expect(gainOf('vocals', levels, FOUR)).toBeGreaterThan(0);
  });

  it('goes back to the mutes when the last solo is released', () => {
    const levels = mix({ vocals: { muted: true } });
    expect(gainOf('vocals', levels, FOUR)).toBe(0);
    expect(gainOf('drums', levels, FOUR)).toBeGreaterThan(0);
  });

  it('is silence at the bottom of the fader and loudest at the top', () => {
    expect(gainOf('vocals', mix({ vocals: { volume: 0 } }), FOUR)).toBe(0);
    expect(gainOf('vocals', mix({ vocals: { volume: 1 } }), FOUR)).toBeGreaterThan(1);
  });

  it('rises faster at the top than at the bottom, like a fader', () => {
    // A linear fader spends most of its travel in the top few decibels and
    // feels dead for the first half.
    const low = gainOf('vocals', mix({ vocals: { volume: 0.2 } }), FOUR);
    const mid = gainOf('vocals', mix({ vocals: { volume: 0.4 } }), FOUR);
    const high = gainOf('vocals', mix({ vocals: { volume: 0.8 } }), FOUR);
    expect(mid - low).toBeLessThan(high - mid);
  });

  it('is silence for a stem the model never produced', () => {
    // A four-source model has no piano, and asking for one must not throw in
    // the middle of an audio callback.
    expect(gainOf('piano', mix(), FOUR)).toBe(0);
  });

  it('ignores a solo on a stem this model does not have', () => {
    // A library row remembered from a six-source separation, reopened after a
    // four-source one: the piano's soloed flag is still in the store, and it
    // must not silence the four stems that do exist.
    const levels = { ...mix(), piano: { ...REST, soloed: true } };
    expect(gainOf('vocals', levels, FOUR)).toBeGreaterThan(0);
  });
});
