import { expect, it } from 'vitest';
import { DEFAULT_THEME, isTheme, randomTheme } from './theme.ts';
import { resolveTheme } from './resolve.ts';
import { DEFAULT_SPECTRAL, SPECTRAL_PRESETS, editSpectral, spectralPainter } from './spectral.ts';
it('keeps saved v1 palettes intact and defaults missing spectral settings to RGB', () => {
  const {spectral: _unused, ...saved} = DEFAULT_THEME;
  expect(isTheme(saved)).toBe(true);
  expect(resolveTheme(saved).spectral).toBe(DEFAULT_SPECTRAL);
  for (const preset of SPECTRAL_PRESETS) {
    const document = {...saved,spectral:preset.style};
    expect(isTheme(JSON.parse(JSON.stringify(document)))).toBe(true);
    expect(randomTheme(document).spectral).toBe(preset.style);
  }
  for (const spectral of [null,{}, {...DEFAULT_SPECTRAL,strength:Infinity},{...DEFAULT_SPECTRAL,mode:'unknown'},{...DEFAULT_SPECTRAL,colors:{}}]) expect(isTheme({...saved,spectral})).toBe(false);
});
it('preserves the existing RGB paint and recolors the same measurements', () => {
  const paint = spectralPainter(DEFAULT_SPECTRAL,'#9ca3ad','#3a3a41');
  expect(paint([1,0,0])).toBe('rgb(210, 55, 55)');
  expect(paint([0,1,0])).toBe('rgb(55, 210, 55)');
  expect(paint([0,0,1])).toBe('rgb(55, 55, 210)');
  expect(paint([1,1,1])).toBe('rgb(210, 210, 210)');
  expect(paint([0,0,0])).toBe('#3a3a41');
  const edited = editSpectral(DEFAULT_SPECTRAL,'low','h',60);
  expect(spectralPainter(edited,'#9ca3ad','#3a3a41')([1,0,0])).toBe('rgb(210, 210, 55)');
  expect(spectralPainter({...edited,strength:0},'#9ca3ad','#3a3a41')([1,0,0])).toBe('rgb(156, 163, 173)');
  expect(edited.colors.mid).toBe(DEFAULT_SPECTRAL.colors.mid);
  expect(DEFAULT_SPECTRAL.colors.low.h).toBe(0);
});
