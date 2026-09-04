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

  return { topX, topY, lowX, lowY, points: count, level: chosen.level, read: span };
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
