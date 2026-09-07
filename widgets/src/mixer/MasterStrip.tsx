import { Button } from '../controls/Button.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Knob } from '../controls/Knob.tsx';
import { Slider } from '../controls/Slider.tsx';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import type { MixerViewProps } from './model.ts';
import { FrameMeter } from './frames.tsx';

export function MasterStrip({ state, commands, readFrame, theme, params, externalTransport }: MixerViewProps) {
  const { running, beat, bpm, cross, master, masterTrim, masterFilter, masterSendA, masterSendB, masterEq, quantized } = state;
  const { level: LEVEL, trim: TRIM, send: SEND, eq: EQ, filter: FILTER, tempo: TEMPO, cross: CROSS } = params;
  return <div className="play-master-strip" aria-label="Master mixer">
      <div className="play-actions">
        {!externalTransport && <><div className="play-run-stop"><Toggle disabled={state.playbackAvailable === false} title={state.playbackAvailable === false ? 'Four-deck playback is not connected yet' : undefined} on={running} onChange={commands.setRunning} width={62}>{running ? 'Ⅱ Pause' : '▶ Run'}</Toggle>
        <Button onPress={commands.stopAll} width={62}>■ Stop</Button></div>
        <div className="play-timing" role="group" aria-label="Tempo and launch timing"><NumberField name="" label="BPM" showFill={false} width={62} title="Tempo in BPM" param={TEMPO} value={bpm} onChange={value => commands.setMaster('bpm', value)} />
        <Toggle disabled={state.playbackAvailable === false} label="Quantize launches to next bar" title="Launch timing: next bar or immediate" on={quantized} onChange={commands.setQuantized} width={62}>{quantized ? '1 bar' : 'Now'}</Toggle></div></>}
        {commands.setEffectsEnabled && <div className="play-dj-timing"><button aria-label="Effects group" aria-pressed={state.effectsEnabled!==false} onClick={()=>commands.setEffectsEnabled?.(state.effectsEnabled===false)}>{state.effectsEnabled!==false?'FX group on':state.effectTailing?'FX off · tail':'FX group off'}</button><button disabled={state.effectsEnabled!==false} onClick={()=>commands.clearEffectTails?.()}>Clear tails</button></div>}
        <div className="play-fx-pickers">
          {(['A', 'B'] as const).map(slot => {
            const selected = slot === 'A' ? state.fxA : state.fxB;
            const effect = state.effects.find(e => e.id === selected);
            return <div className="play-fx-unit" key={slot} role="group" aria-label={`FX ${slot}`}>
              {commands.setEffectEnabled && <button aria-label={`FX ${slot} enabled`} aria-pressed={state.effectEnabled?.[slot]!==false} onClick={()=>commands.setEffectEnabled?.(slot,state.effectEnabled?.[slot]===false)}>FX {slot} {state.effectEnabled?.[slot]===false?'off':'on'}</button>}
              <Select label={`FX ${slot} effect`} items={state.effects.map(e => `${slot} · ${e.name}`)} index={state.effects.findIndex(e => e.id === selected)} onChange={i => commands.setEffect(slot, state.effects[i].id)} width={126} />
              <div className="play-fx-params">{effect?.controls?.map(control => <Knob key={`${effect.id}-${control.id}`} name={control.name} label={`FX ${slot} ${effect.name} ${control.name}`} param={control.param} value={state.effectValues?.[slot]?.[effect.id]?.[control.id] ?? control.param.defaultValue} disabled={!commands.setEffectParam} onChange={value => commands.setEffectParam?.(slot, effect.id, control.id, value)} />)}</div>
            </div>;
          })}
        </div>
        {!externalTransport && <span className="play-clock">{String(Math.floor(beat / 4) + 1).padStart(3, '0')}<b>.{beat % 4 + 1}</b></span>}
      </div>

    <div className="play-effects">
      <Knob ink="var(--amber)" name="FX A" label="Master effects send A" param={SEND} value={masterSendA} onChange={value => commands.setMaster('masterSendA', value)} />
      <Knob ink="var(--amber)" name="Filter" label="Master filter" param={FILTER} value={masterFilter} onChange={value => commands.setMaster('masterFilter', value)} />
      <Knob ink="var(--amber)" name="FX B" label="Master effects send B" param={SEND} value={masterSendB} onChange={value => commands.setMaster('masterSendB', value)} />
    </div>
    <div className="play-channel play-master-channel">

      <div className="play-level-stack">
        <div className="play-channel-fader"><Slider name="" label="Master level" param={LEVEL} value={master} onChange={value => commands.setMaster('master', value)} length={210} /><FrameMeter label="Master output" sample={() => readFrame().masterLevel} /></div>
      </div>
      <div className="play-eq-stack play-master-eq"><Knob className="play-trim" ink="var(--amber)" name="Trim" label="Master trim" param={TRIM} value={masterTrim} onChange={value => commands.setMaster('masterTrim', value)} />{['High', 'Mid', 'Low'].map((name, i) => <Knob key={name} name={name} label={`Master ${name}`} param={EQ} origin="center" value={masterEq[i]} onChange={value => commands.setMasterEq(i, value)} />)}</div>
    </div>
    {commands.setEffectsEnabled && <div className="play-dj-timing"><Knob name="Phones" label="Headphone level" param={LEVEL} value={state.phonesLevel ?? 100} onChange={v=>commands.setPhones?.('phonesLevel',v)}/><Knob name="Cue / Master" label="Headphone Cue Master blend" param={SEND} value={state.phonesMix ?? 0} onChange={v=>commands.setPhones?.('phonesMix',v)}/><span>Shared clock · Phones pre-fader, before FX returns</span></div>}
    <div className="play-master-cross">
    <Slider name="" label="Crossfader" showValue={false} param={CROSS} value={cross} onChange={value => commands.setMaster('cross', value)} orientation="horizontal" length={126} display={cross === 0 ? 'Center' : `${Math.abs(cross)} ${cross < 0 ? 'A' : 'B'}`} />
    </div>
  </div>;
}
