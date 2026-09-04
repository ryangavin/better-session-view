import { cellsIn, levelFor, type Chosen, type Steps } from './levels.ts';

/**
 * A stem as one closed shape, rather than as two thousand little bars.
 *
 * The lanes draw a column per half-pixel and fill each one, which is honest and
 * looks it: at any width the drawing is a comb, and the fine hair along the top
 * is the loudest sample of a twentieth of a second standing at full height
 * beside its neighbours. Zoomed out that detail is not telling anybody
 * anything — it is the difference between two arbitrary slices of a snare — and
 * it is the reason the drawing reads as pixels rather than as a shape.
 *
 * So: walk the top edge left to right, walk the bottom edge back, close it.
 * One path, one fill, and a silhouette that can take a gradient across its
 * height or a stroke along its edge, neither of which means anything to a comb
 * of separate rectangles.
 *
 * The curve is the other half. Straight segments between summarised points show
 * every place the summary changed its mind; a curve through them says the same
 * thing about the sound and stops claiming the corners are real. `smooth` is
 * how much of that to apply, and at zero this emits the polyline, which is
 * useful for seeing what the smoothing is doing rather than guessing.
 */

/**
 * The two edges, before anything canvas-shaped touches them.
 *
 * Split from the path because everything worth arguing about is here — which
 * rung was read, how many points came out, where they sit — and `Path2D` does
 * not exist outside a browser. Kept as flat arrays rather than points: the
 * curve walks them four at a time and an array of little objects is the same
 * shape of waste the lanes' `{min, max}` columns are.
 */
export interface Edges {
  topX: Float32Array;
  topY: Float32Array;
  lowX: Float32Array;
  lowY: Float32Array;
  points: number;
  level: number;
  read: number;
}

export interface Shape {
  path: Path2D;
  /** How many points each edge was built from — the drawing's real detail. */
  points: number;
  /** Which rung of the ladder it was read from. */
  level: number;
  /** Cells read to build it, which is the work the ladder is there to bound. */
  read: number;
}

export interface OutlineAsk {
  /** Fractions of the whole track. */
  from: number;
  to: number;
  width: number;
  height: number;
  /** Points per CSS pixel along the edge. Below one is deliberate coarseness. */
  density: number;
  /** 0 is the polyline; 1 is a full Catmull-Rom through every point. */
  smooth: number;
  /** How much of the half-height the loudest point is allowed to reach. */
  headroom: number;
  /**
   * The least a shape may be, in pixels. One by default, and it is not a
   * nicety.
   *
   * A silhouette whose edges meet encloses nothing, and a fill of nothing is
   * invisible — so silence drew as a gap rather than as a line, and zoomed far
   * enough in that every point covers a single sample the whole waveform
   * vanished, because a sample's own min and max are the same number. The lanes
   * never had the fault: their columns clamp to a pixel.
   */
  thinnest?: number;
}

/** Hold two edges apart about their own middle, so the shape stays on the sound. */
const apart = (top: Float32Array, low: Float32Array, count: number, least: number): void => {
  for (let i = 0; i < count; i++) {
    const gap = low[i] - top[i];
    if (gap >= least) continue;
    const middle = (top[i] + low[i]) / 2;
    top[i] = middle - least / 2;
    low[i] = middle + least / 2;
  }
};

/**
 * How fine to draw, given how much of the track is on screen.
 *
 * The two ends want opposite things and a single number cannot serve both. With
 * the whole track across a lane, a point per pixel is drawing the loudest
 * sample of a twentieth of a second at full height next to its neighbour, over
 * and over — the hair along the top that says nothing except that the summary
 * moved. A quarter of that reads as the shape of the arrangement, which is what
 * a wide view is for. Zoomed into a bar, the opposite: every point is nearly a
 * sample, and coarseness there is throwing away the thing being looked at.
 *
 * So it rides the zoom. The exponent is gentle on purpose — detail arrives as
 * you go in rather than snapping at a threshold, because a drawing that changes
 * character in one wheel click looks like a bug even when it is a policy.
 */
export function densityFor(share: number): number {
  if (!(share > 0)) return 2;
  return Math.min(2, Math.max(0.25, 0.25 * Math.pow(1 / share, 0.45)));
}

/**
 * How strongly to draw the edge, given how fine the drawing is.
 *
 * A stroke's ink is its *perimeter*, and perimeter climbs with the point count
 * while the area it encloses does not. So the same line width that reads as a
 * clean edge across a whole track reads as a hard bright rim once every point
 * is a wiggle — the border looks like it grew, and nothing about it changed.
 *
 * Falling with the root of the density keeps roughly the same amount of ink on
 * the edge at any zoom. Wide and smooth, the outline is most of what says where
 * the shape is and it stays strong; fine and busy, it steps back and lets the
 * fill carry it.
 */
export function edgeInk(density: number): number {
  if (!(density > 0)) return 0.9;
  return Math.min(0.9, Math.max(0.3, 0.45 / Math.sqrt(density)));
}

/**
 * Catmull-Rom, as the two control points of a cubic.
 *
 * The tangent at a point is the line between its neighbours, which is what
 * makes the curve pass *through* every point rather than near them — a
 * waveform that rounded off its own peaks would be drawing a quieter record
 * than the one on disk. `smooth` scales the tangent, so zero leaves the control
 * points on the ends and the cubic collapses to the straight segment.
 */
const through = (
  path: Path2D,
  xs: Float32Array,
  ys: Float32Array,
  count: number,
  smooth: number,
): void => {
  for (let i = 0; i < count - 1; i++) {
    const x0 = xs[i > 0 ? i - 1 : 0];
    const y0 = ys[i > 0 ? i - 1 : 0];
    const x1 = xs[i];
    const y1 = ys[i];
    const x2 = xs[i + 1];
    const y2 = ys[i + 1];
    const x3 = xs[i + 2 < count ? i + 2 : count - 1];
    const y3 = ys[i + 2 < count ? i + 2 : count - 1];
    const k = smooth / 6;
    path.bezierCurveTo(
      x1 + (x2 - x0) * k,
      y1 + (y2 - y0) * k,
      x2 - (x3 - x1) * k,
      y2 - (y3 - y1) * k,
      x2,
      y2,
    );
  }
};

/** The chosen rung, folded down to the points the two edges are drawn from. */
export function edgesOf(levels: readonly Steps[], ask: OutlineAsk): Edges {
  const { from, to, width, height, density, headroom } = ask;
  const wanted = Math.max(2, Math.round(width * density));
  const chosen: Chosen = levelFor(levels, from, to, wanted);
  const { steps } = chosen;
  const span = Math.max(1, chosen.to - chosen.from);
  const count = Math.min(wanted, span);
  const cells = cellsIn(steps);

  const middle = height / 2;
  const reach = middle * headroom;
  const topX = new Float32Array(count);
  const topY = new Float32Array(count);
  const lowX = new Float32Array(count);
  const lowY = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const a = chosen.from + Math.floor((i * span) / count);
    const b = Math.max(a + 1, chosen.from + Math.floor(((i + 1) * span) / count));
    let low = 0;
    let high = 0;
    for (let c = a; c < b; c++) {
      const min = steps[c * 2];
      const max = steps[c * 2 + 1];
      if (min < low) low = min;
      if (max > high) high = max;
    }
    // The middle of the cell, not its edge: a point drawn at the boundary of
    // what it summarises is half a cell out of step with the sound.
    const at = ((a + b) / 2 / cells - from) / (to - from);
    const x = at * width;
    topX[i] = x;
    topY[i] = middle - high * reach;
    lowX[i] = x;
    lowY[i] = middle - low * reach;
  }

  apart(topY, lowY, count, ask.thinnest ?? 1);
  return { topX, topY, lowX, lowY, points: count, level: chosen.level, read: span };
}

/**
 * The same two edges, read from the audio instead of from a summary of it.
 *
 * The ladder runs out. Its master is a reading of the whole track at a fixed
 * count, so a cell of it covers milliseconds; zoom past that and every rung is
 * a drawing being enlarged, which is what made a kick stop looking like a kick.
 * A person who has spent years in these programs knows the shape of an attack,
 * and a stretched envelope is not it.
 *
 * So below the handover this reads the samples, exactly as the lanes do —
 * folding channels by widest excursion, the way `peaksOf` folds them — and
 * hands back the same `Edges`, so the curve and the fill do not know which side
 * of the handover they are drawing.
 */
export function samplesFrom(
  channels: readonly Float32Array[],
  ask: OutlineAsk & { length: number },
): Edges {
  const { from, to, width, height, density, headroom, length } = ask;
  const first = Math.max(0, Math.floor(from * length));
  const last = Math.min(length, Math.ceil(to * length));
  const span = Math.max(1, last - first);
  const count = Math.max(2, Math.min(Math.round(width * density), span));

  const middle = height / 2;
  const reach = middle * headroom;
  const topX = new Float32Array(count);
  const topY = new Float32Array(count);
  const lowX = new Float32Array(count);
  const lowY = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const a = first + Math.floor((i * span) / count);
    const b = Math.max(a + 1, first + Math.floor(((i + 1) * span) / count));
    let low = 0;
    let high = 0;
    for (const channel of channels) {
      for (let sample = a; sample < b; sample++) {
        const value = channel[sample];
        if (value < low) low = value;
        else if (value > high) high = value;
      }
    }
    const at = ((a + b) / 2 / length - from) / (to - from);
    const x = at * width;
    topX[i] = x;
    topY[i] = middle - high * reach;
    lowX[i] = x;
    lowY[i] = middle - low * reach;
  }
  apart(topY, lowY, count, ask.thinnest ?? 1);
  return { topX, topY, lowX, lowY, points: count, level: -1, read: span };
}

/** The edges as one closed silhouette: along the top, back along the bottom. */
export function pathOf(edges: Edges, smooth: number): Path2D {
  const { topX, topY, lowX, lowY, points } = edges;
  const path = new Path2D();
  path.moveTo(topX[0], topY[0]);
  through(path, topX, topY, points, smooth);
  path.lineTo(lowX[points - 1], lowY[points - 1]);
  const backX = new Float32Array(points);
  const backY = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    backX[i] = lowX[points - 1 - i];
    backY[i] = lowY[points - 1 - i];
  }
  through(path, backX, backY, points, smooth);
  path.closePath();
  return path;
}

/** Both halves, for a caller that has a canvas and wants the shape. */
export function outlineOf(levels: readonly Steps[], ask: OutlineAsk): Shape {
  const edges = edgesOf(levels, ask);
  return { path: pathOf(edges, ask.smooth), points: edges.points, level: edges.level, read: edges.read };
}
