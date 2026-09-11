import { useCallback, useEffect, useState } from 'react';
import { Harness, Toolbar, Group } from '@openflow/widgets/debug/Harness.tsx';
import { Scope, ScopeRow } from '@openflow/widgets/debug/Scope.tsx';
import { useAxis } from '@openflow/widgets/debug/useAxis.ts';
import { useRemembered } from '@openflow/widgets/debug/useRemembered.ts';
import { Select } from '@openflow/widgets/controls/Select.tsx';
import { Button } from '@openflow/widgets/controls/Button.tsx';
import { Toggle } from '@openflow/widgets/controls/Toggle.tsx';
import type { View } from '@openflow/widgets/debug/axis.ts';
import type { Mix } from '../../state.ts';
import { LegacyRMS } from './LegacyRMS.tsx';
import { paintTopology, paintActivity, paintTime } from './topologyPaint.ts';
import type { ColorMode } from './topology.ts';
import { measure } from '../waveforms/measure.ts';
import { prepare, type Model } from './model.ts';
import './waveform-v2.css';
export function WaveformV2({mix}:{mix:Mix}){
  const songs=mix.songs.filter(s=>s.stems&&s.sources.length);
  return <Harness title="Waveform V2" className="mf-waveform-v2" subject={<Select label="Waveform V2 track" items={songs.map(s=>s.title)} index={Math.max(0,songs.findIndex(s=>s.id===mix.song?.id))} onChange={i=>{if(songs[i])mix.select(songs[i].id);}} width={240}/> }>
    {mix.song&&!mix.decoding&&mix.playable?<TrackView key={mix.song.id} mix={mix}/>:<p>{mix.audioProblem||(mix.decoding?'Decoding stems…':'Choose a separated track to view its waveform.')}</p>}
  </Harness>;
}
function TrackView({mix}:{mix:Mix}){
  const [large,setLarge]=useRemembered('mix-waveform-v2-large',false);
  const [stems,setStems]=useRemembered('mix-waveform-v2-stems',false);
  const [legacy,setLegacy]=useState(false);
  const [deckHeight]=useState(()=>Math.round(document.querySelector('.play-wave-lane')?.getBoundingClientRect().height||72));
  const [model,setModel]=useState<Model|null>(null),[error,setError]=useState('');
  const sources=mix.song!.sources,audioOf=mix.audioOf;
  useEffect(()=>{
    const cancel=new AbortController();setModel(null);setError('');
    const input=sources.flatMap(id=>{const b=audioOf(id);return b?[{id,channels:Array.from({length:b.numberOfChannels},(_,c)=>b.getChannelData(c))}]:[];});
    void measure(input,mix.rate,cancel.signal).then(data=>{if(!cancel.signal.aborted)setModel(prepare(data));}).catch(e=>{if(!cancel.signal.aborted)setError(String(e));});
    return()=>cancel.abort();
  },[sources,audioOf,mix.rate]);
  const axis=useAxis({seconds:mix.seconds,narrowest:Math.max(.1,mix.seconds/16384*100)});
  return <>
    <Toolbar>
      <Group caption="View"><Toggle width={90} on={large} onChange={setLarge}>Larger view</Toggle><Toggle width={90} on={stems} onChange={setStems}>Stem activity</Toggle></Group>
      <Group caption="Range"><Button onPress={axis.whole}>Whole track</Button><Button label="Zoom V2 in" onPress={()=>axis.zoom(.5,.5)}>+</Button><Button label="Zoom V2 out" onPress={()=>axis.zoom(2,.5)}>−</Button></Group>
    </Toolbar>
    <p className="mf-v2-note">Frequency color · same peak shape and scale. Three-band: blue lows, orange mids, pale highs. RGB: red lows, green mids, blue highs.</p>
    {error||!model?<p className="mf-v2-reading" role="status">{error||'Measuring decoded stems…'}</p>:<Scope axis={axis} labels={100}>
      <ScopeRow label="Source time" height={24} ruler draw={paintTime}/>
      <TopologyRow label="Three-band" height={deckHeight} model={model} mode="three-band"/>
      <TopologyRow label="Spectral RGB" height={deckHeight} model={model} mode="rgb"/>
      {large&&<><TopologyRow label="3-band large" height={220} model={model} mode="three-band"/><TopologyRow label="RGB large" height={220} model={model} mode="rgb"/></>}
      {stems&&model.data.stems.map((stem,i)=><ActivityRow key={stem.id} model={model} index={i}/>)}
    </Scope>}
    <p className="mf-v2-note">{deckHeight}px deck preview · decoded stem sum · fixed whole-track peak. Scroll to pan; Shift-scroll to zoom.{stems?' Separate strips: stem RMS activity, −60 to 0 dBFS.':''}</p>
    <details className="mf-v2-legacy" onToggle={e=>setLegacy(e.currentTarget.open)}><summary>Legacy RMS experiment</summary>{legacy&&<LegacyRMS mix={mix}/>}</details>
  </>;
}
function TopologyRow({label,height,model,mode}:{label:string;height:number;model:Model;mode:ColorMode}){
  const draw=useCallback((g:CanvasRenderingContext2D,v:View)=>paintTopology(g,v,model,mode),[model,mode]);
  return <ScopeRow label={label} height={height} draw={draw}/>;
}
function ActivityRow({model,index}:{model:Model;index:number}){
  const draw=useCallback((g:CanvasRenderingContext2D,v:View)=>paintActivity(g,v,model,index),[model,index]);
  return <ScopeRow label={`${model.data.stems[index].id} · RMS`} height={14} draw={draw}/>;
}
