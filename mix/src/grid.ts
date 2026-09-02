/**
 * How finely the grid is ruled at a given width, and what each line means.
 *
 * The lanes used to rule in bars and nothing else, which is right at the width
 * of a song and useless the moment you are looking at one hit: a kick sitting a
 * few milliseconds off is a question about *beats*, and there was no beat to
 * see it against. Zoomed the other way the answer is not more lines but fewer,
 * because a line every three pixels is not a grid, it is a fill.
 *
 * So the spacing is chosen from a ladder rather than computed. Every rung is a
 * musical division — sixteen bars down to a sixty-fourth note — so whichever
 * one survives at a given zoom, the lines that are drawn are lines somebody
 * could play to. Doubling a pixel gap instead would put lines on
 * three-and-a-bit beats, which is a ruler for nothing.
 *
 * Both the lanes and the warp lane rule against this, so they cannot disagree
 * about where a beat is; what each does with a line — how bright, how tall — is
 * its own business, which is why this hands back a *rank* rather than a colour.
 */

/**
 * The resolution everything here counts in: a sixty-fourth note, in 4/4.
 *
 * An integer count rather than fractions of a bar, so `%` stays exact. The
 * whole classification below is divisibility, and a grid that decides a line is
 * *nearly* on a beat is a grid that draws two lines a pixel apart.
 */
export const TICKS_PER_BAR = 64;

/** What a line is, coarsest to finest. */
export type Rank = 'phrase' | 'bar' | 'beat' | 'sub';

/**
 * The rungs, in ticks: sixteen bars, four bars, a bar, a beat, an eighth, a
 * sixteenth, a thirty-second, a sixty-fourth.
 */
const LADDER = [1024, 256, 64, 16, 8, 4, 2, 1];

/**
 * The least a line may be from its neighbour, in px, before the grid thins.
 *
 * Sixteen, which is chosen for how the ladder *lands* rather than for how thin
 * a line is. The rungs are quarters of each other above a beat and halves below
 * it, so crossing at sixteen keeps every division between sixteen and sixty-four
 * pixels apart for the whole of its life — a grid you read the shape of rather
 * than count. Four, which is what the bar ruling used when there was nothing
 * under it, puts sixteenths seven pixels apart at the far end of their range:
 * legible for bars, and a wash for anything finer.
 */
export const LEAST = 16;

/**
 * How far apart to rule, in ticks, given how many pixels a tick is worth.
 *
 * The finest rung that is not crowded — so zooming in gives beats back, then
 * eighths, then sixteenths, each one appearing at the point there is room to
 * see it rather than at a zoom level somebody nominated.
 */
export const ruleEvery = (perTick: number, least: number = LEAST): number => {
  for (let i = LADDER.length - 1; i >= 0; i--) {
    if (LADDER[i] * perTick >= least) return LADDER[i];
  }
  // A song long enough that even sixteen bars are crowded. Quadrupling from the
  // top of the ladder keeps every surviving line on a phrase boundary.
  let step = LADDER[0];
  while (step * perTick < least && step < Number.MAX_SAFE_INTEGER / 4) step *= 4;
  return step;
};

/**
 * What the line at this tick is.
 *
 * By what it *is* rather than by where it falls in whatever step is being
 * drawn. A bar line is a bar line at every zoom, so the hierarchy holds still
 * while the grid thins around it — and negative ticks, which is the time before
 * the song starts, classify the same way.
 */
export const rankOf = (tick: number): Rank => {
  if (tick % (TICKS_PER_BAR * 4) === 0) return 'phrase';
  if (tick % TICKS_PER_BAR === 0) return 'bar';
  if (tick % (TICKS_PER_BAR / 4) === 0) return 'beat';
  return 'sub';
};

/**
 * How wide a block of shading is, in ticks, for a grid ruled every `step`.
 *
 * The staggering is what gives the lanes a shape you can read without counting
 * lines — every other cell between the dividers is lifted, so a phrase is a
 * block rather than a gap between two brighter lines. A bar is the floor
 * because the ruling subdivides and the shading must not: alternating
 * sixty-fourths is a zebra, and by the time you are that far in the bar is
 * what you are trying to see the hit against.
 */
export const shadeEvery = (step: number): number => Math.max(step, TICKS_PER_BAR);

/**
 * Whether the block beginning at this tick is the lifted one of the pair.
 *
 * Counted in absolute ticks like everything else here, so which blocks are lit
 * does not change as the view moves under them — and it keeps alternating
 * through the time before bar 1, where the tick is negative.
 */
export const shaded = (tick: number, every: number): boolean =>
  Math.floor(tick / every) % 2 !== 0;

/** How a span of bars is ruled at the width it is drawn at. */
export interface Ruling {
  /** Ticks between lines. */
  step: number;
  /** The first line to draw, snapped down to the step, and the last. In ticks. */
  first: number;
  last: number;
  /** Ticks per block of shading, and the tick the first block starts on. */
  shade: number;
  block: number;
}

/**
 * The ruling for the bars on screen, measured against the width they have.
 *
 * Against the *visible* span rather than the whole file. That is the same
 * number while the tempo is one straight line and stops being the same the
 * moment it is not: a slow section takes more pixels per bar than a fast one,
 * and the ladder should answer for the bars it is actually drawing. The first
 * line is snapped down to the step so which lines are bright does not change
 * as the view moves under them, and neither end is clamped to the song —
 * zoomed out there is time on screen that is not in it, and the grid carries
 * on through.
 */
export const rulingOf = (barFrom: number, barTo: number, width: number): Ruling => {
  const step = ruleEvery(width / ((barTo - barFrom) * TICKS_PER_BAR));
  const shade = shadeEvery(step);
  return {
    step,
    first: Math.floor((barFrom * TICKS_PER_BAR) / step) * step,
    last: Math.ceil(barTo * TICKS_PER_BAR),
    shade,
    block: Math.floor((barFrom * TICKS_PER_BAR) / shade) * shade,
  };
};
