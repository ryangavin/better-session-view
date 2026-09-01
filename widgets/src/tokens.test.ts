/**
 * The design-sync host file is a copy of the palette, and copies drift.
 *
 * `.design-sync/host.css` cannot import `palette.css`: it is read by an
 * external design tool that resolves no imports, so it has to state every
 * token itself (see `.design-sync/config.json`, `tokensGlob`). That makes it
 * the one duplicate in the suite we keep on purpose — and the one place a
 * palette change can silently fail to land.
 *
 * This is the net under it. It does not require the host file to list every
 * token; it requires that every token it *does* list still agrees with the
 * palette.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Every `--name: value;` at the top level of a stylesheet. */
function tokens(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    found.set(name, value.trim());
  }
  return found;
}

describe('design-sync host tokens', () => {
  const palette = tokens(read('./palette.css'));
  const host = tokens(read('../.design-sync/host.css'));

  it('states tokens the palette also defines', () => {
    const shared = [...host.keys()].filter((name) => palette.has(name));
    expect(shared.length).toBeGreaterThan(0);
  });

  it('agrees with the palette on every token it copies', () => {
    const drifted = [...host].filter(
      ([name, value]) => palette.has(name) && palette.get(name) !== value,
    );
    expect(drifted).toEqual([]);
  });
});
