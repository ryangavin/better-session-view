import { useState, type CSSProperties } from 'react';
import { Button } from '../src/controls/Button.tsx';
import { Toggle } from '../src/controls/Toggle.tsx';
import { Select } from '../src/controls/Select.tsx';
import { Slider } from '../src/controls/Slider.tsx';
import { NumberField } from '../src/controls/NumberField.tsx';
import type { Param } from '../src/param/param.ts';

export type Tone = { h: number; s: number; l: number };
export const ROLES = ['Primary', 'Signal', 'Drums', 'Bass', 'Other', 'Vocals', 'Left decks', 'Right decks'] as const;
export type PlayTheme = Tone[];
const tone = (h: number, s: number, l: number): Tone => ({ h, s, l });
export const PRESETS: { name: string; colors: PlayTheme }[] = [
  { name: 'Current favorite', colors: [tone(220, 6, 72), tone(145, 55, 56), tone(195, 59, 61), tone(235, 56, 70), tone(280, 52, 68), tone(335, 56, 67), tone(122.93646240234375, 51.35546875, 62), tone(192.41558837890625, 86.60546875, 62.271484375)] },
  { name: 'Soft studio', colors: [tone(215, 8, 78), tone(145, 44, 59), tone(190, 46, 67), tone(230, 48, 73), tone(275, 40, 73), tone(330, 44, 72), tone(35, 35, 70), tone(85, 24, 69)] },
  { name: 'Night stage', colors: [tone(220, 6, 72), tone(145, 55, 56), tone(195, 59, 61), tone(235, 56, 70), tone(280, 52, 68), tone(335, 56, 67), tone(40, 28, 62), tone(90, 20, 61)] },
  { name: 'Porcelain', colors: [tone(40, 5, 84), tone(140, 40, 62), tone(185, 34, 74), tone(225, 37, 78), tone(270, 31, 78), tone(325, 36, 77), tone(30, 26, 76), tone(80, 20, 75)] },
];
export const color = ({ h, s, l }: Tone) => `hsl(${h} ${s}% ${l}%)`;
export type DeckVariation = { warmth: number; saturation: number; lightness: number; strength: number };
export const DEFAULT_VARIATION: DeckVariation = { warmth: 8, saturation: 0, lightness: 0, strength: 65 };
const variationControls: { key: keyof DeckVariation; name: string; param: Param }[] = [
  { key: 'warmth', name: 'B/D warmth offset', param: { kind: 'float', min: -40, max: 40, defaultValue: 8, unit: 'int' } },
  { key: 'saturation', name: 'B/D saturation offset', param: { kind: 'float', min: -30, max: 30, defaultValue: 0, unit: 'int' } },
  { key: 'lightness', name: 'B/D lightness offset', param: { kind: 'float', min: -20, max: 20, defaultValue: 0, unit: 'int' } },
  { key: 'strength', name: 'Waveform color strength', param: { kind: 'float', min: 0, max: 100, defaultValue: 65, unit: 'percent' } },
];
/** The first deck uses its role color; the second receives the live variation. */
export const deckColors = (theme: PlayTheme, variation: DeckVariation) => theme.slice(6).flatMap(t => {
  const towardWarm = ((30 - t.h + 540) % 360) - 180;
  const shift = Math.sign(towardWarm) * variation.warmth;
  return [color(t), color({ ...t, h: (t.h + shift + 360) % 360, s: Math.max(0, Math.min(100, t.s + variation.saturation)), l: Math.max(0, Math.min(100, t.l + variation.lightness)) })];
});
const numberParam = (max: number): Param => ({ kind: 'float', min: 0, max, defaultValue: 0, unit: 'int' });
const HUE = numberParam(359), PERCENT = numberParam(100);

/** A fresh hue wheel per roll, anchored on green signal, then dealt to identity roles. */
function randomTheme(): PlayTheme {
  const signalHue = 130 + Math.random() * 20;
  // Seven spaced families: one reserved for signal, six shuffled across stems/decks.
  const hues = Array.from({ length: 6 }, (_, i) => Math.round((signalHue + (i + 1) * 360 / 7 + Math.random() * 10 - 5) % 360));
  for (let i = hues.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hues[i], hues[j]] = [hues[j], hues[i]];
  }
  const saturation = 42 + Math.random() * 14;
  const lightness = 64 + Math.random() * 9;
  return [
    tone(Math.round(Math.random() * 359), Math.round(Math.random() * 10), Math.round(74 + Math.random() * 10)),
    tone(Math.round(signalHue), 48, 59),
    ...hues.map((h, i) => tone(h, Math.round(saturation - (i >= 4 ? 12 : 0)), Math.round(lightness + Math.random() * 6 - 3))),
  ];
}
function conflicts(theme: PlayTheme) {
  const messages: string[] = [];
  for (let a = 2; a < 6; a++) for (let b = 1; b < theme.length; b++) {
    if (a === b || (b >= 2 && b < a)) continue;
    const delta = Math.abs(theme[a].h - theme[b].h);
    if (theme[a].s >= 18 && theme[b].s >= 18 && Math.min(delta, 360 - delta) < 30) messages.push(`${ROLES[a]} and ${ROLES[b]} have close hue families.`);
  }
  return messages;
}
export function PlayThemePicker({ theme, onChange, variation, onVariation }: { theme: PlayTheme; onChange(theme: PlayTheme): void; variation: DeckVariation; onVariation(value: DeckVariation): void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(0);
  const selected = theme[role];
  const preset = PRESETS.findIndex(p => JSON.stringify(p.colors) === JSON.stringify(theme));
  const warnings = conflicts(theme);
  const edit = (key: keyof Tone, value: number) => onChange(theme.map((t, i) => i !== role ? t : { ...t, [key]: role === 0 && key === 's' ? Math.min(12, value) : role === 1 && key === 'h' ? Math.max(120, Math.min(160, value)) : value }));
  const roll = (key: keyof Tone) => {
    if (key === 's') { edit(key, Math.round(role === 0 ? Math.random() * 12 : 25 + Math.random() * 40)); return; }
    if (key === 'l') { edit(key, Math.round(55 + Math.random() * 25)); return; }
    for (let attempt = 0; attempt < 100; attempt++) {
      const h = Math.round(role === 1 ? 120 + Math.random() * 40 : Math.random() * 359);
      const separated = role === 0 || theme.every((other, i) => {
        if (i === role || i === 0 || (role >= 6 && i >= 6)) return true;
        const d = Math.abs(other.h - h);
        return other.s < 18 || Math.min(d, 360 - d) >= 30;
      });
      if (separated) { edit(key, h); return; }
    }
  };
  return <div className="play-theme-tools">
    <Toggle label="Show theme editor" on={open} onChange={setOpen} width={66}>Theme</Toggle>
    {open && <div className="play-theme-panel" role="region" aria-label="Mixer theme editor">
      <div className="play-theme-toolbar"><Select name="Preset" label="Theme preset" items={[...PRESETS.map(p => p.name), 'Custom']} index={preset < 0 ? PRESETS.length : preset} onChange={i => { if (PRESETS[i]) onChange(PRESETS[i].colors); }} width={158} /><Button width={88} onPress={() => onChange(randomTheme())}>Randomize</Button></div>
      <div className="play-theme-swatches">{ROLES.map((name, i) => <Toggle key={name} label={`Edit ${name} color`} on={role === i} onChange={() => setRole(i)} width={118} ink={color(theme[i])}>{name}</Toggle>)}</div>
      <div className="play-theme-sample" style={{ background: color(selected) } as CSSProperties} />
      <div className="play-theme-values">{(['h', 's', 'l'] as const).map((key, i) => <NumberField key={key} name={['Hue', 'Saturation', 'Lightness'][i]} label={`${ROLES[role]} ${['hue', 'saturation', 'lightness'][i]}`} param={key === 'h' ? HUE : PERCENT} width={76} value={selected[key]} onChange={value => edit(key, value)} showFill={false} />)}</div>
      <div className="play-theme-rolls">{(['h', 's', 'l'] as const).map((key, i) => <Button key={key} width={76} label={`Randomize ${ROLES[role]} ${['hue', 'saturation', 'lightness'][i]}`} onPress={() => roll(key)}>{['Roll hue', 'Roll sat', 'Roll light'][i]}</Button>)}</div>
      <p>Drag or type values. Primary stays nearly neutral; signal stays green. Tune B/D relative to A/C below. Positive warmth shifts toward orange; negative shifts away.</p>
      <p>FX and trim use primary. Waveforms use a quiet tint; letters carry deck identity. Reset tab restores the initial theme.</p>
      <div className="play-theme-variation">
        {variationControls.map(({ key, name, param }) => <Slider key={key} name={name} label={name} param={param} value={variation[key]} onChange={value => onVariation({ ...variation, [key]: value })} orientation="horizontal" length={240} />)}
        <Button width={126} onPress={() => onVariation(DEFAULT_VARIATION)}>Reset variation</Button>
      </div>
      {warnings.length > 0 && <p role="status" className="play-theme-warning">{warnings.join(' ')} Stem hue families should be exclusive.</p>}
    </div>}
  </div>;
}
