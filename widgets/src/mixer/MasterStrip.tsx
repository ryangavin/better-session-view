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
        {!externalTransport && <><div className="play-run-stop"><Toggle disabled={state.playbackAvailable === false} hint="Runs or pauses every loaded deck together. A deck paused on its own stays paused." title={state.playbackAvailable === false ? 'Four-deck playback is not connected yet' : undefined} on={running} onChange={commands.setRunning} width={62}>{running ? 'Ⅱ Pause' : '▶ Run'}</Toggle>
        <Button onPress={commands.stopAll} hint="Stops every deck, returns them all to the start, and drops the loops and sections they were holding." width={62}>■ Stop</Button></div>
        <div className="play-timing" role="group" aria-label="Tempo and launch timing"><NumberField name="" label="BPM" showFill={false} width={62} hint="The tempo the whole rig runs at. Only decks with Sync on follow it; the rest play at the speed they were recorded." title="Tempo in BPM" param={TEMPO} value={bpm} onChange={value => commands.setMaster('bpm', value)} />
        <Toggle disabled={state.playbackAvailable === false} label="Quantize launches to next bar" hint="Whether a section you launch waits for the top of the next bar or starts the instant you press it." title="Launch timing: next bar or immediate" on={quantized} onChange={commands.setQuantized} width={62}>{quantized ? '1 bar' : 'Now'}</Toggle></div></>}
        <div className="play-fx-pickers">
          {(['A', 'B'] as const).map(slot => {
            const selected = slot === 'A' ? state.fxA : state.fxB;
            const effect = state.effects.find(e => e.id === selected);
            return <div className="play-fx-unit" key={slot} role="group" aria-label={`FX ${slot}`}>
              <Select label={`FX ${slot} effect`} hint={`Which effect the ${slot} send feeds. Every deck shares it, and its send knob decides how much each one hears.`} items={state.effects.map(e => `${slot} · ${e.name}`)} index={state.effects.findIndex(e => e.id === selected)} onChange={i => commands.setEffect(slot, state.effects[i].id)} width={126} />
              <div className="play-fx-params">{effect?.controls?.map(control => <Knob key={`${effect.id}-${control.id}`} name={control.name} hint={`${control.name} on the ${effect.name} in send ${slot}. What it does depends on the effect chosen above it.`} label={`FX ${slot} ${effect.name} ${control.name}`} param={control.param} value={state.effectValues?.[slot]?.[effect.id]?.[control.id] ?? control.param.defaultValue} disabled={!commands.setEffectParam} onChange={value => commands.setEffectParam?.(slot, effect.id, control.id, value)} />)}</div>
            </div>;
          })}
        </div>
        {!externalTransport && <span className="play-clock">{String(Math.floor(beat / 4) + 1).padStart(3, '0')}<b>.{beat % 4 + 1}</b></span>}
      </div>

    <div className="play-effects">
      <Knob ink="var(--amber)" name="FX A" hint="How much of the whole mix reaches the FX A effect, on top of whatever the decks are sending." label="Master effects send A" param={SEND} value={masterSendA} onChange={value => commands.setMaster('masterSendA', value)} />
      <Knob ink="var(--amber)" name="Filter" hint="Sweeps a filter across everything at once. Left takes the top off, right takes the bottom out, and the middle is untouched." label="Master filter" param={FILTER} value={masterFilter} onChange={value => commands.setMaster('masterFilter', value)} />
      <Knob ink="var(--amber)" name="FX B" hint="How much of the whole mix reaches the FX B effect, on top of whatever the decks are sending." label="Master effects send B" param={SEND} value={masterSendB} onChange={value => commands.setMaster('masterSendB', value)} />
    </div>
    <div className="play-channel play-master-channel">

      <div className="play-level-stack">
        <div className="play-channel-fader"><Slider name="" hint="The level everything leaves at. The top of its travel is unity, so it only ever takes away — Trim is where a quiet mix gets louder." label="Master level" param={LEVEL} value={master} onChange={value => commands.setMaster('master', value)} length={210} /><FrameMeter label="Master output" sample={() => readFrame().masterLevel} /></div>
      </div>
      <div className="play-eq-stack play-master-eq"><Knob className="play-trim" ink="var(--amber)" name="Trim" hint="Lifts or cuts the whole mix before the master fader, up to 12 dB either way." label="Master trim" param={TRIM} value={masterTrim} onChange={value => commands.setMaster('masterTrim', value)} />{['High', 'Mid', 'Low'].map((name, i) => <Knob key={name} name={name} hint={`Lifts or cuts the ${name.toLowerCase()} band across everything. It rests at 0 dB, and cuts much further than it lifts.`} label={`Master ${name}`} param={EQ} origin="center" value={masterEq[i]} onChange={value => commands.setMasterEq(i, value)} />)}</div>
    </div>
    <div className="play-master-cross">
    <Slider name="" label="Crossfader" hint="Fades between the decks assigned to A and the decks assigned to B. In the middle both are heard, and a deck set to Thru ignores it." showValue={false} param={CROSS} value={cross} onChange={value => commands.setMaster('cross', value)} orientation="horizontal" length={126} display={cross === 0 ? 'Center' : `${Math.abs(cross)} ${cross < 0 ? 'A' : 'B'}`} />
    </div>
  </div>;
}
