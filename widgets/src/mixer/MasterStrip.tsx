import { KnobStack } from './KnobStack.tsx';
import { Separator, MixerSection } from './Separator.tsx';
import { Fragment } from 'react';
import { ButtonFace } from '../controls/ButtonFace.tsx';
import { ContextControls, PowerIcon, PhonesIcon } from './ContextControls.tsx';
import { Button } from '../controls/Button.tsx';
import { Toggle } from '../controls/Toggle.tsx';
import { Knob } from '../controls/Knob.tsx';
import { Slider } from '../controls/Slider.tsx';
import { NumberField } from '../controls/NumberField.tsx';
import { Select } from '../controls/Select.tsx';
import type { MixerViewProps } from './model.ts';
import { FrameMeter } from './frames.tsx';

export function MasterStrip({ state, commands, readFrame, theme, params, externalTransport }: MixerViewProps) {
  const { running, beat, bpm, cross, masterTrim, masterFilter, masterSendA, masterSendB, masterEq } = state;
  const { level: LEVEL, trim: TRIM, send: SEND, eq: EQ, filter: FILTER, tempo: TEMPO, cross: CROSS } = params;
  return <div className="play-master-strip" aria-label="Master mixer">
      <div className="play-actions">
        {!externalTransport && <><div className="play-run-stop"><Toggle disabled={state.playbackAvailable === false} title={state.playbackAvailable === false ? 'Four-deck playback is not connected yet' : undefined} on={running} onChange={commands.setRunning} width={62}>{running ? 'Ⅱ Pause' : '▶ Run'}</Toggle>
        <Button onPress={commands.stopAll} width={62}>■ Stop</Button></div>
        <div className="play-timing" role="group" aria-label="Tempo"><NumberField name="" label="BPM" showFill={false} width={62} title="Tempo in BPM" param={TEMPO} value={bpm} onChange={value => commands.setMaster('bpm', value)} hint="The tempo the whole rig runs at. Only decks with Sync on follow it; the rest play at the speed they were recorded." /></div></>}
        <div className="play-fx-pickers">
          {(['A', 'B'] as const).map(slot => {
            const selected = slot === 'A' ? state.fxA : state.fxB;
            const effect = state.effects.find(e => e.id === selected);
            return <Fragment key={slot}><div className="play-fx-unit" role="group" aria-label={`FX ${slot}`}>
              <div className="play-fx-heading">{commands.setEffectEnabled && <ButtonFace size="medium" aria-label={`FX ${slot} enabled`} title={`Enable / bypass FX ${slot}`} aria-pressed={state.effectEnabled?.[slot]!==false} onClick={()=>commands.setEffectEnabled?.(slot,state.effectEnabled?.[slot]===false)}><PowerIcon/></ButtonFace>}
              <Select label={`FX ${slot} effect`} items={state.effects.map(e => `${slot} · ${e.name}`)} index={state.effects.findIndex(e => e.id === selected)} onChange={i => commands.setEffect(slot, state.effects[i].id)} width={100} hint={`Which effect the ${slot} send feeds. Every deck shares it, and its send knob decides how much each one hears.`} /></div>
              <div className="play-fx-params">{effect?.controls?.map(control => <Knob key={`${effect.id}-${control.id}`} name={control.name} label={`FX ${slot} ${effect.name} ${control.name}`} param={control.param} value={state.effectValues?.[slot]?.[effect.id]?.[control.id] ?? control.param.defaultValue} disabled={!commands.setEffectParam} onChange={value => commands.setEffectParam?.(slot, effect.id, control.id, value)} hint={`${control.name} on the ${effect.name} in send ${slot}. What it does depends on the effect chosen above it.`} />)}{commands.setEffectHighPass && state.effectHighPassParam && <Knob className="play-fx-highpass" name="HP" label={`FX ${slot} high pass cutoff`} param={state.effectHighPassParam} value={state.effectHighPass?.[slot] ?? 0} onChange={value=>commands.setEffectHighPass?.(slot,value)} title={state.effectHighPassHint} hint={state.effectHighPassHint} />}</div>

            </div>{slot === 'A'  && <Separator/>}</Fragment>;
          })}
        </div>
        {!externalTransport && <span className="play-clock">{String(Math.floor(beat / 4) + 1).padStart(3, '0')}<b>.{beat % 4 + 1}</b></span>}
      </div>

    <MixerSection className="play-effects">
      <Knob ink="var(--amber)" name="FX A" label="Master effects send A" param={SEND} value={masterSendA} onChange={value => commands.setMaster('masterSendA', value)} hint="How much of the whole mix reaches the FX A effect, on top of whatever the decks are sending." />
      <Knob ink="var(--amber)" name="Filter" label="Master filter" param={FILTER} value={masterFilter} onChange={value => commands.setMaster('masterFilter', value)} hint="Sweeps a filter across everything at once. Left takes the top off, right takes the bottom out, and the middle is untouched." />
      <Knob ink="var(--amber)" name="FX B" label="Master effects send B" param={SEND} value={masterSendB} onChange={value => commands.setMaster('masterSendB', value)} hint="How much of the whole mix reaches the FX B effect, on top of whatever the decks are sending." />
    </MixerSection>
    <MixerSection className="play-channel play-master-channel">

      <div className="play-level-stack">
        <div className="play-channel-fader play-master-stereo" role="group" aria-label="Master stereo output">{(['Left','Right'] as const).map((name,i)=><div key={name}><FrameMeter label={`Master ${name.toLowerCase()} output`} sample={() => readFrame().masterStereo?.[i] ?? 0}/><span>{name==='Left'?'L':'R'}</span></div>)}</div>
      </div>
      <KnobStack><Knob className="play-trim" ink="var(--amber)" name="Trim" label="Master trim" param={TRIM} value={masterTrim} onChange={value => commands.setMaster('masterTrim', value)} hint="Lifts or cuts the whole mix at the master output, up to 12 dB either way." />{['High', 'Mid', 'Low'].map((name, i) => <Knob key={name} name={name} label={`Master ${name}`} param={EQ} origin="center" value={masterEq[i]} onChange={value => commands.setMasterEq(i, value)} hint={`Lifts or cuts the ${name.toLowerCase()} band across everything. It rests at 0 dB, and cuts much further than it lifts.`} />)}</KnobStack>
    </MixerSection>
    <div className="play-master-cross">
    <div className="play-routing-section"><Separator/><div className="play-monitor-row">
    {commands.setEffectsEnabled && <div className="play-fx-global"><ContextControls label="Effects group" pressed={state.effectsEnabled!==false} title={`${state.effectsEnabled!==false?'FX sends enabled':state.effectTailing?'FX bypassed · tails decaying':'FX bypassed'} · click to toggle; right-click, Shift-click or Shift+F10 for tail controls`} onPress={()=>commands.setEffectsEnabled?.(state.effectsEnabled===false)} face={<><PowerIcon/><span>FX</span>{state.effectTailing && <span className="play-tail-dot"/>}</>}><p>Bypass stops new sends and lets existing tails decay.</p><ButtonFace size="medium" disabled={state.effectsEnabled!==false} onClick={()=>commands.clearEffectTails?.()}>Clear tails</ButtonFace></ContextControls></div>}
    {commands.setPhones && <ContextControls label="Headphone monitoring" face={<PhonesIcon/>} title="Headphone level and Cue / Master blend"><div className="play-phones-controls"><Knob name="Level" label="Headphone level" param={LEVEL} value={state.phonesLevel ?? 100} onChange={v=>commands.setPhones?.('phonesLevel',v)}/><Knob name="Cue / Master" label="Headphone Cue Master blend" param={SEND} value={state.phonesMix ?? 0} onChange={v=>commands.setPhones?.('phonesMix',v)}/></div><p>Cue is before deck faders and FX returns. Master follows the master output. Both share the same clock.</p></ContextControls>}
    </div><Separator/></div>
    <div className="play-crossfader-row"><Slider name="" label="Crossfader" showValue={false} param={CROSS} value={cross} onChange={value => commands.setMaster('cross', value)} orientation="horizontal" length="auto" display={cross === 0 ? 'Center' : `${Math.abs(cross)} ${cross < 0 ? 'A' : 'B'}`} hint="Fades between the decks assigned to A and the decks assigned to B. In the middle both are heard, and a deck set to Thru ignores it." /></div>
    </div>
  </div>;
}
