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
