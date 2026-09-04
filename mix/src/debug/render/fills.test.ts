import { describe, expect, it } from 'vitest';
import { FILLS, hueOf } from './fills.ts';

// Only the colour arithmetic is testable here; what a treatment looks like is a
// judgement, and the lab exists to make that judgement with your eyes. What can
// be pinned is that a stem's own colour is what every treatment is built around,
// because a style that invented a palette would draw a different track from the
// one the lanes draw.

describe('reading a stem’s hue', () => {
  it('finds the hue of the palette’s own colours', () => {
    expect(hueOf('#ff0000')).toBeCloseTo(0, 0);
    expect(hueOf('#00ff00')).toBeCloseTo(120, 0);
    expect(hueOf('#0000ff')).toBeCloseTo(240, 0);
  });

  it('takes the short form the palette also writes', () => {
    expect(hueOf('#f00')).toBeCloseTo(hueOf('#ff0000'), 0);
  });

  it('falls back rather than throwing on anything else', () => {
    // A colour that arrives as `rgb()` one day should make a drawing look
    // ordinary, not make it vanish.
    for (const odd of ['rgb(1,2,3)', 'var(--stem-drums)', '', 'nonsense', '#12']) {
      expect(hueOf(odd, 210)).toBe(210);
    }
  });

  it('falls back for a grey, which has no hue to find', () => {
    expect(hueOf('#808080', 42)).toBe(42);
  });
});

describe('the treatments on offer', () => {
  it('leads with the one the lanes already use', () => {
    // `solid` is the current timeline, so the lab opens on a fair comparison
    // rather than on a flattering one.
    expect(FILLS[0]).toBe('solid');
    expect(FILLS).toContain('lasagna');
  });
});
