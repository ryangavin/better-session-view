import { useCallback, useEffect, useMemo, useState } from 'react';
import { Harness, Toolbar, Group } from '@openflow/widgets/debug/Harness.tsx';
import { Scope, ScopeRow } from '@openflow/widgets/debug/Scope.tsx';
import { useAxis } from '@openflow/widgets/debug/useAxis.ts';
import { useRemembered } from '@openflow/widgets/debug/useRemembered.ts';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { View } from '@openflow/widgets/debug/axis.ts';
import type { Mix } from '../../state.ts';
import { placeOf } from '../../warp.ts';
import { measure } from '../waveforms/measure.ts';
import { DEFAULTS, settingsOf, prepare, rms, db, type Model, type Settings } from './model.ts';
import { paint } from './paint.ts';
import './waveform-v2.css';
export function LegacyRMS({mix}:{mix:Mix}){
  const songs=mix.songs.filter(s=>s.stems&&s.sources.length);
  return <Harness title="Waveform V2" className="mf-waveform-v2" subject={<Select label="Waveform V2 track" items={songs.map(s=>s.title)} index={Math.max(0,songs.findIndex(s=>s.id===mix.song?.id))} onChange={i=>{if(songs[i])mix.select(songs[i].id);}} width={240}/> }>
    {mix.song&&!mix.decoding&&mix.playable?<TrackView key={mix.song.id} mix={mix}/>:<p>{mix.audioProblem||(mix.decoding?'Decoding stems…':'Choose a separated track to view its waveform.')}</p>}
  </Harness>;
}
function TrackView({mix}:{mix:Mix}){
  const [remembered,remember]=useRemembered<unknown>('mix-waveform-v2',DEFAULTS);
  const settings=useMemo(()=>settingsOf(remembered),[remembered]);
  const change=(patch:Partial<Settings>)=>remember({...settings,...patch});
  const [model,setModel]=useState<Model|null>(null),[error,setError]=useState('');
  const sources=mix.song!.sources,audioOf=mix.audioOf;
  useEffect(()=>{
    const cancel=new AbortController();setModel(null);setError('');
    const input=sources.flatMap(id=>{const b=audioOf(id);return b?[{id,channels:Array.from({length:b.numberOfChannels},(_,c)=>b.getChannelData(c))}]:[];});
    void measure(input,mix.rate,cancel.signal).then(data=>{if(!cancel.signal.aborted)setModel(prepare(data));}).catch(e=>{if(!cancel.signal.aborted)setError(String(e));});
    return()=>cancel.abort();
  },[sources,audioOf,mix.rate]);
  const axis=useAxis({seconds:mix.seconds,narrowest:Math.max(.1,mix.seconds/16384*100)});
  const sections=useMemo(()=>mix.slices.map(s=>({name:s.name,at:placeOf(mix.grid,s.bar)*mix.seconds})),[mix.slices,mix.grid,mix.seconds]);
  const draw=useCallback((g:CanvasRenderingContext2D,v:View)=>{if(model)paint(g,v,model,settings,sections);},[model,settings,sections]);
  const other=useCallback((g:CanvasRenderingContext2D,v:View)=>{if(model)paint(g,v,model,{...settings,scale:settings.scale==='linear'?'db':'linear'},sections);},[model,settings,sections]);
  return <>
    <Toolbar>
      <Group caption="Scale"><Select label="Amplitude scale" items={['Linear','Decibels']} index={settings.scale==='db'?1:0} onChange={i=>change({scale:i?'db':'linear'})} width={95}/></Group>
      <Group caption="Center"><Select label="Energy measurement" items={['Window RMS','Peak of short RMS']} index={settings.energy==='rms'?0:1} onChange={i=>change({energy:i?'short-peak':'rms'})} width={145}/></Group>
      <Group caption="View"><Toggle on={settings.raw} onChange={raw=>change({raw})}>Raw overlay</Toggle><Toggle on={settings.compare} onChange={compare=>change({compare})}>Compare scales</Toggle><Toggle on={settings.sections} onChange={sections=>change({sections})}>Sections</Toggle></Group>
      <Group caption="Range"><Button onPress={axis.whole}>Whole track</Button><Button label="Zoom V2 in" onPress={()=>axis.zoom(.5,.5)}>+</Button><Button label="Zoom V2 out" onPress={()=>axis.zoom(2,.5)}>−</Button><Button onPress={()=>remember(DEFAULTS)}>Reset</Button></Group>
    </Toolbar>
    <div className="mf-v2-adjustments">
      <Dial label="RMS emphasis" value={settings.gain} min={-6} max={12} step={.5} text={`${settings.gain>0?'+':''}${settings.gain} dB`} onChange={gain=>change({gain})}/>
      <Dial label="Contrast" value={settings.contrast} min={.5} max={2.5} step={.05} text={`${settings.contrast.toFixed(2)}×`} onChange={contrast=>change({contrast})}/>
      <Dial label="Display floor" value={settings.floor} min={-72} max={-12} step={3} text={`${settings.floor} dB`} disabled={settings.scale==='linear'&&!settings.compare} onChange={floor=>change({floor})}/>
      <Dial label="Short RMS window" value={settings.windowMs} min={30} max={1000} step={10} text={`${settings.windowMs} ms`} disabled={settings.energy==='rms'} onChange={windowMs=>change({windowMs})}/>
    </div>
    <p className="mf-v2-reading" role="status">{error||(!model?'Measuring decoded stems…':`${model.data.seconds.toFixed(1)}s · raw RMS ${db(rms(model,0,model.data.rms.length))} · peak ${db(model.reference)} · ${Math.round(model.data.step*1000)}ms source bins`)}</p>
    {model&&<Scope axis={axis} labels={75}>
      <ScopeRow label={settings.scale==='linear'?'Linear':'Decibels'} height={320} ruler draw={draw}/>
      {settings.compare&&<ScopeRow label={settings.scale==='linear'?'Decibels':'Linear'} height={320} draw={other}/>} 
    </Scope>}
    <p className="mf-v2-note">{settings.energy==='rms'?'Center: RMS across each aligned display bucket.':'Center: highest short-window RMS within each display bucket.'} Whole-track peak reference; gain/contrast are visual only. {settings.raw?'Dashed white: raw bucket RMS on the same scale.':''}</p>
  </>;
}
function Dial({label,value,min,max,step,text,onChange,disabled=false}:{label:string;value:number;min:number;max:number;step:number;text:string;disabled?:boolean;onChange(value:number):void}){
  return <label className="mf-v2-control"><span>{label}<output>{text}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}/></label>;
}
