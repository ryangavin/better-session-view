import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { ControllerContext } from '../../controllers/context.ts';
import { LaunchkeyController, KNOBS } from '../../controllers/launchkey.ts';
import './controllers.css';
export function ControllerPanel() {
  const controller=useContext(ControllerContext);
  return controller?<ConnectedPanel controller={controller}/>:<p>Controller access needs the Play mixer in the main app.</p>;
}
function ConnectedPanel({controller}:{controller:LaunchkeyController}) {
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot);
  const [sysex,setSysex]=useState(state.sysex),[input,setInput]=useState(''),[output,setOutput]=useState('');
  useEffect(() => {
    if(state.inputs.length===1 && state.outputs.length===1) {setInput(state.inputs[0].id);setOutput(state.outputs[0].id);}
  }, [state.inputs, state.outputs]);
  return <div className="mf-controller">
    <h2>Launchkey MK4 · hardware prototype</h2>
    <p>Use the matching <strong>DAW Out / DAW In</strong> ports. Connect enables native Launchkey DAW mode; it does not start playback. The connection stays active when this panel closes. Switching to Prep releases it until Play resumes. Disconnect turns automatic connection off.</p>
    <div className="mf-controller-row">
      <label><input type="checkbox" checked={state.autoConnect} onChange={e=>controller.setAutoConnect(e.target.checked)}/> Auto-connect remembered Launchkey</label>
      <label><input type="checkbox" checked={sysex} disabled={state.connected||state.pending} onChange={e=>setSysex(e.target.checked)}/> Screen labels and deck colors (requests SysEx permission)</label>
      <Button label="Find MIDI ports" disabled={state.pending||state.connected} onPress={()=>void controller.scan(sysex)}>Find MIDI ports</Button>
    </div>
    <div className="mf-controller-row">
      <label>Input <select aria-label="Controller MIDI input" value={input} disabled={state.connected||state.pending} onChange={e=>setInput(e.target.value)}><option value="">Choose DAW Out</option>{state.inputs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Output <select aria-label="Controller MIDI output" value={output} disabled={state.connected||state.pending} onChange={e=>setOutput(e.target.value)}><option value="">Choose DAW In</option>{state.outputs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <Button label="Connect Launchkey" disabled={state.pending||state.connected||!input||!output} onPress={()=>void controller.connect(input,output)}>Connect Launchkey</Button>
      <Button label="Disconnect" disabled={!state.pending&&!state.connected} onPress={()=>void controller.disconnect()}>Disconnect</Button>
    </div>
    <p role="status">{state.status}</p><p>{state.wheel}</p>
    <div className="mf-controller-row" aria-label="Controller focus">{['Deck A','Deck B','Deck C','Deck D','Master'].map((name,i)=><Toggle key={name} label={name} on={state.focus===(i===4?8:i)} onChange={()=>controller.focus(i===4?8:i)} title={`${name}${state.focus===(i===4?8:i)?' (selected)':''}`}>{name}</Toggle>)}</div>
    <p>Controller focus: <strong>{state.focus===8?'Master':`Deck ${'ABCD'[state.focus]}`}</strong>. Fader buttons 1–4 select a deck; button 9 selects Master. This focus chooses what the knobs and pads control.</p>
    <p>Filter, EQ and Trim snap gently to neutral. Mod wheel: up scrubs forward, down scrubs back; a full sweep is four beats. The first movement establishes its position.</p>
    <table><tbody>
      <tr><th>Faders</th><td>1–4: deck A–D gain · 5–9: unused</td></tr>
      <tr><th>Knobs 1–8</th><td>{KNOBS.map((name,i)=>i===6&&state.focus===8?'Unused':name).join(' · ')}. Knob 8 always controls Master Trim.</td></tr>
      <tr><th>Pads, top row</th><td>1–4: quick loop · half · double · loop on/off. 5–8: unused.</td></tr>
      <tr><th>Pads, bottom row</th><td>1–5, left to right: Play/Pause (green) · hold Cue (orange) · Sync · beat back · beat forward. 6–8: unused.</td></tr>
      <tr><th>Play / Stop</th><td>Existing global Play / Stop actions. Deck pads need a loaded deck. Pads follow the selected deck and are inactive in Master focus. Play and Cue keep their colors while paused. Hold Cue and press Play to keep playing after releasing Cue.</td></tr>
    </tbody></table>
    <p>Port identity verified as Launchkey MK4 61. Physical control mapping still needs a hardware trial. No MCU or other Launchkey-generation compatibility is claimed.</p>
    <div className="mf-controller-row"><h3>Controller debug log</h3><Button label="Clear messages" onPress={controller.clearLog}>Clear messages</Button></div>
    <p aria-label="Controller rate metrics">{state.metrics}</p><pre aria-label="Controller MIDI messages">{state.messages.join('\n')||'No controller activity yet.'}</pre>
  </div>;
}
