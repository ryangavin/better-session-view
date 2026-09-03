/**
 * One window onto a length of time, and the arithmetic of moving it.
 *
 * Every row of a `Scope` reads the same `View`: a span in seconds and the
 * pixel width it is drawn across. Nothing here touches the DOM, so the moves —
 * zoom about a point, pan by a share of the width, clamp to the whole — are
 * tested on their own and the hook that owns the state stays thin.
 */
export interface View {
  from: number;
  to: number;
  width: number;
  height: number;
}

export interface Window {
  from: number;
  to: number;
}

export interface Span {
  from: number;
  to: number;
}

export const spanOf = (w: Window): number => w.to - w.from;

/** The pixel of a second. */
export const xOf = (v: View, t: number): number => ((t - v.from) / (v.to - v.from)) * v.width;

/** The second of a pixel. */
export const timeOf = (v: View, x: number): number => v.from + (x / v.width) * (v.to - v.from);

/**
 * A window kept inside the whole, never narrower than `narrowest` and never
 * wider than the whole. A window wider than the whole starts at zero rather
 * than centring, so the left edge of the ruler is the start of the sound.
 */
export function clamped(w: Window, seconds: number, narrowest: number): Window {
  const span = Math.min(Math.max(spanOf(w), narrowest), Math.max(seconds, narrowest));
  let from = Math.min(Math.max(w.from, 0), Math.max(0, seconds - span));
  if (span >= seconds) from = 0;
  return { from, to: from + span };
}

/** The window scaled by `factor` about the second at `share` of its width. */
export function zoomed(w: Window, factor: number, share: number): Window {
  const at = w.from + share * spanOf(w);
  const span = spanOf(w) * factor;
  return { from: at - share * span, to: at + (1 - share) * span };
}

export const panned = (w: Window, by: number): Window => ({ from: w.from + by, to: w.to + by });

/** A window over a span with some room either side, for a loop or a selection. */
export function around(span: Span, margin = 0.1): Window {
  const pad = spanOf(span) * margin;
  return { from: span.from - pad, to: span.to + pad };
}

/** `m:ss.mmm`, for a readout that stays the same width as it counts. */
export function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(3).padStart(6, '0')}`;
}
