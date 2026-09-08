import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, PRESETS, STEM_ROLES, editRole, isTheme, randomTheme, rollRole } from './theme.ts';
import { identityLabel, resolveTheme } from './resolve.ts';

describe('theme documents and role rules', () => {
  it('preserves the favorite and round-trips complete presets, including pair variation', () => {
    for (const p of PRESETS) expect(isTheme(JSON.parse(JSON.stringify(p.theme)))).toBe(true);
    expect(DEFAULT_THEME.colors.left.h).toBe(122.93646240234375);
    expect(DEFAULT_THEME.variation).toEqual({ warmth: 8, saturation: 0, lightness: 0, strength: 65 });
    expect(isTheme({ ...DEFAULT_THEME, version: 2 })).toBe(false);
    expect(isTheme({ ...DEFAULT_THEME, colors: [] })).toBe(false);
    expect(isTheme({ ...DEFAULT_THEME, variation: { ...DEFAULT_THEME.variation, strength: Infinity } })).toBe(false);
  });
  it('keeps a stored theme written before a surface existed and fills it from the defaults', () => {
    const { caution, ...older } = DEFAULT_THEME.surfaces;
    const stored = JSON.parse(JSON.stringify({ ...DEFAULT_THEME, surfaces: older })) as typeof DEFAULT_THEME;
    expect(caution).toBeTruthy();
    expect(isTheme(stored)).toBe(true);
    expect(resolveTheme(stored).tokens['--caution']).toBe(DEFAULT_THEME.surfaces.caution);
    expect(resolveTheme(stored).tokens['--panel']).toBe(DEFAULT_THEME.surfaces.panel);
    expect(isTheme({ ...DEFAULT_THEME, surfaces: { ...DEFAULT_THEME.surfaces, caution: 'orange' } })).toBe(false);
  });
  it('edits one named role without changing identities or mutating the preset', () => {
    const next = editRole(DEFAULT_THEME, 'drums', 'h', 410);
    expect(next.colors.drums.h).toBe(50);
    expect(next.colors.bass).toBe(DEFAULT_THEME.colors.bass);
    expect(DEFAULT_THEME.colors.drums.h).toBe(195);
    expect(editRole(next, 'primary', 's', 80).colors.primary.s).toBe(12);
    expect(editRole(next, 'signal', 'h', 280).colors.signal.h).toBe(160);
    expect(editRole(next, 'drums', 'l', NaN)).toBe(next);
  });
  it('rerolls entire identity families with green signal and separation for all six stems', () => {
    const next = randomTheme(DEFAULT_THEME, () => .5);
    expect(next.colors.drums.h).not.toBe(DEFAULT_THEME.colors.drums.h);
    expect(next.colors.primary.s).toBeLessThanOrEqual(12);
    expect(next.colors.signal.h).toBeGreaterThanOrEqual(120);
    expect(next.colors.signal.h).toBeLessThanOrEqual(160);
    const families = [...STEM_ROLES, 'left', 'right', 'signal'] as const;
    for (const a of STEM_ROLES) for (const b of families) {
      if (a === b) continue;
      const d = Math.abs(next.colors[a].h - next.colors[b].h);
      expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(30);
    }
    expect(next.variation).toBe(DEFAULT_THEME.variation);
    expect(next.surfaces).toBe(DEFAULT_THEME.surfaces);
  });
  it('rolls individual channels, preserving other channels', () => {
    for (const key of ['h', 's', 'l'] as const) {
      const next = rollRole(DEFAULT_THEME, 'bass', key, () => .2);
      for (const other of ['h', 's', 'l'] as const) if (other !== key) expect(next.colors.bass[other]).toBe(DEFAULT_THEME.colors.bass[other]);
      expect(next.colors.vocals).toBe(DEFAULT_THEME.colors.vocals);
    }
  });
  it('derives quiet labels and deck variation from the same palette, with semantic aliases', () => {
    const result = resolveTheme(DEFAULT_THEME);
    expect(result.tokens['--stem-drums-label']).toBe(identityLabel(result.colors.drums, DEFAULT_THEME.surfaces.caption));
    expect(result.tokens['--amber']).toBe(result.tokens['--primary']);
    expect(result.tokens['--caution']).toBe(DEFAULT_THEME.surfaces.caution);
    expect(result.tokens['--caution']).not.toBe(result.tokens['--primary']);
    expect(result.tokens['--signal']).not.toBe(result.tokens['--success']);
    expect(result.deckPairs[0].ink).toContain('62%');
    expect(result.deckPairs[1].ink).toContain('62%');
    expect(result.deckPairs[0].ink).not.toBe(result.deckPairs[1].ink);
    expect(result.deckPairs[0].waveform).toContain('65%');
    expect(resolveTheme({ ...DEFAULT_THEME, variation: { warmth: 0, saturation: 0, lightness: 0, strength: 0 } }).deckPairs[0].ink).toBe(resolveTheme({ ...DEFAULT_THEME, variation: { warmth: 0, saturation: 0, lightness: 0, strength: 0 } }).deckPairs[1].ink);
  });
});
