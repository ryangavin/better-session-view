import { useEffect, useRef, useState } from 'react';
import { Modal } from '@openflow/widgets/chrome/Modal.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { AUDIO_DEFAULTS, SAMPLE_RATES, prepareAudioContexts, readAudioSettings, saveAudioSettings } from '../audioSettings.ts';
import type { MixerEngine } from '../play/engine.ts';
import type { Mix } from '../state.ts';
import './SettingsModal.css';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { ThemeSettings } from '../Theme.tsx';

type OutputChooser = MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };
const LATENCY: AudioContextLatencyCategory[] = ['interactive','balanced','playback'];
const rates = ['Device default','44.1 kHz','48 kHz','88.2 kHz','96 kHz'];
export function SettingsModal({mix,mixer,playView,onClose}:{mix:Mix;mixer:MixerEngine;playView:boolean;onClose():void}) {
  const [section,setSection]=useState(0);
  const [draft,setDraft]=useState(readAudioSettings);
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const mounted=useRef(true);
  const media=navigator.mediaDevices as OutputChooser | undefined;
  const context=playView?mixer.audioContext:mix.audioContext;
  const refresh=async()=>{
    try {const items=await media?.enumerateDevices()??[];if(mounted.current)setDevices(items.filter(d=>d.kind==='audiooutput'&&d.deviceId!=='default'&&d.deviceId!==''));}
    catch(why){if(mounted.current)setError(why instanceof Error?why.message:String(why));}
  };
  useEffect(()=>{mounted.current=true;void refresh();media?.addEventListener('devicechange',refresh);return()=>{mounted.current=false;media?.removeEventListener('devicechange',refresh);};},[]);
  const unavailable=draft.deviceId&&!devices.some(d=>d.deviceId===draft.deviceId);
  const options=[{id:'',name:'System default'},...devices.map((d,i)=>({id:d.deviceId,name:d.label||`Audio output ${i+1}`})),...(unavailable?[{id:draft.deviceId,name:'Saved output (not currently available)'}]:[])];
  const change=(patch:Partial<typeof draft>)=>{setDraft(value=>({...value,...patch}));setSaved(false);setError('');};
  const choose=async()=>{try{const device=await media?.selectAudioOutput?.();if(device&&mounted.current){await refresh();change({deviceId:device.deviceId});}}catch(why){if(mounted.current)setError(why instanceof Error?why.message:String(why));}};
  const apply=async()=>{
    setBusy(true);setError('');let contexts:[AudioContext,AudioContext]|null=null;
    try {
      contexts=await prepareAudioContexts(draft);
      if(!mounted.current){await Promise.all(contexts.map(ctx=>ctx.close()));return;}
      saveAudioSettings(draft);
      mix.pauseForView();
      mix.replaceAudioContext(contexts[0]);mixer.replaceAudioContext(contexts[1]);contexts=null;
      setSaved(true);
    }catch(why){if(contexts)await Promise.all(contexts.map(ctx=>ctx.close().catch(()=>{})));if(mounted.current)setError(why instanceof Error?why.message:String(why));}
    finally{if(mounted.current)setBusy(false);}
  };
  const latency=(value:number|undefined)=>value===undefined?'Not reported':`${(value*1000).toFixed(1)} ms`;
  return <Modal title="Settings" width={470} onClose={onClose} className="mf-settings" actions={<>{section===0&&<Button onPress={()=>void apply()} disabled={busy||mix.decoding}>{busy?'Applying…':'Apply & restart audio'}</Button>}<Button onPress={onClose}>Done</Button></>}>
    <Segmented items={['Audio', 'Theme']} index={section} onChange={setSection} label="Settings section" />
    {section===1&&<ThemeSettings />}
    <div className="mf-audio-panel" hidden={section!==0}>
      <div className="mf-audio-fields">
        <label>Output interface</label><Select label="Output interface" items={options.map(d=>d.name)} index={options.findIndex(d=>d.id===draft.deviceId)} onChange={i=>change({deviceId:options[i].id})} disabled={busy} width={280}/>
        <span/><div className="mf-audio-device-actions"><Button onPress={()=>void refresh()} disabled={busy}>Refresh devices</Button>{media?.selectAudioOutput&&<Button onPress={()=>void choose()} disabled={busy}>Choose device…</Button>}</div>
        <label>Sample rate</label><Select label="Sample rate" items={rates} index={SAMPLE_RATES.indexOf(draft.sampleRate)} onChange={i=>change({sampleRate:SAMPLE_RATES[i]})} disabled={busy} width={280}/>
        <label>Latency</label><Select label="Audio latency preference" items={['Low · performance','Balanced','Stable · playback']} index={LATENCY.indexOf(draft.latency)} onChange={i=>change({latency:LATENCY[i]})} disabled={busy} width={280}/>
      </div>
      <p className="mf-audio-help">Applies to Prep and Play. Restarting pauses playback and disconnects Link Audio; loaded tracks, positions and mixer settings are kept.</p>
      <dl className="mf-audio-status">
        <dt>Active engine</dt><dd>{playView?'Play':'Prep'}{context?'':' · not opened yet'}</dd>
        <dt>Actual sample rate</dt><dd>{context?`${(context.sampleRate/1000).toLocaleString()} kHz`:'Opens on first use'}</dd>
        <dt>Output channels</dt><dd>{context?`${context.destination.maxChannelCount} available`:'—'}</dd>
        <dt>Processing / output latency</dt><dd>{context?`${latency(context.baseLatency)} / ${latency(context.outputLatency)}`:'—'}</dd>
        <dt>Master / headphones</dt><dd>{context&&context.destination.maxChannelCount>=4?'1–2 / 3–4':'1–2 / separate output unavailable'}</dd>
      </dl>
      <p className="mf-audio-help">The rate and latency preference configure this app. Exact hardware buffer sizes, clock source and aggregate devices are managed in macOS Audio MIDI Setup or your interface’s driver.</p>
      {!devices.length&&<p className="mf-audio-help">Only the system output is visible. Connect an interface and refresh; browsers may require output-device permission before listing other devices.</p>}
      <div className="mf-audio-device-actions"><Button onPress={()=>change(AUDIO_DEFAULTS)} disabled={busy}>Use defaults</Button></div>
      {mix.decoding&&<p role="status">Finish loading the Prep track before restarting audio.</p>}
      {saved&&<p className="mf-audio-success" role="status">Audio settings applied. Playback is paused.</p>}
      {error&&<p className="mf-audio-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}
