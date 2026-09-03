/**
 * A colour token as the page resolves it, for a canvas.
 *
 * A canvas cannot read `var(--fg)`; it gets a string. Reading the token off
 * the element the canvas sits in means a harness drawn with these follows the
 * palette wherever it is mounted, instead of carrying hex literals that drift
 * the first time the palette moves.
 */
export function ink(el: Element | null, token: string, fallback: string): string {
  if (!el) return fallback;
  const got = getComputedStyle(el).getPropertyValue(token).trim();
  return got || fallback;
}

/** The debug module's own inks, each a palette token with the fallback tokens.css uses. */
export const INKS = {
  text: ['--wdg-text', '#b7b7be'],
  strong: ['--wdg-text-strong', '#ececed'],
  caption: ['--wdg-caption', '#5e5e66'],
  edge: ['--wdg-edge', '#2c2c31'],
  fill: ['--wdg-fill', '#f0b23c'],
  alarm: ['--wdg-alarm', '#ff8b8b'],
  well: ['--wdg-well', '#111113'],
  good: ['--green', '#5fbfa8'],
  cool: ['--blue', '#4da6d9'],
  other: ['--preview', '#b58fd6'],
} as const;

export type InkName = keyof typeof INKS;

/** A named ink resolved against an element. */
export const inkOf = (el: Element | null, name: InkName): string => ink(el, INKS[name][0], INKS[name][1]);
