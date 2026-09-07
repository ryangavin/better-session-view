import { useEffect, useRef, useState } from 'react';
import { Modal } from '@openflow/widgets/chrome/Modal.tsx';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { AUDIO_DEFAULTS, prepareAudioContexts, readAudioSettings, saveAudioSettings } from '../audioSettings.ts';
import type { MixerEngine } from '../play/engine.ts';
import type { Mix } from '../state.ts';
import './SettingsModal.css';
import { Segmented } from '@openflow/widgets/controls/Segmented.tsx';
import { ThemeSettings } from '../Theme.tsx';
import { NumberField } from '@openflow/widgets/controls/NumberField.tsx';
import { openflow } from '../openflow.ts';
import { outputDevice, rateChoices, supportsRate, type AudioDevice } from '../audioDevices.ts';

type OutputChooser = MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };
const LATENCY: AudioContextLatencyCategory[] = ['interactive','balanced','playback'];
const rateText = (rate:number) => `${Number((rate/1000).toFixed(4))} kHz`;
export function SettingsModal({mix,mixer,playView,onClose}:{mix:Mix;mixer:MixerEngine;playView:boolean;onClose():void}) {
  const [section,setSection]=useState(0);
  const [draft,setDraft]=useState(readAudioSettings);
  const [hardware,setHardware]=useState<AudioDevice[]>([]);
  const [rateProblem,setRateProblem]=useState('');
  const [readingRates,setReadingRates]=useState(true);
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const mounted=useRef(true);
  const media=navigator.mediaDevices as OutputChooser | undefined;
  const context=playView?mixer.audioContext:mix.audioContext;
  const applied=readAudioSettings();
  const refresh=async()=>{
    setReadingRates(true);
    try {
      const native=await openflow()?.audioDevices();
      if(mounted.current){setHardware(native??[]);setRateProblem(native?'':'Device rates are unavailable in this host.');}
    } catch {if(mounted.current){setHardware([]);setRateProblem('Could not read interface rates. Refresh devices to retry.');}}
    finally {if(mounted.current)setReadingRates(false);}
    try {const items=await media?.enumerateDevices()??[];if(mounted.current)setDevices(items.filter(d=>d.kind==='audiooutput'&&d.deviceId!=='default'&&d.deviceId!==''));}
    catch(why){if(mounted.current)setError(why instanceof Error?why.message:String(why));}
  };
  useEffect(()=>{mounted.current=true;void refresh();media?.addEventListener('devicechange',refresh);return()=>{mounted.current=false;media?.removeEventListener('devicechange',refresh);};},[]);
  const unavailable=draft.deviceId&&!devices.some(d=>d.deviceId===draft.deviceId);
  const options=[{id:'',name:'System default'},...devices.map((d,i)=>({id:d.deviceId,name:d.label||`Audio output ${i+1}`})),...(unavailable?[{id:draft.deviceId,name:'Saved output (not currently available)'}]:[])];
  const output=outputDevice(hardware,draft.deviceId,devices.find(device=>device.deviceId===draft.deviceId)?.label??'');
  const discrete=rateChoices(output);
  const continuous=output?.rates.filter(range=>range.min<range.max)??[];
  const rangeIndex=continuous.findIndex(range=>draft.sampleRate>=range.min&&draft.sampleRate<=range.max);
  const missing=draft.sampleRate!==0&&!discrete.includes(draft.sampleRate)&&rangeIndex<0;
  const rateItems=[...discrete.map(rate=>rate===0?'Device default':rateText(rate)),...continuous.map(range=>`${rateText(range.min)}–${rateText(range.max)} · custom`),...(missing?[`${rateText(draft.sampleRate)} · unavailable`]:[])];
  const rateIndex=discrete.includes(draft.sampleRate)?discrete.indexOf(draft.sampleRate):rangeIndex>=0?discrete.length+rangeIndex:rateItems.length-1;
  const unavailableRate=draft.sampleRate!==0&&(!output||!supportsRate(output,draft.sampleRate));
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
  const outputItems=options.map(device=>`${device.name}${context&&device.id===applied.deviceId?` · ${context.destination.maxChannelCount} ch`:''}`);
  const sampleItems=rateItems.map((item,index)=>context&&(discrete[index]===context.sampleRate||discrete[index]===0&&applied.sampleRate===0)?`${item}${discrete[index]===0?` · ${rateText(context.sampleRate)}`:''} · active`:item);
  const latencyItems=['Low · performance','Balanced','Stable · playback'].map((item,index)=>context&&LATENCY[index]===applied.latency?`${item} · ${latency(context.baseLatency+(context.outputLatency??0))} active`:item);
  return <Modal title="Settings" width={section===1?620:470} onClose={onClose} className={`mf-settings${section===1?' mf-settings-theme':''}`} actions={<>{section===0&&<Button onPress={()=>void apply()} disabled={busy||mix.decoding||readingRates||unavailableRate}>{busy?'Applying…':'Apply & restart audio'}</Button>}<Button onPress={onClose}>Done</Button>{section===0&&<Button className="mf-audio-defaults" onPress={()=>change(AUDIO_DEFAULTS)} disabled={busy}>Use defaults</Button>}</>}>
    <Segmented items={['Audio', 'Theme']} index={section} onChange={setSection} label="Settings section" />
    {section===1&&<ThemeSettings />}
    <div className="mf-audio-panel" hidden={section!==0}>
      <div className="mf-audio-fields">
        <div className="mf-audio-output-label">
          <span>Output interface</span>
          <Button onPress={()=>void refresh()} disabled={busy} label="Refresh devices" title="Refresh audio output devices" width={20}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M13 6a5 5 0 1 0 0 4M13 2v4H9" /></svg>
          </Button>
        </div>
        <div className="mf-audio-output-controls"><Select label="Output interface" title={context?`Active output: ${context.destination.maxChannelCount} channels. Master 1–2${context.destination.maxChannelCount>=4?'; headphones 3–4':'; separate headphones unavailable'}.`:undefined} items={outputItems} index={options.findIndex(d=>d.id===draft.deviceId)} onChange={i=>change({deviceId:options[i].id})} disabled={busy} width={280}/>{media?.selectAudioOutput&&<Button onPress={()=>void choose()} disabled={busy}>Choose device…</Button>}</div>
        <label>Sample rate</label><Select label="Sample rate" items={sampleItems} index={rateIndex} onChange={i=>{const rate=discrete[i]??continuous[i-discrete.length]?.min;if(rate!==undefined)change({sampleRate:rate});}} disabled={busy||readingRates} width={280}/>
        {rangeIndex>=0&&<><label>Custom rate (Hz)</label><NumberField label="Custom sample rate" param={{kind:'float',min:continuous[rangeIndex].min,max:continuous[rangeIndex].max,defaultValue:continuous[rangeIndex].min,unit:'int'}} value={draft.sampleRate} onChange={sampleRate=>change({sampleRate})} editable showFill={false} width={280}/></>}
        <label>Latency</label><Select label="Audio latency preference" title={context?`Active processing / output latency: ${latency(context.baseLatency)} / ${latency(context.outputLatency)}. Preferences are buffering hints.`:undefined} items={latencyItems} index={LATENCY.indexOf(draft.latency)} onChange={i=>change({latency:LATENCY[i]})} disabled={busy} width={280}/>
      </div>
      {readingRates?<p className="mf-audio-help" role="status">Reading interface sample rates…</p>:rateProblem||!output?<p className="mf-audio-help" role="status">{rateProblem||'The selected output could not be matched to a unique interface. Its supported rates are unavailable.'}</p>:<p className="mf-audio-help">Sample rates reported by {output.name}. {unavailableRate?'Choose a supported rate or Device default.':''}</p>}
      <p className="mf-audio-help">Apply restarts audio in Prep and Play, pausing playback and disconnecting Link Audio. Loaded tracks and mixer settings stay.</p>
      {mix.decoding&&<p role="status">Finish loading the Prep track before restarting audio.</p>}
      {saved&&<p className="mf-audio-success" role="status">Audio settings applied. Playback is paused.</p>}
      {error&&<p className="mf-audio-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}
