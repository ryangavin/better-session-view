import { useState, type CSSProperties } from 'react';
import { Button } from '../controls/Button.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Select } from '../controls/Select.tsx';
import { Slider } from '../controls/Slider.tsx';
import { NumberField } from '../controls/NumberField.tsx';
import type { Param } from '../param/param.ts';

import { ROLES, ROLE_NAMES, PRESETS, DEFAULT_VARIATION, color, conflicts, editRole, rollRole, randomTheme, type Theme, type ColorRole, type Tone, type DeckVariation } from './theme.ts';
import './theme.css';
const variationControls: { key: keyof DeckVariation; name: string; param: Param }[] = [
  { key: 'warmth', name: 'B/D warmth offset', param: { kind: 'float', min: -40, max: 40, defaultValue: 8, unit: 'int' } },
  { key: 'saturation', name: 'B/D saturation offset', param: { kind: 'float', min: -30, max: 30, defaultValue: 0, unit: 'int' } },
  { key: 'lightness', name: 'B/D lightness offset', param: { kind: 'float', min: -20, max: 20, defaultValue: 0, unit: 'int' } },
  { key: 'strength', name: 'Waveform color strength', param: { kind: 'float', min: 0, max: 100, defaultValue: 65, unit: 'percent' } },
];
const numberParam = (max: number): Param => ({ kind: 'float', min: 0, max, defaultValue: 0, unit: 'int' });
const HUE = numberParam(359), PERCENT = numberParam(100);


/** Controlled palette editor. The host owns presentation, persistence and reset. */
export function ThemeEditor({ theme, onChange }: { theme: Theme; onChange(theme: Theme): void }) {
  const [role, setRole] = useState<ColorRole>('primary');
  const selected = theme.colors[role], variation = theme.variation;
  const preset = PRESETS.findIndex(p => JSON.stringify(p.theme) === JSON.stringify(theme));
  const warnings = conflicts(theme);
  const edit = (key: keyof Tone, value: number) => onChange(editRole(theme, role, key, value));
  const roll = (key: keyof Tone) => onChange(rollRole(theme, role, key));
  return <div className="wdg wdg-theme-editor" role="region" aria-label="Theme editor">
      <div className="wdg-theme-toolbar"><Select name="Preset" label="Theme preset" items={[...PRESETS.map(p => p.name), 'Custom']} index={preset < 0 ? PRESETS.length : preset} onChange={i => { if (PRESETS[i]) onChange(PRESETS[i].theme); }} width={158} /><Button width={88} onPress={() => onChange(randomTheme(theme))}>Randomize</Button></div>
      <div className="wdg-theme-swatches">{ROLES.map((id) => <Toggle key={id} label={`Edit ${ROLE_NAMES[id]} color`} on={role === id} onChange={() => setRole(id)} width={118} ink={color(theme.colors[id])}>{ROLE_NAMES[id]}</Toggle>)}</div>
      <div className="wdg-theme-sample" style={{ background: color(selected) } as CSSProperties} />
      <div className="wdg-theme-values">{(['h', 's', 'l'] as const).map((key, i) => <NumberField key={key} name={['Hue', 'Saturation', 'Lightness'][i]} label={`${ROLE_NAMES[role]} ${['hue', 'saturation', 'lightness'][i]}`} param={key === 'h' ? HUE : PERCENT} width={76} value={selected[key]} onChange={value => edit(key, value)} showFill={false} />)}</div>
      <div className="wdg-theme-rolls">{(['h', 's', 'l'] as const).map((key, i) => <Button key={key} width={76} label={`Randomize ${ROLE_NAMES[role]} ${['hue', 'saturation', 'lightness'][i]}`} onPress={() => roll(key)}>{['Roll hue', 'Roll sat', 'Roll light'][i]}</Button>)}</div>
      <p>Drag or type values. Primary stays nearly neutral; signal stays green. Tune B/D relative to A/C below. Positive warmth shifts toward orange; negative shifts away.</p>
      <p>FX and trim use primary. Waveforms use a quiet tint; letters carry deck identity.</p>
      <div className="wdg-theme-variation">
        {variationControls.map(({ key, name, param }) => <Slider key={key} name={name} label={name} param={param} value={variation[key]} onChange={value => onChange({ ...theme, variation: { ...variation, [key]: value } })} orientation="horizontal" length={240} />)}
        <Button width={126} onPress={() => onChange({ ...theme, variation: { ...DEFAULT_VARIATION } })}>Reset variation</Button>
      </div>
      {warnings.length > 0 && <p role="status" className="wdg-theme-warning">{warnings.join(' ')} Stem hue families should be exclusive.</p>}
  </div>;
}
