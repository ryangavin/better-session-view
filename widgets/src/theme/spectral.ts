import type { Tone } from './theme.ts';

export const SPECTRAL_NAMES = { low: 'Low frequencies', mid: 'Mid frequencies', high: 'High frequencies' } as const;
export type SpectralBand = keyof typeof SPECTRAL_NAMES;
export const SPECTRAL_BANDS = Object.keys(SPECTRAL_NAMES) as SpectralBand[];
export type SpectralEnergy = readonly [number, number, number];
export interface SpectralStyle {
  mode: 'spectral' | 'deck';
  colors: Record<SpectralBand, Tone>;
  strength: number;
}
const tone = (h: number, s: number, l: number): Tone => ({h,s,l});
export const SPECTRAL_PRESETS: {name:string; style:SpectralStyle}[] = [
  { name:'RGB', style:{mode:'spectral', strength:100, colors:{low:tone(0,155/245*100,265/510*100), mid:tone(120,155/245*100,265/510*100), high:tone(240,155/245*100,265/510*100)}} },
  { name:'Warm', style:{mode:'spectral', strength:85, colors:{low:tone(8,62,62), mid:tone(40,52,67), high:tone(65,28,83)}} },
  { name:'Ice', style:{mode:'spectral', strength:85, colors:{low:tone(235,46,58), mid:tone(197,54,66), high:tone(180,24,86)}} },
];
export const DEFAULT_SPECTRAL = SPECTRAL_PRESETS[0].style;
export const isSpectralBand = (role: string): role is SpectralBand => SPECTRAL_BANDS.includes(role as SpectralBand);
export function isSpectralStyle(value: unknown): value is SpectralStyle {
  if (!value || typeof value !== 'object') return false;
  const s = value as SpectralStyle;
  return (s.mode === 'spectral' || s.mode === 'deck') && Number.isFinite(s.strength) && s.strength >= 0 && s.strength <= 100 && !!s.colors && SPECTRAL_BANDS.every(b => {
    const t = s.colors[b];
    return t && Number.isFinite(t.h) && t.h >= 0 && t.h < 360 && Number.isFinite(t.s) && t.s >= 0 && t.s <= 100 && Number.isFinite(t.l) && t.l >= 0 && t.l <= 100;
  });
}
export function editSpectral(style: SpectralStyle, band: SpectralBand, key: keyof Tone, value: number): SpectralStyle {
  if (!Number.isFinite(value)) return style;
  const n = key === 'h' ? ((value%360)+360)%360 : Math.max(0,Math.min(100,value));
  return {...style,colors:{...style.colors,[band]:{...style.colors[band],[key]:n}}};
}
function rgb({h,s,l}:Tone): number[] {
  const a = s/100*Math.min(l/100,1-l/100);
  return [0,8,4].map(n => { const k=(n+h/30)%12; return 255*(l/100-a*Math.max(-1,Math.min(k-3,9-k,1))); });
}
/** Prepare paint once per theme change; analysis supplies energy, never baked colors. */
export function spectralPainter(style: SpectralStyle, neutral: string, silence: string) {
  const tones = SPECTRAL_BANDS.map(b => rgb(style.colors[b]));
  const floor = [0,1,2].map(c => Math.min(...tones.map(t => t[c])));
  const gray = [1,3,5].map(i => parseInt(neutral.slice(i,i+2),16));
  return (energy: SpectralEnergy): string => {
    const maximum = Math.max(...energy);
    if (maximum < .00001) return silence;
    const weights = energy.map(e => Math.sqrt(Math.max(0,e)/maximum));
    const channels = floor.map((base,c) => {
      const ink = Math.min(255,base+tones.reduce((sum,t,b) => sum+weights[b]*(t[c]-base),0));
      return Math.round(gray[c]+(ink-gray[c])*style.strength/100);
    });
    return `rgb(${channels.join(', ')})`;
  };
}
