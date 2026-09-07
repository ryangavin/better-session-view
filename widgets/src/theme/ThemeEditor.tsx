import { DEFAULT_SPECTRAL, SPECTRAL_PRESETS, SPECTRAL_NAMES, SPECTRAL_BANDS, isSpectralBand, editSpectral, type SpectralBand } from './spectral.ts';
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
  const [role, setRole] = useState<ColorRole | SpectralBand>('primary');
  const spectral = theme.spectral ?? DEFAULT_SPECTRAL;
  const selected = isSpectralBand(role) ? spectral.colors[role] : theme.colors[role], variation = theme.variation;
  const roleName = isSpectralBand(role) ? SPECTRAL_NAMES[role] : ROLE_NAMES[role];
  const spectralPreset = SPECTRAL_PRESETS.findIndex(p => JSON.stringify(p.style) === JSON.stringify(spectral));
  const preset = PRESETS.findIndex(p => JSON.stringify(p.theme) === JSON.stringify(theme));
  const warnings = conflicts(theme);
  const edit = (key: keyof Tone, value: number) => onChange(isSpectralBand(role) ? {...theme, spectral: editSpectral(spectral,role,key,value)} : editRole(theme, role, key, value));
  const roll = (key: keyof Tone) => isSpectralBand(role) ? edit(key, Math.round(Math.random() * (key === 'h' ? 359 : 100))) : onChange(rollRole(theme, role, key));
  return <div className="wdg wdg-theme-editor" role="region" aria-label="Theme editor">
      <div className="wdg-theme-toolbar"><Select name="Preset" label="Theme preset" items={[...PRESETS.map(p => p.name), 'Custom']} index={preset < 0 ? PRESETS.length : preset} onChange={i => { if (PRESETS[i]) onChange(PRESETS[i].theme); }} width={158} /><Button width={88} onPress={() => onChange(randomTheme(theme))}>Randomize</Button></div>
      <div className="wdg-theme-swatches">{ROLES.map((id) => <Toggle key={id} label={`Edit ${ROLE_NAMES[id]} color`} on={role === id} onChange={() => setRole(id)} width={118} ink={color(theme.colors[id])}>{ROLE_NAMES[id]}</Toggle>)}</div>
      <div className="wdg-theme-spectral" role="group" aria-label="Spectral waveform theme">
        <Select name="Waveform style" label="Waveform style" items={['Spectral', 'Deck color']} index={spectral.mode === 'deck' ? 1 : 0} onChange={i => onChange({...theme,spectral:{...spectral,mode:i ? 'deck' : 'spectral'}})} width={240} />
        <Select name="Spectral palette" label="Spectral palette" items={[...SPECTRAL_PRESETS.map(p => p.name),'Custom']} index={spectralPreset < 0 ? SPECTRAL_PRESETS.length : spectralPreset} onChange={i => {if(SPECTRAL_PRESETS[i]) onChange({...theme,spectral:SPECTRAL_PRESETS[i].style});}} width={240} />
        <div className="wdg-theme-band-swatches">{SPECTRAL_BANDS.map(b => <Toggle key={b} label={`Edit ${SPECTRAL_NAMES[b]} color`} on={role === b} onChange={() => setRole(b)} width={76} ink={color(spectral.colors[b])}>{b === 'low' ? 'Low' : b === 'mid' ? 'Mid' : 'High'}</Toggle>)}</div>
        <Slider name="Spectral color strength" label="Spectral color strength" param={{kind:'float',min:0,max:100,defaultValue:100,unit:'percent'}} value={spectral.strength} onChange={strength => onChange({...theme,spectral:{...spectral,strength}})} orientation="horizontal" length={240} />
      </div>
      <div className="wdg-theme-sample" style={{ background: color(selected) } as CSSProperties} />
      <div className="wdg-theme-values">{(['h', 's', 'l'] as const).map((key, i) => <NumberField key={key} name={['Hue', 'Saturation', 'Lightness'][i]} label={`${roleName} ${['hue', 'saturation', 'lightness'][i]}`} param={key === 'h' ? HUE : PERCENT} width={76} value={selected[key]} onChange={value => edit(key, value)} showFill={false} />)}</div>
      <div className="wdg-theme-rolls">{(['h', 's', 'l'] as const).map((key, i) => <Button key={key} width={76} label={`Randomize ${roleName} ${['hue', 'saturation', 'lightness'][i]}`} onPress={() => roll(key)}>{['Roll hue', 'Roll sat', 'Roll light'][i]}</Button>)}</div>
      <p>Drag or type values. Primary stays nearly neutral; signal stays green. Tune B/D relative to A/C below. Positive warmth shifts toward orange; negative shifts away.</p>
      <p>FX and trim use primary. Spectral colors describe frequencies, independently of stem identity. Deck color mode uses the deck tint; letters always carry deck identity.</p>
      <div className="wdg-theme-variation">
        {variationControls.map(({ key, name, param }) => <Slider key={key} name={name} label={name} param={param} value={variation[key]} onChange={value => onChange({ ...theme, variation: { ...variation, [key]: value } })} orientation="horizontal" length={240} />)}
        <Button width={126} onPress={() => onChange({ ...theme, variation: { ...DEFAULT_VARIATION } })}>Reset variation</Button>
      </div>
      {warnings.length > 0 && <p role="status" className="wdg-theme-warning">{warnings.join(' ')} Stem hue families should be exclusive.</p>}
  </div>;
}
