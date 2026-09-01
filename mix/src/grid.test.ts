import { describe, expect, it } from 'vitest';
import { LEAST, rankOf, ruleEvery, TICKS_PER_BAR } from './grid.ts';

/**
 * What this protects is a grid you can play to.
 *
 * The failure is not a crash and it is not even ugly — it is a ruler that puts
 * a line on three-and-a-bit beats, which reads as a grid and answers no
 * question anybody has. That happens the moment spacing is chosen by doubling a
 * pixel gap rather than by picking a musical division, and it is invisible in a
 * screenshot.
 */

/** A lane about 900px across, showing `bars` bars of it. */
const perTick = (bars: number, width = 900) => width / (bars * TICKS_PER_BAR);

describe('how fine the ruling gets', () => {
  it('rules in bars when a whole song is on screen', () => {
    // 128 bars across a lane: a beat line every 1.7px is a grey wash.
    expect(ruleEvery(perTick(128))).toBeGreaterThanOrEqual(TICKS_PER_BAR);
  });

  it('gives beats back when a few bars are on screen', () => {
    expect(ruleEvery(perTick(8))).toBe(TICKS_PER_BAR / 4);
  });

  it('is down to sixteenths by the time a couple of bars fill the lane', () => {
    expect(ruleEvery(perTick(2))).toBe(TICKS_PER_BAR / 16);
  });

  it('never spreads a division wider than the next rung down would be', () => {
    // Crossing at LEAST keeps every division between LEAST and four times it,
    // which is what stops the grid being briefly enormous between two zooms.
    // Only until the ladder bottoms out: past a sixty-fourth there is nothing
    // finer to hand over to, and the lines simply keep separating.
    for (let bars = 0.05; bars < 4000; bars *= 1.3) {
      const tick = perTick(bars);
      const step = ruleEvery(tick);
      if (step === 1) continue;
      expect(step * tick).toBeLessThan(LEAST * 4 + 0.001);
    }
  });

  it('goes to sixteenths and past them when one hit is on screen', () => {
    // The view a kick drum is judged in. Beats alone leave nothing to judge it
    // against, which is what this whole ladder exists for.
    expect(ruleEvery(perTick(1))).toBeLessThan(TICKS_PER_BAR / 4);
    expect(ruleEvery(perTick(0.25))).toBeLessThanOrEqual(TICKS_PER_BAR / 16);
  });

  it('never rules closer than a line can be seen', () => {
    for (const bars of [0.1, 0.25, 1, 4, 16, 64, 128, 900, 5000]) {
      expect(ruleEvery(perTick(bars)) * perTick(bars)).toBeGreaterThanOrEqual(LEAST);
    }
  });

  it('keeps thinning past the top of the ladder for a very long song', () => {
    // Twenty thousand bars is not a song, but a grid that quietly ruled every
    // pixel would be a frozen window rather than a wrong one.
    const tick = perTick(20000);
    expect(ruleEvery(tick) * tick).toBeGreaterThanOrEqual(LEAST);
  });

  it('only ever picks a division somebody could play', () => {
    // Every rung either divides a bar or is a whole number of them. This is the
    // property the whole file is for.
    for (let bars = 0.05; bars < 4000; bars *= 1.3) {
      const step = ruleEvery(perTick(bars));
      const musical = step >= TICKS_PER_BAR ? step % TICKS_PER_BAR === 0 : TICKS_PER_BAR % step === 0;
      expect(musical).toBe(true);
    }
  });

  it('gets finer as the view gets closer, never coarser', () => {
    let last = Infinity;
    for (const bars of [512, 128, 32, 8, 2, 0.5, 0.125]) {
      const step = ruleEvery(perTick(bars));
      expect(step).toBeLessThanOrEqual(last);
      last = step;
    }
  });
});

describe('what a line is', () => {
  it('knows a bar, a beat and what is under them', () => {
    expect(rankOf(0)).toBe('phrase');
    expect(rankOf(TICKS_PER_BAR)).toBe('bar');
    expect(rankOf(TICKS_PER_BAR * 4)).toBe('phrase');
    expect(rankOf(TICKS_PER_BAR / 4)).toBe('beat');
    expect(rankOf(TICKS_PER_BAR / 8)).toBe('sub');
    expect(rankOf(TICKS_PER_BAR / 64)).toBe('sub');
  });

  it('says the same thing about a line at every zoom', () => {
    // Ranked by what a line *is*, not by where it falls in whatever step is
    // being drawn — so the hierarchy holds still while the grid thins around
    // it, and bar 4 does not turn into a beat because the view moved.
    const bar4 = TICKS_PER_BAR * 4;
    expect(rankOf(bar4)).toBe('phrase');
    expect(rankOf(bar4 + TICKS_PER_BAR)).toBe('bar');
    expect(rankOf(bar4 + TICKS_PER_BAR / 4)).toBe('beat');
  });

  it('classifies the time before the song starts the same way', () => {
    // Zoomed out past the track, bars count backwards through zero, and a bar
    // line out there is still a bar line.
    expect(rankOf(-TICKS_PER_BAR)).toBe('bar');
    expect(rankOf(-TICKS_PER_BAR * 4)).toBe('phrase');
    expect(rankOf(-TICKS_PER_BAR / 4)).toBe('beat');
    expect(rankOf(-TICKS_PER_BAR / 8)).toBe('sub');
  });
});
