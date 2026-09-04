import { describe, expect, it } from 'vitest';
import { LEAST, rankOf, ruleEvery, rulingOf, shadeEvery, shaded, SNAP_TICKS, stepFor, TICKS_PER_BAR } from './grid.ts';

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

describe('the staggered shading', () => {
  it('never subdivides past a bar, however fine the ruling gets', () => {
    // The ruling thins and thickens with the zoom; the shading only ever
    // coarsens. Alternating sixty-fourths is a zebra, not a grid.
    expect(shadeEvery(TICKS_PER_BAR / 64)).toBe(TICKS_PER_BAR);
    expect(shadeEvery(TICKS_PER_BAR / 4)).toBe(TICKS_PER_BAR);
    expect(shadeEvery(TICKS_PER_BAR)).toBe(TICKS_PER_BAR);
    expect(shadeEvery(TICKS_PER_BAR * 16)).toBe(TICKS_PER_BAR * 16);
  });

  it('alternates, and keeps alternating through bar 1', () => {
    // Counted in absolute ticks, so which blocks are lit does not change as
    // the view moves under them — and the time before the song starts is
    // ruled and shaded like any other.
    const bar = TICKS_PER_BAR;
    expect(shaded(0, bar)).toBe(false);
    expect(shaded(bar, bar)).toBe(true);
    expect(shaded(bar * 2, bar)).toBe(false);
    expect(shaded(-bar, bar)).toBe(true);
    expect(shaded(-bar * 2, bar)).toBe(false);
  });
});

describe('ruling a span of bars', () => {
  /**
   * What the lanes used to work out inline, for a straight grid: the file
   * holds `across` bars from `origin`, and the view shows `from` to `to` of it
   * across `width` pixels.
   */
  const inline = (origin: number, across: number, from: number, to: number, width: number) => {
    const ticks = across * TICKS_PER_BAR;
    const start = origin * TICKS_PER_BAR;
    const step = ruleEvery(width / (to - from) / ticks);
    const shade = shadeEvery(step);
    return {
      step,
      first: Math.floor((from * ticks + start) / step) * step,
      last: Math.ceil(to * ticks + start),
      shade,
      block: Math.floor((from * ticks + start) / shade) * shade,
    };
  };

  it.each([
    [0, 1],
    [0.25, 0.375],
    [-0.5, 1.5],
  ])('rules a straight grid exactly as the lanes did, from %f to %f', (from, to) => {
    // The ruling is measured against the bars on screen, which for one
    // straight line is the same arithmetic the lanes carried inline — and the
    // old arithmetic is the fixture, so nothing about where a line falls has
    // moved. Negative bars are the time before the song, ruled like any other.
    const origin = -0.5;
    const across = 127.5;
    const barAt = (place: number) => origin + place * across;
    expect(rulingOf(barAt(from), barAt(to), 900)).toEqual(inline(origin, across, from, to, 900));
  });

  it('rules finer where the bars on screen are fewer', () => {
    // A slow section holds fewer bars in the same width than a fast one, and
    // the ladder should answer for the bars it is drawing.
    expect(rulingOf(0, 8, 900).step).toBeLessThan(rulingOf(0, 32, 900).step);
  });

  it('starts the first line on the step so the bright lines hold still', () => {
    const ruling = rulingOf(2.3, 10, 900);
    expect(ruling.first % ruling.step).toBe(0);
    expect(ruling.first).toBeLessThanOrEqual(2.3 * TICKS_PER_BAR);
    expect(ruling.block % ruling.shade).toBe(0);
  });
});

/**
 * A snap is a decision about how long a loop is; the ruling is a fact about
 * the zoom. Which of the two wins is the whole of this.
 */
describe('stepFor', () => {
  it('takes the ruling when nothing has been asked for', () => {
    expect(stepFor('grid', 16)).toBe(16);
    expect(stepFor('grid', 256)).toBe(256);
  });

  it('holds a cut to what was asked for however far in the view is', () => {
    // Zoomed to sixteenths, a loop asked for in bars is still bars.
    expect(stepFor('bar', 4)).toBe(TICKS_PER_BAR);
    expect(stepFor('phrase', 4)).toBe(4 * TICKS_PER_BAR);
  });

  it('holds it there when the view is too far out to have drawn it', () => {
    // The grid is on sixteen-bar lines and beats were asked for: a cut lands
    // on a beat, whether or not a beat is drawn.
    expect(stepFor('beat', 1024)).toBe(TICKS_PER_BAR / 4);
  });

  it('is a rung of the ladder every time, so a cut lands on a line', () => {
    for (const ticks of Object.values(SNAP_TICKS)) {
      if (ticks === null) continue;
      expect(TICKS_PER_BAR % ticks === 0 || ticks % TICKS_PER_BAR === 0).toBe(true);
    }
  });
});

