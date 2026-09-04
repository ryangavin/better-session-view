
/**
 * One master reading of a stem, and a few progressively coarser copies of it.
 *
 * The lanes hold their peaks as an array of `{min, max}` — one small object per
 * column, seventy-two thousand of them per stem. Here they are one
 * `Float32Array` with min and max interleaved, because everything this file
 * does is arithmetic on indices: a level is the one below it folded in pairs, a
 * cell of level `k` covers `1 << k` cells of the master, and finding the cell a
 * column wants is a shift rather than a search.
 *
 * The point is what does *not* happen when the whole track is on screen. A lane
 * draws about two thousand columns however far out it is zoomed, but it reads
 * every column it is covering to do it — the whole master, at the widest view,
 * for every stem, on every frame. Reading a coarser copy instead costs the same
 * two thousand reads at any zoom, and the copies together weigh what the master
 * does, since halving twice over sums to the length it started from.
 *
 * Folded, never sampled. Taking every eighth column would lose the snare that
 * lived in the third; each level here is the widest excursion of the pair below
 * it, so a transient survives to the coarsest level there is. That is the whole
 * difference between a summary and a picture that has been thinned out.
 */

/**
 * One column of a drawing: how far the signal reached either side of zero.
 *
 * Declared here rather than imported, because this module is the library and
 * the app is the consumer — a widget that reached into `mix/` for a type would
 * be a widget only that app could use.
 */
export interface Peak {
  min: number;
  max: number;
}

/** Min and max interleaved: cell `i` is `[i * 2]` and `[i * 2 + 1]`. */
export type Steps = Float32Array;

/** How many cells a packed reading holds. */
export const cellsIn = (steps: Steps): number => steps.length >> 1;

/** The lanes' own array, packed. The one copy that is read from the audio. */
export function packedOf(peaks: readonly Peak[]): Steps {
  const out = new Float32Array(peaks.length * 2);
  for (let i = 0; i < peaks.length; i++) {
    out[i * 2] = peaks[i].min;
    out[i * 2 + 1] = peaks[i].max;
  }
  return out;
}

/** Two cells into one, taking the widest excursion of the pair. */
export function coarser(steps: Steps): Steps {
  const cells = cellsIn(steps) >> 1;
  const out = new Float32Array(cells * 2);
  for (let i = 0; i < cells; i++) {
    const a = i << 2;
    out[i * 2] = Math.min(steps[a], steps[a + 2]);
    out[i * 2 + 1] = Math.max(steps[a + 1], steps[a + 3]);
  }
  return out;
}

/**
 * The master and its halvings, coarsest last.
 *
 * It stops at `floor`, not at one: a level with fewer cells than a lane has
 * columns is a level nothing can be drawn from, so building it is work spent on
 * a copy no view will ever choose.
 */
export function levelsOf(master: Steps, floor = 512): readonly Steps[] {
  const levels: Steps[] = [master];
  while (cellsIn(levels[levels.length - 1]) > floor) {
    levels.push(coarser(levels[levels.length - 1]));
  }
  return levels;
}

/** A level, and where a window lands in it. */
export interface Chosen {
  level: number;
  steps: Steps;
  /** Cell indices in that level. */
  from: number;
  to: number;
}

/**
 * The coarsest level that still has a cell per column.
 *
 * Fold past that and columns start sharing a cell, which is a drawing being
 * stretched rather than summarised. The shifts are the whole trick: the window
 * is held as a fraction of the track, so the same two numbers land on every
 * level by moving the cell count, and nothing is searched for.
 */
export function levelFor(
  levels: readonly Steps[],
  from: number,
  to: number,
  columns: number,
): Chosen {
  let level = 0;
  while (level + 1 < levels.length) {
    const cells = cellsIn(levels[level + 1]);
    if (Math.ceil(to * cells) - Math.floor(from * cells) < columns) break;
    level++;
  }
  const steps = levels[level];
  const cells = cellsIn(steps);
  return {
    level,
    steps,
    from: Math.max(0, Math.floor(from * cells)),
    to: Math.min(cells, Math.ceil(to * cells)),
  };
}
