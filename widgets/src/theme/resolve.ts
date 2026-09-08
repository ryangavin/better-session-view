import { DEFAULT_SPECTRAL } from './spectral.ts';
import { color, DARK_SURFACES, type Theme } from './theme.ts';

/** Treatments are shared rules, independent of the chosen hues. */
export const identityLabel = (ink: string, caption = 'var(--caption)') => `color-mix(in srgb, ${ink} 45%, ${caption})`;
export function resolveTheme(theme: Theme) {
  const colors = Object.fromEntries(Object.entries(theme.colors).map(([id, tone]) => [id, color(tone)])) as Record<keyof Theme['colors'], string>;
  const s = { ...DARK_SURFACES, ...theme.surfaces }, v = theme.variation;
  const deckPairs = (['left', 'right'] as const).flatMap(side => {
    const t = theme.colors[side];
    const direction = Math.sign(((30 - t.h + 540) % 360) - 180);
    const second = { h: ((t.h + direction * v.warmth) % 360 + 360) % 360, s: Math.max(0, Math.min(100, t.s + v.saturation)), l: Math.max(0, Math.min(100, t.l + v.lightness)) };
    return [t, second].map(tone => ({ ink: color(tone), waveform: `color-mix(in srgb, ${color(tone)} ${v.strength}%, ${s.waveformBase})` }));
  });
  const tokens: Record<`--${string}`, string> = {
    '--primary': colors.primary, '--primary-hover': `color-mix(in srgb, ${colors.primary} 75%, white)`,
    '--primary-muted': `color-mix(in srgb, ${colors.primary} 50%, ${s.caption})`,
    '--on-primary': theme.colors.primary.l >= 55 ? '#000000' : '#ffffff',
    '--signal': colors.signal, '--danger': s.danger, '--success': s.success, '--info': s.info,
    '--caution': s.caution, '--caution-hover': `color-mix(in srgb, ${s.caution} 75%, white)`,
    '--bg': s.background, '--panel': s.panel, '--rail': s.rail, '--sel': s.selected,
    '--bd': s.border, '--bd2': s.borderQuiet, '--bd3': s.borderControl,
    '--fg': s.text, '--ui': s.ui, '--detail': s.detail, '--caption': s.caption, '--idle': s.idle,
    '--focus': s.focus, '--preview': s.preview,
    '--surface-control': s.control, '--surface-stats': s.stats, '--surface-cell': s.cell,
    '--surface-cell-muted': s.cellMuted, '--surface-sunken': s.sunken,
    '--surface-band': s.band, '--surface-lane-head': s.laneHead, '--surface-outside': s.outside, '--surface-manual': s.manual,
    // Transitional aliases. Unthemed apps keep palette.css's existing values.
    '--amber': colors.primary, '--red': s.danger, '--green': s.success, '--blue': s.info,
    '--alarm': s.danger,
  };
  tokens['--amber-hover'] = tokens['--primary-hover'];
  tokens['--amber-muted'] = tokens['--primary-muted'];
  for (const id of ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'] as const) {
    tokens[`--stem-${id}`] = colors[id];
    tokens[`--stem-${id}-label`] = identityLabel(colors[id], s.caption);
  }
  deckPairs.forEach((pair, i) => { tokens[`--deck-${'abcd'[i]}`] = pair.ink; tokens[`--deck-${'abcd'[i]}-waveform`] = pair.waveform; });
  const spectral = theme.spectral ?? DEFAULT_SPECTRAL;
  for (const band of ['low', 'mid', 'high'] as const) tokens[`--spectral-${band}`] = color(spectral.colors[band]);
  return { colors, deckPairs, tokens, spectral, waveformBase: s.waveformBase, waveformSilence: s.idle };
}
export type ResolvedTheme = ReturnType<typeof resolveTheme>;
