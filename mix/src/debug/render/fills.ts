import { edgeInk } from './outline.ts';

/**
 * How a silhouette is painted, kept apart from how it is built.
 *
 * The shape is settled — a closed path off a detail ladder — and everything
 * here is a decision about how it should look, which is a different argument on
 * a different timetable. Keeping them in separate files is what lets a restyle
 * happen without anybody re-reading the geometry, and lets the geometry change
 * without a style having to be re-agreed.
 *
 * Every one of these takes the same path and the same one colour. A stem's tint
 * already means something in this window, so a treatment that invented its own
 * palette would be drawing a different track from the one the lanes draw.
 */

export type FillStyle = 'solid' | 'ramp' | 'glass' | 'lasagna';

export const FILLS: readonly FillStyle[] = ['solid', 'ramp', 'glass', 'lasagna'];

/**
 * The hue of a stem's own colour, so a treatment can shift around it.
 *
 * Reads `#rgb` and `#rrggbb`, which is what the palette is written in, and says
 * so by falling back rather than by throwing: a colour that arrives as `rgb()`
 * one day should make a drawing look ordinary, not make it disappear.
 */
export function hueOf(css: string, fallback = 210): number {
  const hex = css.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (full.length !== 6 || !/^[0-9a-f]{6}$/i.test(full)) return fallback;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const span = high - low;
  if (!span) return fallback;
  const at =
    high === r ? (g - b) / span + (g < b ? 6 : 0) : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return (at * 60) % 360;
}

interface Ask {
  path: Path2D;
  view: { width: number; height: number };
  tint: string;
  /** Points per pixel, which decides how loud the edge is allowed to be. */
  density: number;
}

/** The lanes as they are drawn today: one flat colour, no edge on it. */
function solid(g: CanvasRenderingContext2D, { path, tint }: Ask): void {
  g.fillStyle = tint;
  g.fill(path);
}

/** A ramp down the height, which is the thing a comb of columns cannot do. */
function ramp(g: CanvasRenderingContext2D, { path, view, tint }: Ask): void {
  const down = g.createLinearGradient(0, 0, 0, view.height);
  down.addColorStop(0, tint);
  down.addColorStop(0.5, `${tint}44`);
  down.addColorStop(1, tint);
  g.fillStyle = down;
  g.fill(path);
}

/** Bright where the shape is thin, clear through the middle. */
function glass(g: CanvasRenderingContext2D, { path, view, tint }: Ask): void {
  const down = g.createLinearGradient(0, 0, 0, view.height);
  down.addColorStop(0, `${tint}dd`);
  down.addColorStop(0.35, `${tint}33`);
  down.addColorStop(0.5, `${tint}18`);
  down.addColorStop(0.65, `${tint}33`);
  down.addColorStop(1, `${tint}dd`);
  g.fillStyle = down;
  g.fill(path);
}

/**
 * Disco Lasagna, off the waveform lab, onto a silhouette.
 *
 * What that drawing is, stripped of how it got there: hue names the source, a
 * hot core says how loud it is, and layers inside the body separate as bands
 * rather than blurring into one ribbon. It reads as the opposite of `glass` —
 * luminous down the middle where glass is clear.
 *
 * The layers come free here. Scaling the same path towards the centre line and
 * stroking it again gives contours that follow the sound exactly, which the
 * original had to walk the samples three more times to draw.
 */
function lasagna(g: CanvasRenderingContext2D, { path, view, tint, density }: Ask): void {
  const hue = hueOf(tint);
  const middle = view.height / 2;

  const body = g.createLinearGradient(0, 0, 0, view.height);
  body.addColorStop(0, `hsl(${hue}, 72%, 26%)`);
  body.addColorStop(0.34, `hsl(${hue + 14}, 88%, 44%)`);
  body.addColorStop(0.5, `hsl(${hue + 30}, 100%, 72%)`);
  body.addColorStop(0.66, `hsl(${hue + 14}, 88%, 44%)`);
  body.addColorStop(1, `hsl(${hue}, 72%, 26%)`);
  g.fillStyle = body;
  g.fill(path);

  // The layers, from the one shape: each is the silhouette drawn shorter.
  for (const share of [0.72, 0.46, 0.22]) {
    g.save();
    g.translate(0, middle);
    g.scale(1, share);
    g.translate(0, -middle);
    g.strokeStyle = `hsla(${hue + 48}, 100%, 84%, 0.22)`;
    g.lineWidth = 1 / share;
    g.stroke(path);
    g.restore();
  }

  g.save();
  g.globalAlpha = edgeInk(density);
  g.strokeStyle = `hsla(${hue + 28}, 100%, 78%, 0.85)`;
  g.shadowBlur = 7;
  g.shadowColor = `hsl(${hue}, 90%, 58%)`;
  g.lineWidth = 1.25;
  g.stroke(path);
  g.restore();
}

/** Paint the silhouette in one of the treatments, edge included. */
export function paintShape(g: CanvasRenderingContext2D, style: FillStyle, ask: Ask): void {
  if (style === 'lasagna') return lasagna(g, ask);
  if (style === 'solid') return solid(g, ask);
  (style === 'glass' ? glass : ramp)(g, ask);
  // Everything but `solid` closes with an edge, at the weight the density earns.
  g.save();
  g.globalAlpha = edgeInk(ask.density);
  g.strokeStyle = ask.tint;
  g.lineWidth = style === 'glass' ? 1.25 : 1;
  g.stroke(ask.path);
  g.restore();
}
