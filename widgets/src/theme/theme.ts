import { DEFAULT_SPECTRAL, isSpectralStyle, type SpectralStyle } from './spectral.ts';
/** Serializable palette decisions. No React, storage, app or playback dependencies. */
export type Tone = { h: number; s: number; l: number };
export const ROLE_NAMES = {
  primary: 'Primary', signal: 'Signal',
  drums: 'Drums', bass: 'Bass', other: 'Other', vocals: 'Vocals',
  left: 'Left decks', right: 'Right decks', guitar: 'Guitar', piano: 'Piano',
} as const;
export type ColorRole = keyof typeof ROLE_NAMES;
export const ROLES = Object.keys(ROLE_NAMES) as ColorRole[];
export const STEM_ROLES = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'] as const;
export type DeckVariation = { warmth: number; saturation: number; lightness: number; strength: number };
export const DEFAULT_VARIATION: DeckVariation = { warmth: 8, saturation: 0, lightness: 0, strength: 65 };
export const DARK_SURFACES = {
  background: '#0a0a0b', panel: '#111113', rail: '#0e0e10', selected: '#1c1c20',
  border: '#262629', borderQuiet: '#232327', borderControl: '#2c2c31',
  text: '#ececed', ui: '#b7b7be', detail: '#8b8b93', caption: '#5e5e66', idle: '#3a3a41',
  control: '#151517', stats: '#121214', cell: '#18181b', cellMuted: '#131316', sunken: '#101012',
  focus: '#4a4a52', danger: '#d4544f', success: '#5fbfa8', info: '#4da6d9', caution: '#f0b23c', preview: '#b58fd6',
  band: '#0c0c0e', laneHead: '#191920', outside: '#16161bb3', manual: '#17171c',
  waveformBase: '#9ca3ad',
};
export type Theme = {
  version: 1;
  colors: Record<ColorRole, Tone>;
  surfaces: typeof DARK_SURFACES;
  variation: DeckVariation;
  /** Optional for existing v1 documents; absence uses the original RGB style. */
  spectral?: SpectralStyle;
};
const tone = (h: number, s: number, l: number): Tone => ({ h, s, l });
const PALETTES = [
  { name: 'Current favorite', colors: {
    primary: tone(220, 6, 72), signal: tone(145, 55, 56), drums: tone(195, 59, 61), bass: tone(235, 56, 70), other: tone(280, 52, 68), vocals: tone(335, 56, 67), left: tone(122.93646240234375, 51.35546875, 62), right: tone(192.41558837890625, 86.60546875, 62.271484375)
  } },
  { name: 'Soft studio', colors: {
    primary: tone(215, 8, 78), signal: tone(145, 44, 59), drums: tone(190, 46, 67), bass: tone(230, 48, 73), other: tone(275, 40, 73), vocals: tone(330, 44, 72), left: tone(35, 35, 70), right: tone(85, 24, 69)
  } },
  { name: 'Night stage', colors: {
    primary: tone(220, 6, 72), signal: tone(145, 55, 56), drums: tone(195, 59, 61), bass: tone(235, 56, 70), other: tone(280, 52, 68), vocals: tone(335, 56, 67), left: tone(40, 28, 62), right: tone(90, 20, 61)
  } },
  { name: 'Porcelain', colors: {
    primary: tone(40, 5, 84), signal: tone(140, 40, 62), drums: tone(185, 34, 74), bass: tone(225, 37, 78), other: tone(270, 31, 78), vocals: tone(325, 36, 77), left: tone(30, 26, 76), right: tone(80, 20, 75)
  } },
];
export const PRESETS: { name: string; theme: Theme }[] = PALETTES.map(p => ({
  name: p.name,
  theme: { version: 1, colors: { ...p.colors, guitar: tone(25, 48, 66), piano: tone(65, 42, 68) },
    surfaces: { ...DARK_SURFACES }, variation: { ...DEFAULT_VARIATION }, spectral: DEFAULT_SPECTRAL },
}));
export const DEFAULT_THEME = PRESETS[0].theme;
export const color = ({ h, s, l }: Tone) => `hsl(${h} ${s}% ${l}%)`;
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const hue = (h: number) => ((h % 360) + 360) % 360;
export function editRole(theme: Theme, role: ColorRole, key: keyof Tone, value: number): Theme {
  if (!Number.isFinite(value)) return theme;
  const n = key === 'h' ? (role === 'signal' ? clamp(value, 120, 160) : hue(value)) : clamp(value, 0, role === 'primary' && key === 's' ? 12 : 100);
  return { ...theme, colors: { ...theme.colors, [role]: { ...theme.colors[role], [key]: n } } };
}
const distance = (a: number, b: number) => Math.min(Math.abs(hue(a) - hue(b)), 360 - Math.abs(hue(a) - hue(b)));
/** Fresh families for all six stems and both deck sides, with green reserved for signal. */
export function randomTheme(theme: Theme, random = Math.random): Theme {
  const signalHue = 130 + random() * 20;
  const hues = Array.from({ length: 8 }, (_, i) => hue(signalHue + (i + 1) * 40 + random() * 6 - 3));
  for (let i = hues.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [hues[i], hues[j]] = [hues[j], hues[i]];
  }
  const saturation = 42 + random() * 14, lightness = 64 + random() * 9;
  const colors = { ...theme.colors, primary: tone(random() * 359, random() * 10, 74 + random() * 10), signal: tone(signalHue, 48, 59) };
  ROLES.filter(r => r !== 'primary' && r !== 'signal').forEach((role, i) => {
    colors[role] = tone(hues[i], saturation - (role === 'left' || role === 'right' ? 12 : 0), lightness + random() * 6 - 3);
  });
  return { ...theme, colors };
}
export function rollRole(theme: Theme, role: ColorRole, key: keyof Tone, random = Math.random): Theme {
  if (key === 's') return editRole(theme, role, key, Math.round(role === 'primary' ? random() * 12 : 25 + random() * 40));
  if (key === 'l') return editRole(theme, role, key, Math.round(55 + random() * 25));
  // Pick among every valid degree; crowded manual palettes never silently no-op.
  const candidates = Array.from({ length: role === 'signal' ? 41 : 360 }, (_, i) => role === 'signal' ? i + 120 : i);
  const score = (h: number) => Math.min(180, ...ROLES.filter(r => r !== role && r !== 'primary' && theme.colors[r].s >= 18 && !( ['left', 'right'].includes(role) && ['left', 'right'].includes(r))).map(r => distance(h, theme.colors[r].h)));
  const valid = role === 'primary' ? candidates : candidates.filter(h => score(h) >= 30);
  const best = valid.length ? valid : candidates.filter(h => score(h) === Math.max(...candidates.map(score)));
  return editRole(theme, role, key, best[Math.floor(random() * best.length)]);
}
export function conflicts(theme: Theme): string[] {
  const messages: string[] = [];
  for (const a of STEM_ROLES) for (const b of ROLES) {
    if (a === b || b === 'primary' || (STEM_ROLES.includes(b as typeof STEM_ROLES[number]) && ROLES.indexOf(b) < ROLES.indexOf(a))) continue;
    if (theme.colors[a].s >= 18 && theme.colors[b].s >= 18 && distance(theme.colors[a].h, theme.colors[b].h) < 30) messages.push(`${ROLE_NAMES[a]} and ${ROLE_NAMES[b]} have close hue families.`);
  }
  return messages;
}
/** Accept only complete, finite v1 documents; storage and fallback decisions belong to the host. */
export function isTheme(value: unknown): value is Theme {
  if (!value || typeof value !== 'object') return false;
  const t = value as Theme;
  return t.version === 1 && (t.spectral === undefined || isSpectralStyle(t.spectral)) && !!t.colors && ROLES.every(r => {
    const c = t.colors[r];
    return c && Number.isFinite(c.h) && c.h >= 0 && c.h < 360 && Number.isFinite(c.s) && c.s >= 0 && c.s <= (r === 'primary' ? 12 : 100) && Number.isFinite(c.l) && c.l >= 0 && c.l <= 100 && (r !== 'signal' || c.h >= 120 && c.h <= 160);
  }) && !!t.surfaces && Object.keys(DARK_SURFACES).every(k => {
    // A document written before a surface existed keeps its other choices; resolve fills the gap.
    const v = t.surfaces[k as keyof typeof DARK_SURFACES];
    return v === undefined || typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v);
  }) && !!t.variation && Object.entries({warmth: [-40,40], saturation: [-30,30], lightness: [-20,20], strength: [0,100]}).every(([k, [min,max]]) => {
    const n = t.variation[k as keyof DeckVariation]; return Number.isFinite(n) && n >= min && n <= max;
  });
}
